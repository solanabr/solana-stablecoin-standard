/**
 * SSS Event Listener Service
 *
 * Connects to a Solana RPC websocket and subscribes to the sss-token program
 * logs. Parses Anchor events from transaction logs and outputs them as
 * structured JSON to stdout. In a production setup this would forward events
 * to a message queue (e.g. Redis Streams, NATS, Kafka).
 *
 * Usage:
 *   RPC_URL=http://localhost:8899 ts-node src/services/event-listener.ts
 */

import { Connection, PublicKey, Logs } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8899";
const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  process.env.SSS_TOKEN_PROGRAM_ID ||
    "5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4"
);
const WEBHOOK_SERVICE_URL =
  process.env.WEBHOOK_SERVICE_URL || "http://webhook-service:3001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple anchor event log prefix (base64-encoded discriminator). */
const PROGRAM_DATA_PREFIX = "Program data:";

interface ParsedEvent {
  timestamp: string;
  signature: string;
  programId: string;
  rawData: string;
}

function extractEventData(logs: string[]): string[] {
  return logs
    .filter((line) => line.includes(PROGRAM_DATA_PREFIX))
    .map((line) => {
      const idx = line.indexOf(PROGRAM_DATA_PREFIX);
      return line.slice(idx + PROGRAM_DATA_PREFIX.length).trim();
    });
}

async function dispatchToWebhookService(event: ParsedEvent): Promise<void> {
  try {
    const res = await fetch(`${WEBHOOK_SERVICE_URL}/webhook/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "program_log",
        payload: event,
      }),
    });
    if (!res.ok) {
      console.error(
        `[webhook-dispatch] Failed: ${res.status} ${res.statusText}`
      );
    }
  } catch (err) {
    // Non-fatal -- webhook service may be down
    console.error(`[webhook-dispatch] Unreachable: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let eventCount = 0;

function handleLogs(logs: Logs): void {
  if (logs.err) return; // skip failed transactions

  const eventDataEntries = extractEventData(logs.logs);
  if (eventDataEntries.length === 0) return;

  for (const rawData of eventDataEntries) {
    eventCount++;
    const event: ParsedEvent = {
      timestamp: new Date().toISOString(),
      signature: logs.signature,
      programId: SSS_TOKEN_PROGRAM_ID.toBase58(),
      rawData,
    };

    console.log(JSON.stringify(event));

    // Best-effort forward to webhook service
    dispatchToWebhookService(event).catch(() => {});
  }
}

async function start(): Promise<void> {
  console.log("=== SSS Event Listener ===");
  console.log(`RPC:     ${RPC_URL}`);
  console.log(`Program: ${SSS_TOKEN_PROGRAM_ID.toBase58()}`);
  console.log("");

  const connection = new Connection(RPC_URL, "confirmed");

  // Subscribe to program logs
  const subscriptionId = connection.onLogs(
    SSS_TOKEN_PROGRAM_ID,
    handleLogs,
    "confirmed"
  );

  console.log(`Subscribed (id=${subscriptionId}). Listening for events...`);

  // Periodic heartbeat
  setInterval(() => {
    console.log(
      `[heartbeat] ${new Date().toISOString()} | events_received=${eventCount}`
    );
  }, 30_000);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down event listener...");
    await connection.removeOnLogsListener(subscriptionId);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("Fatal error in event listener:", err);
  process.exit(1);
});
