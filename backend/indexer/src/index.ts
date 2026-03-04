import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser, Idl } from "@coral-xyz/anchor";
import pino from "pino";
import { config } from "dotenv";
import { createHash } from "crypto";
import https from "https";
import http from "http";
import { URL } from "url";

config();

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const RPC_WS_URL = process.env.RPC_WS_URL ?? "wss://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.SSS_TOKEN_PROGRAM_ID ??
    "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp",
);
const WEBHOOK_URL = process.env.WEBHOOK_URL ?? "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";

// ---------------------------------------------------------------------------
// Connection — use WS endpoint for subscriptions
// ---------------------------------------------------------------------------

const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  wsEndpoint: RPC_WS_URL,
});

// ---------------------------------------------------------------------------
// In-memory event store (replace with a DB in production)
// ---------------------------------------------------------------------------

interface EventRecord {
  id: string;
  type: string;
  data: Record<string, unknown>;
  signature: string;
  timestamp: string;
}

const eventStore: EventRecord[] = [];

// ---------------------------------------------------------------------------
// Webhook delivery
// ---------------------------------------------------------------------------

interface WebhookPayload {
  type: string;
  data: unknown;
  signature: string;
}

async function sendWebhook(event: WebhookPayload): Promise<void> {
  if (!WEBHOOK_URL) return;

  const payload = JSON.stringify({
    event: event.type,
    data: event.data,
    signature: event.signature,
    timestamp: new Date().toISOString(),
  });

  // HMAC-style signature for receiver verification
  const sig = createHash("sha256")
    .update(WEBHOOK_SECRET + payload)
    .digest("hex");

  const url = new URL(WEBHOOK_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "X-SSS-Signature": sig,
    },
  };

  return new Promise((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(options, (res) => {
      logger.info(
        { status: res.statusCode, event: event.type },
        "webhook delivered",
      );
      resolve();
    });
    req.on("error", (err) => {
      logger.error(
        { err: err.message, event: event.type },
        "webhook delivery failed",
      );
      resolve(); // non-fatal — continue indexing
    });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// IDL-aware indexer (primary)
// ---------------------------------------------------------------------------

async function startIndexer(): Promise<void> {
  logger.info(
    { programId: PROGRAM_ID.toBase58() },
    "starting SSS token indexer",
  );

  let idl: Idl;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    idl = require("../../target/idl/sss_token.json") as Idl;
  } catch {
    logger.warn("IDL not found — falling back to raw log parsing");
    startRawLogIndexer();
    return;
  }

  const eventParser = new EventParser(PROGRAM_ID, new BorshCoder(idl));

  const subscriptionId = connection.onLogs(
    PROGRAM_ID,
    async ({ logs, err, signature }) => {
      if (err) {
        logger.error({ err, signature }, "transaction error");
        return;
      }

      const events = [...eventParser.parseLogs(logs)];

      for (const event of events) {
        const eventRecord: EventRecord = {
          id: `${signature}-${event.name}`,
          type: event.name,
          data: event.data as Record<string, unknown>,
          signature,
          timestamp: new Date().toISOString(),
        };

        eventStore.push(eventRecord);
        logger.info(
          { event: event.name, data: event.data, signature },
          "SSS event indexed",
        );

        await sendWebhook({
          type: event.name,
          data: event.data,
          signature,
        });
      }
    },
    "confirmed",
  );

  logger.info({ subscriptionId }, "IDL-aware log subscription active");

  registerShutdown(() => {
    connection.removeOnLogsListener(subscriptionId);
  });
}

// ---------------------------------------------------------------------------
// Raw log indexer fallback (used when IDL is not compiled yet)
// ---------------------------------------------------------------------------

function startRawLogIndexer(): void {
  const subscriptionId = connection.onLogs(
    PROGRAM_ID,
    async ({ logs, err, signature }) => {
      if (err) return;

      logger.info(
        { logsCount: logs.length, signature },
        "program logs received",
      );

      for (const log of logs) {
        // "Program data: <base64>" lines carry Borsh-encoded event data
        if (log.startsWith("Program data: ")) {
          logger.debug({ log, signature }, "program data (potential event)");
        }
      }
    },
    "confirmed",
  );

  logger.info(
    { subscriptionId },
    "raw log subscription active (IDL-less mode)",
  );

  registerShutdown(() => {
    connection.removeOnLogsListener(subscriptionId);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown helper
// ---------------------------------------------------------------------------

function registerShutdown(cleanup: () => void): void {
  const handler = () => {
    logger.info("received shutdown signal — stopping indexer");
    cleanup();
    logger.info("indexer stopped");
    process.exit(0);
  };
  process.on("SIGTERM", handler);
  process.on("SIGINT", handler);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

startIndexer().catch((err: unknown) => {
  logger.error({ err }, "indexer crashed");
  process.exit(1);
});
