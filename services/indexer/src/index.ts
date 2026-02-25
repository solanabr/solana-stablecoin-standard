/**
 * SSS Indexer — subscribes to on-chain program logs, parses SSS events,
 * stores them in memory, and delivers webhook notifications.
 *
 * Environment:
 *   SERVICE_PORT       — HTTP port (default 3002)
 *   SOLANA_RPC_URL     — Solana RPC (default http://localhost:8899)
 *   SOLANA_WS_URL      — Solana WebSocket (default ws://localhost:8900)
 *   SSS_TOKEN_PROGRAM_ID — program to subscribe to
 *   API_SECRET         — if set, requires Authorization: Bearer <secret>
 */

import express, { Request, Response, NextFunction } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { randomUUID } from "crypto";
import https from "https";
import http from "http";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.SERVICE_PORT ?? "3002", 10);
const RPC  = process.env.SOLANA_RPC_URL ?? "http://localhost:8899";
const WS   = process.env.SOLANA_WS_URL  ?? "ws://localhost:8900";
const SSS_PROGRAM = process.env.SSS_TOKEN_PROGRAM_ID ?? "E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP";
const API_SECRET  = process.env.API_SECRET ?? "";
const MAX_EVENTS  = 10_000;
const START_TIME  = Date.now();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SSSEvent {
  id: string;
  mint?: string;
  action: string;
  actor?: string;
  amount?: string;
  address?: string;
  signature: string;
  slot: number;
  timestamp: string;
  raw: string;
}

interface Webhook {
  id: string;
  url: string;
  events: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// State (replace with Postgres + Redis for production)
// ---------------------------------------------------------------------------

const events: SSSEvent[] = [];
const webhooks = new Map<string, Webhook>();
let wsConnected = false;

// ---------------------------------------------------------------------------
// Event parsing — extract structured data from Anchor program log lines
// ---------------------------------------------------------------------------

const ACTION_PATTERNS: Array<{ pattern: RegExp; action: string }> = [
  { pattern: /Instruction: MintTokens/,        action: "mint" },
  { pattern: /Instruction: BurnTokens/,        action: "burn" },
  { pattern: /Instruction: FreezeAccount/,     action: "freeze" },
  { pattern: /Instruction: ThawAccount/,       action: "thaw" },
  { pattern: /Instruction: Pause/,             action: "pause" },
  { pattern: /Instruction: Unpause/,           action: "unpause" },
  { pattern: /Instruction: AddToBlacklist/,    action: "blacklist_add" },
  { pattern: /Instruction: RemoveFromBlacklist/, action: "blacklist_remove" },
  { pattern: /Instruction: Seize/,             action: "seize" },
  { pattern: /Instruction: Initialize/,        action: "initialize" },
  { pattern: /Instruction: TransferAuthority/, action: "transfer_authority" },
  { pattern: /Instruction: AddMinter/,         action: "add_minter" },
];

function parseEvent(logs: string[], signature: string, slot: number): SSSEvent | null {
  const logText = logs.join(" ");

  let action = "unknown";
  for (const { pattern, action: a } of ACTION_PATTERNS) {
    if (pattern.test(logText)) { action = a; break; }
  }
  if (action === "unknown") return null;

  const event: SSSEvent = {
    id: randomUUID(),
    action,
    signature,
    slot,
    timestamp: new Date().toISOString(),
    raw: logs.slice(0, 5).join(" | "),
  };
  return event;
}

// ---------------------------------------------------------------------------
// Solana log subscription
// ---------------------------------------------------------------------------

function startSubscription(connection: Connection): void {
  const programId = new PublicKey(SSS_PROGRAM);

  connection.onLogs(
    programId,
    (logInfo) => {
      wsConnected = true;
      const parsed = parseEvent(logInfo.logs, logInfo.signature, 0);
      if (!parsed) return;

      events.unshift(parsed);
      if (events.length > MAX_EVENTS) events.pop();

      // Deliver webhooks asynchronously
      deliverWebhooks(parsed).catch(() => { /* swallow delivery errors */ });
    },
    "confirmed"
  );

  console.log(`[indexer] subscribed to logs for program ${SSS_PROGRAM}`);
  wsConnected = true;
}

async function deliverWebhooks(event: SSSEvent): Promise<void> {
  for (const wh of webhooks.values()) {
    if (wh.events.length > 0 && !wh.events.includes(event.action)) continue;

    const payload = JSON.stringify({ event });
    const url = new URL(wh.url);
    const lib = url.protocol === "https:" ? https : http;

    await new Promise<void>((resolve) => {
      const req = lib.request(
        { hostname: url.hostname, port: url.port, path: url.pathname, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
        (res) => { res.resume(); res.on("end", resolve); }
      );
      req.on("error", () => resolve());
      req.write(payload);
      req.end();
    });
  }
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function auth(req: Request, res: Response, next: NextFunction): void {
  if (!API_SECRET) { next(); return; }
  if (req.headers.authorization === `Bearer ${API_SECRET}`) { next(); return; }
  res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED", statusCode: 401 });
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// GET /health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "indexer",
    rpc: RPC,
    connected: wsConnected,
    eventCount: events.length,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

// POST /api/v1/webhooks
app.post("/api/v1/webhooks", auth, (req: Request, res: Response) => {
  const { url, events: evtFilter = [] } = req.body as { url?: string; events?: string[] };
  if (!url) {
    res.status(400).json({ error: "url is required", code: "MISSING_FIELDS", statusCode: 400 });
    return;
  }
  const wh: Webhook = { id: randomUUID(), url, events: evtFilter, createdAt: new Date().toISOString() };
  webhooks.set(wh.id, wh);
  res.status(201).json(wh);
});

// DELETE /api/v1/webhooks/:id
app.delete("/api/v1/webhooks/:id", auth, (req: Request, res: Response) => {
  if (!webhooks.has(req.params.id)) {
    res.status(404).json({ error: "Webhook not found", code: "NOT_FOUND", statusCode: 404 });
    return;
  }
  webhooks.delete(req.params.id);
  res.status(204).send();
});

// GET /api/v1/events
app.get("/api/v1/events", auth, (req: Request, res: Response) => {
  const { mint, action, limit = "50", offset = "0" } = req.query as {
    mint?: string; action?: string; limit?: string; offset?: string;
  };

  let filtered = events;
  if (mint)   filtered = filtered.filter((e) => e.mint === mint);
  if (action) filtered = filtered.filter((e) => e.action === action);

  const off = parseInt(offset, 10);
  const lim = Math.min(parseInt(limit, 10), 500);
  const page = filtered.slice(off, off + lim);

  res.json({ events: page, total: filtered.length, offset: off, limit: lim });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const connection = new Connection(RPC, { wsEndpoint: WS, commitment: "confirmed" });

app.listen(PORT, () => {
  console.log(`[indexer] listening on port ${PORT}  rpc=${RPC}`);
  startSubscription(connection);
});

export default app;
