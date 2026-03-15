import express from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import pino from "pino";
import dotenv from "dotenv";

dotenv.config({ path: "../config/.env" });

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "sss-indexer" });
const PORT = parseInt(process.env.PORT || "3002");
const app = express();
app.use(express.json());

// ─── In-Memory Index ─────────────────────────────────────────────

interface IndexedEvent {
  signature: string;
  type: string;
  mint: string;
  slot: number;
  blockTime: number | null;
  data: Record<string, unknown>;
}

const events: IndexedEvent[] = [];
let subscriptionId: number | null = null;
let connection: Connection;
let lastProcessedSlot = 0;

// ─── Event Listener ──────────────────────────────────────────────

async function startListening() {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  connection = new Connection(rpcUrl, "confirmed");

  const programId = process.env.STABLECOIN_PROGRAM_ID;
  if (!programId) {
    log.warn("STABLECOIN_PROGRAM_ID not set - indexer will not listen for events");
    return;
  }

  const programPubkey = new PublicKey(programId);

  // Subscribe to program logs
  subscriptionId = connection.onLogs(
    programPubkey,
    (logInfo) => {
      const { signature, logs } = logInfo;
      const eventType = parseEventType(logs);

      if (eventType) {
        const event: IndexedEvent = {
          signature,
          type: eventType,
          mint: programId,
          slot: 0, // Will be enriched
          blockTime: null,
          data: { logs },
        };

        events.push(event);
        log.info({ signature, type: eventType }, "Event indexed");

        // Enrichment: fetch transaction details
        enrichEvent(event, signature).catch((err) =>
          log.warn({ signature, err: err.message }, "Failed to enrich event")
        );
      }
    },
    "confirmed"
  );

  log.info({ programId }, "Listening for program events");
}

function parseEventType(logs: string[]): string | null {
  const logStr = logs.join(" ");
  if (logStr.includes("Minted")) return "mint";
  if (logStr.includes("Burned")) return "burn";
  if (logStr.includes("Froze")) return "freeze";
  if (logStr.includes("Thawed")) return "thaw";
  if (logStr.includes("paused")) return "pause";
  if (logStr.includes("unpaused")) return "unpause";
  if (logStr.includes("blacklist")) return "blacklist";
  if (logStr.includes("Seized")) return "seize";
  if (logStr.includes("Granted")) return "role_grant";
  if (logStr.includes("Revoked")) return "role_revoke";
  if (logStr.includes("initialized")) return "initialize";
  return null;
}

async function enrichEvent(event: IndexedEvent, signature: string) {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (tx) {
    event.slot = tx.slot;
    event.blockTime = tx.blockTime;
  }
}

// ─── Routes ──────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "indexer",
    uptime: process.uptime(),
    eventsIndexed: events.length,
    listening: subscriptionId !== null,
  });
});

app.get("/api/events", (req, res) => {
  const { type, limit = "50", offset = "0" } = req.query;
  let filtered = events;
  if (type) filtered = filtered.filter((e) => e.type === type);
  const start = parseInt(offset as string);
  const count = parseInt(limit as string);
  res.json({
    total: filtered.length,
    events: filtered.slice(start, start + count),
  });
});

app.get("/api/events/:signature", (req, res) => {
  const event = events.find((e) => e.signature === req.params.signature);
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json(event);
});

app.get("/api/stats", (_req, res) => {
  const typeCounts: Record<string, number> = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }
  res.json({ totalEvents: events.length, byType: typeCounts });
});

// ─── Start ───────────────────────────────────────────────────────

startListening().catch((err) => log.error({ err: err.message }, "Failed to start listener"));
app.listen(PORT, () => {
  log.info({ port: PORT }, "Indexer service started");
});

export default app;
