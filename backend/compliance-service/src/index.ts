import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlacklistEntry {
  address: string;
  reason: string;
  createdAt: string;
}

interface SeizeRequest {
  id: string;
  from: string;
  to: string;
  amount: number;
  status: "pending" | "executed";
  createdAt: string;
}

interface AuditEvent {
  id: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_KEY = process.env.API_KEY ?? "";
const AUDIT_LOG_PATH = process.env.AUDIT_LOG_PATH ?? "./data/audit.ndjson";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const blacklist: Map<string, BlacklistEntry> = new Map();
const seizeRequests: SeizeRequest[] = [];
const auditEvents: AuditEvent[] = [];

// ---------------------------------------------------------------------------
// Persistent NDJSON audit log
// ---------------------------------------------------------------------------

/** Ensure the directory for the audit log exists */
function ensureLogDir(): void {
  const dir = dirname(AUDIT_LOG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Rehydrate audit events from NDJSON file on startup */
function rehydrateAuditLog(): void {
  if (!existsSync(AUDIT_LOG_PATH)) return;
  const data = readFileSync(AUDIT_LOG_PATH, "utf-8");
  for (const line of data.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event: AuditEvent = JSON.parse(line);
      auditEvents.push(event);
    } catch {
      // Skip corrupted lines
    }
  }
  console.log(`Rehydrated ${auditEvents.length} audit events from ${AUDIT_LOG_PATH}`);
}

/** Append a single audit event as NDJSON */
function persistAuditEvent(event: AuditEvent): void {
  try {
    appendFileSync(AUDIT_LOG_PATH, JSON.stringify(event) + "\n");
  } catch (err) {
    console.error("Failed to persist audit event:", err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseUrl(req: IncomingMessage): { pathname: string; query: URLSearchParams } {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return { pathname: url.pathname, query: url.searchParams };
}

function recordAudit(action: string, details: Record<string, unknown>): void {
  const event: AuditEvent = {
    id: randomUUID(),
    action,
    details,
    timestamp: new Date().toISOString(),
  };
  auditEvents.push(event);
  persistAuditEvent(event);
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/** Returns true if the request is authorized. Health endpoint is always public. */
function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!API_KEY) return true; // No auth configured
  const authHeader = req.headers.authorization ?? "";
  if (authHeader === `Bearer ${API_KEY}`) return true;
  json(res, 401, { error: "Unauthorized: invalid or missing Bearer token" });
  return false;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleAddBlacklist(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { address?: string; reason?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  if (!body.address || !body.reason) {
    return json(res, 400, { error: "Missing required fields: address, reason" });
  }

  if (blacklist.has(body.address)) {
    return json(res, 409, { error: "Address already blacklisted" });
  }

  const entry: BlacklistEntry = {
    address: body.address,
    reason: body.reason,
    createdAt: new Date().toISOString(),
  };
  blacklist.set(body.address, entry);
  recordAudit("blacklist_add", { address: body.address, reason: body.reason });
  return json(res, 201, entry);
}

function handleRemoveBlacklist(res: ServerResponse, address: string): void {
  if (!blacklist.has(address)) {
    return json(res, 404, { error: "Address not found in blacklist" });
  }
  blacklist.delete(address);
  recordAudit("blacklist_remove", { address });
  return json(res, 200, { message: "Address removed from blacklist", address });
}

function handleListBlacklist(_req: IncomingMessage, res: ServerResponse): void {
  const entries = Array.from(blacklist.values());
  return json(res, 200, { total: entries.length, data: entries });
}

async function handleSeize(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { from?: string; to?: string; amount?: number };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  if (!body.from || !body.to || body.amount == null) {
    return json(res, 400, { error: "Missing required fields: from, to, amount" });
  }

  if (typeof body.amount !== "number" || body.amount <= 0) {
    return json(res, 400, { error: "amount must be a positive number" });
  }

  const entry: SeizeRequest = {
    id: randomUUID(),
    from: body.from,
    to: body.to,
    amount: body.amount,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  seizeRequests.push(entry);
  recordAudit("seize_request", { id: entry.id, from: body.from, to: body.to, amount: body.amount });
  return json(res, 201, entry);
}

function handleAuditEvents(_req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
  let results = [...auditEvents];

  const actionFilter = query.get("action");
  if (actionFilter) {
    results = results.filter((e) => e.action === actionFilter);
  }

  const limit = Math.min(Number(query.get("limit") ?? 100), 1000);
  const offset = Number(query.get("offset") ?? 0);

  const paged = results.slice(offset, offset + limit);
  return json(res, 200, { total: results.length, limit, offset, data: paged });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 8080);

// Rehydrate on startup
ensureLogDir();
rehydrateAuditLog();

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const { pathname, query } = parseUrl(req);
  const method = (req.method ?? "GET").toUpperCase();

  try {
    // Health is always public
    if (method === "GET" && pathname === "/health") {
      return json(res, 200, {
        service: "compliance-service",
        ok: true,
        uptime: process.uptime(),
        blacklistSize: blacklist.size,
        auditEvents: auditEvents.length,
      });
    }

    // All other endpoints require auth
    if (!checkAuth(req, res)) return;

    // POST /blacklist
    if (method === "POST" && pathname === "/blacklist") {
      return await handleAddBlacklist(req, res);
    }

    // DELETE /blacklist/:address
    const blacklistMatch = pathname.match(/^\/blacklist\/(.+)$/);
    if (method === "DELETE" && blacklistMatch) {
      const address = decodeURIComponent(blacklistMatch[1]);
      return handleRemoveBlacklist(res, address);
    }

    // GET /blacklist
    if (method === "GET" && pathname === "/blacklist") {
      return handleListBlacklist(req, res);
    }

    // POST /seize
    if (method === "POST" && pathname === "/seize") {
      return await handleSeize(req, res);
    }

    // GET /audit/events
    if (method === "GET" && pathname === "/audit/events") {
      return handleAuditEvents(req, res, query);
    }

    // 404
    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`compliance-service listening on :${port}`);
  if (API_KEY) {
    console.log("  Bearer token auth enabled");
  } else {
    console.log("  WARNING: No API_KEY set — auth disabled");
  }
});
