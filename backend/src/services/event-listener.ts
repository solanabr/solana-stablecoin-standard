/**
 * SSS Event Listener Service
 *
 * Connects to a Solana RPC websocket and subscribes to the sss-token program
 * logs. Parses Anchor events from transaction logs using BorshCoder/EventParser
 * and outputs them as structured JSON. Events are persisted to a JSONL file
 * and optionally forwarded to a webhook service.
 *
 * Usage:
 *   RPC_URL=http://localhost:8899 ts-node src/services/event-listener.ts
 */

import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

import sssTokenIdl from "../../../sdk/src/idl/sss_token.json";

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
const EVENT_LOG_PATH =
  process.env.EVENT_LOG_PATH || path.join(__dirname, "../../data/events.jsonl");

// ---------------------------------------------------------------------------
// Event Parser Setup
// ---------------------------------------------------------------------------

const coder = new BorshCoder(sssTokenIdl as any);
const eventParser = new EventParser(SSS_TOKEN_PROGRAM_ID, coder);

// ---------------------------------------------------------------------------
// Known event types
// ---------------------------------------------------------------------------

const EVENT_TYPES = new Set([
  "stablecoinInitialized",
  "tokensMinted",
  "tokensBurned",
  "accountFrozen",
  "accountThawed",
  "programPaused",
  "programUnpaused",
  "roleUpdated",
  "minterUpdated",
  "authorityTransferred",
  "blacklistAdded",
  "blacklistRemoved",
  "tokensSeized",
  "auditLogRecorded",
]);

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function ensureLogDir(): void {
  const dir = path.dirname(EVENT_LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistEvent(entry: object): void {
  try {
    fs.appendFileSync(EVENT_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error(`[persist] Failed to write event: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedEvent {
  timestamp: string;
  signature: string;
  programId: string;
  eventName: string;
  data: any;
}

async function dispatchToWebhookService(event: ParsedEvent): Promise<void> {
  try {
    const res = await fetch(`${WEBHOOK_SERVICE_URL}/webhook/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: event.eventName,
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

  // Use EventParser to decode Anchor events from logs
  const events = eventParser.parseLogs(logs.logs);

  for (const evt of events) {
    eventCount++;
    const eventName = evt.name;
    const isKnown = EVENT_TYPES.has(eventName);

    const event: ParsedEvent = {
      timestamp: new Date().toISOString(),
      signature: logs.signature,
      programId: SSS_TOKEN_PROGRAM_ID.toBase58(),
      eventName,
      data: evt.data,
    };

    // Output to stdout
    console.log(JSON.stringify(event));

    // Persist to JSONL file
    persistEvent(event);

    // Best-effort forward to webhook service
    dispatchToWebhookService(event).catch(() => {});

    if (!isKnown) {
      console.warn(`[event-listener] Unknown event type: ${eventName}`);
    }
  }
}

async function start(): Promise<void> {
  console.log("=== SSS Event Listener ===");
  console.log(`RPC:     ${RPC_URL}`);
  console.log(`Program: ${SSS_TOKEN_PROGRAM_ID.toBase58()}`);
  console.log(`Log:     ${EVENT_LOG_PATH}`);
  console.log("");

  ensureLogDir();

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
