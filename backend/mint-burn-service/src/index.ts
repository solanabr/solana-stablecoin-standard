import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MintRequest {
  id: string;
  type: "mint";
  recipient: string;
  amount: number;
  minter: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface BurnRequest {
  id: string;
  type: "burn";
  amount: number;
  burner: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

type Request = MintRequest | BurnRequest;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_KEY = process.env.API_KEY ?? "";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const requests: Request[] = [];

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

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!API_KEY) return true;
  const authHeader = req.headers.authorization ?? "";
  if (authHeader === `Bearer ${API_KEY}`) return true;
  json(res, 401, { error: "Unauthorized: invalid or missing Bearer token" });
  return false;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleMintRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { recipient?: string; amount?: number; minter?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  if (!body.recipient || body.amount == null || !body.minter) {
    return json(res, 400, { error: "Missing required fields: recipient, amount, minter" });
  }

  if (typeof body.amount !== "number" || body.amount <= 0) {
    return json(res, 400, { error: "amount must be a positive number" });
  }

  const entry: MintRequest = {
    id: randomUUID(),
    type: "mint",
    recipient: body.recipient,
    amount: body.amount,
    minter: body.minter,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  requests.push(entry);
  return json(res, 201, entry);
}

async function handleBurnRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { amount?: number; burner?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  if (body.amount == null || !body.burner) {
    return json(res, 400, { error: "Missing required fields: amount, burner" });
  }

  if (typeof body.amount !== "number" || body.amount <= 0) {
    return json(res, 400, { error: "amount must be a positive number" });
  }

  const entry: BurnRequest = {
    id: randomUUID(),
    type: "burn",
    amount: body.amount,
    burner: body.burner,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  requests.push(entry);
  return json(res, 201, entry);
}

function handleListRequests(_req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
  let results: Request[] = [...requests];

  const statusFilter = query.get("status");
  if (statusFilter) {
    results = results.filter((r) => r.status === statusFilter);
  }

  const typeFilter = query.get("type");
  if (typeFilter) {
    results = results.filter((r) => r.type === typeFilter);
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

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const { pathname, query } = parseUrl(req);
  const method = (req.method ?? "GET").toUpperCase();

  try {
    // Health is always public
    if (method === "GET" && pathname === "/health") {
      return json(res, 200, { service: "mint-burn-service", ok: true, uptime: process.uptime() });
    }

    // All other endpoints require auth
    if (!checkAuth(req, res)) return;

    // POST /mint-requests
    if (method === "POST" && pathname === "/mint-requests") {
      return await handleMintRequest(req, res);
    }

    // POST /burn-requests
    if (method === "POST" && pathname === "/burn-requests") {
      return await handleBurnRequest(req, res);
    }

    // GET /requests
    if (method === "GET" && pathname === "/requests") {
      return handleListRequests(req, res, query);
    }

    // 404
    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`mint-burn-service listening on :${port}`);
  if (API_KEY) {
    console.log("  Bearer token auth enabled");
  } else {
    console.log("  WARNING: No API_KEY set — auth disabled");
  }
});
