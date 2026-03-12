import { Connection } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import express from "express";
import { logger } from "./logger";
import { EventStore } from "./store";
import { WebhookDispatcher } from "./webhook";
import { SSS_CORE_PROGRAM_ID } from "./constants";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const PORT = parseInt(process.env.PORT ?? "3002", 10);

const store = new EventStore();
const dispatcher = new WebhookDispatcher(
  process.env.WEBHOOK_URL ?? "",
  parseInt(process.env.WEBHOOK_RETRIES ?? "3", 10)
);

async function startIndexer(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");

  // Watch program logs for SSS events
  connection.onLogs(SSS_CORE_PROGRAM_ID, (logs) => {
    if (logs.err) return;

    for (const log of logs.logs) {
      const event = parseEventLog(log);
      if (!event) continue;

      store.add(event);
      logger.info("Event indexed", { type: event.type, tx: logs.signature });

      // Fire and forget webhook
      dispatcher.dispatch(event).catch((err) => {
        logger.error("Webhook dispatch failed", { error: err.message });
      });
    }
  });

  logger.info("Indexer started", { programId: SSS_CORE_PROGRAM_ID.toBase58(), rpc: RPC_URL });
}

function parseEventLog(log: string): { type: string; data: string; ts: string } | null {
  // Anchor logs events as "Program log: <base64 encoded event>"
  const match = log.match(/^Program log: (.*)/);
  if (!match) return null;
  const payload = match[1];
  // Basic extraction — a production indexer would decode the anchor event struct
  try {
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    if (decoded.includes("TokensMinted") || decoded.includes("TokensBurned") ||
        decoded.includes("AccountFrozen") || decoded.includes("AddressBlacklisted")) {
      return { type: "event", data: payload, ts: new Date().toISOString() };
    }
  } catch {
    // not a base64 event log, skip
  }
  return null;
}

// HTTP API to query indexed events
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-indexer", ts: new Date().toISOString() });
});

app.get("/events", (_req, res) => {
  res.json(store.getAll());
});

app.get("/events/:type", (req, res) => {
  res.json(store.getByType(req.params.type));
});

app.listen(PORT, () => {
  logger.info("Indexer HTTP API started", { port: PORT });
});

startIndexer().catch((err) => {
  logger.error("Indexer failed to start", { error: err.message });
  process.exit(1);
});
