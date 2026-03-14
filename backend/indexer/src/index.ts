import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { Socket } from "node:net";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IndexedEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  blockTime: number;
  slot: number;
  signature: string;
  timestamp: string;
}

interface TokenHolder {
  address: string;
  mint: string;
  balance: number;
  lastUpdated: string;
}

interface SupplyInfo {
  mint: string;
  totalSupply: number;
  circulatingSupply: number;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const events: IndexedEvent[] = [];
const holders: Map<string, TokenHolder> = new Map();
const supplyRecords: Map<string, SupplyInfo> = new Map();
const wsClients: Set<Socket> = new Set();

// Seed some sample data so the service is not completely empty
function seedData(): void {
  const sampleMint = "So11111111111111111111111111111111111111112";

  events.push(
    {
      id: randomUUID(),
      type: "mint",
      data: { amount: 1_000_000, recipient: "Abc123...def" },
      blockTime: Math.floor(Date.now() / 1000) - 3600,
      slot: 200_000_000,
      signature: "5KtPn1..." + randomUUID().slice(0, 8),
      timestamp: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      id: randomUUID(),
      type: "transfer",
      data: { amount: 500_000, from: "Abc123...def", to: "Xyz789...ghi" },
      blockTime: Math.floor(Date.now() / 1000) - 1800,
      slot: 200_000_100,
      signature: "3JqRm2..." + randomUUID().slice(0, 8),
      timestamp: new Date(Date.now() - 1800_000).toISOString(),
    }
  );

  holders.set("Abc123...def", {
    address: "Abc123...def",
    mint: sampleMint,
    balance: 500_000,
    lastUpdated: new Date().toISOString(),
  });
  holders.set("Xyz789...ghi", {
    address: "Xyz789...ghi",
    mint: sampleMint,
    balance: 500_000,
    lastUpdated: new Date().toISOString(),
  });

  supplyRecords.set(sampleMint, {
    mint: sampleMint,
    totalSupply: 1_000_000,
    circulatingSupply: 1_000_000,
    lastUpdated: new Date().toISOString(),
  });
}

seedData();

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

function parseUrl(req: IncomingMessage): { pathname: string; query: URLSearchParams } {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  return { pathname: url.pathname, query: url.searchParams };
}

// ---------------------------------------------------------------------------
// Minimal WebSocket helpers (RFC 6455)
// ---------------------------------------------------------------------------

function acceptWebSocket(req: IncomingMessage, socket: Socket): void {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const MAGIC = "258EAFA5-E914-47DA-95CA-5AB5A15AC5E3";
  const accept = createHash("sha1").update(key + MAGIC).digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n"
  );

  wsClients.add(socket);
  console.log(`WebSocket client connected (total: ${wsClients.size})`);

  // Send a welcome frame
  sendWsFrame(socket, JSON.stringify({ type: "connected", message: "Subscribed to live events" }));

  socket.on("data", (buf: Buffer) => {
    // Decode incoming frames (for ping/pong or text messages)
    try {
      const decoded = decodeWsFrame(buf);
      if (decoded === null) return; // control frame handled internally
      const msg = JSON.parse(decoded);
      if (msg.type === "ping") {
        sendWsFrame(socket, JSON.stringify({ type: "pong" }));
      }
    } catch {
      // ignore malformed frames
    }
  });

  socket.on("close", () => {
    wsClients.delete(socket);
    console.log(`WebSocket client disconnected (total: ${wsClients.size})`);
  });

  socket.on("error", () => {
    wsClients.delete(socket);
  });
}

function sendWsFrame(socket: Socket, data: string): void {
  const payload = Buffer.from(data, "utf-8");
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

function decodeWsFrame(buf: Buffer): string | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;

  // Close frame
  if (opcode === 0x08) return null;
  // Ping -> ignore (handled at protocol level)
  if (opcode === 0x09) return null;
  // Pong -> ignore
  if (opcode === 0x0a) return null;

  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  let maskKey: Buffer | undefined;
  if (masked) {
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  const payload = buf.subarray(offset, offset + payloadLen);
  if (masked && maskKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return payload.toString("utf-8");
}

/** Broadcast an event to all connected WebSocket clients. */
function broadcastEvent(event: IndexedEvent): void {
  const message = JSON.stringify({ type: "event", data: event });
  for (const client of wsClients) {
    try {
      sendWsFrame(client, message);
    } catch {
      wsClients.delete(client);
    }
  }
}

// ---------------------------------------------------------------------------
// Simulate periodic events (for demo purposes)
// ---------------------------------------------------------------------------

setInterval(() => {
  if (wsClients.size === 0) return;
  const event: IndexedEvent = {
    id: randomUUID(),
    type: "heartbeat",
    data: { holders: holders.size, events: events.length },
    blockTime: Math.floor(Date.now() / 1000),
    slot: 200_000_000 + events.length,
    signature: "hb-" + randomUUID().slice(0, 12),
    timestamp: new Date().toISOString(),
  };
  broadcastEvent(event);
}, 30_000);

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleGetEvents(_req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
  let results = [...events];

  const typeFilter = query.get("type");
  if (typeFilter) {
    results = results.filter((e) => e.type === typeFilter);
  }

  const limit = Math.min(Number(query.get("limit") ?? 100), 1000);
  const offset = Number(query.get("offset") ?? 0);

  const paged = results.slice(offset, offset + limit);
  return json(res, 200, { total: results.length, limit, offset, data: paged });
}

function handleGetHolders(_req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
  const mint = query.get("mint");
  if (!mint) {
    return json(res, 400, { error: "Query parameter 'mint' is required" });
  }

  let results = Array.from(holders.values()).filter((h) => h.mint === mint);

  const minBalance = Number(query.get("minBalance") ?? 0);
  if (minBalance > 0) {
    results = results.filter((h) => h.balance >= minBalance);
  }

  // Sort by balance descending
  results.sort((a, b) => b.balance - a.balance);

  return json(res, 200, { total: results.length, data: results });
}

function handleGetSupply(_req: IncomingMessage, res: ServerResponse): void {
  const records = Array.from(supplyRecords.values());
  return json(res, 200, { data: records });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 8080);

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const { pathname, query } = parseUrl(req);
  const method = (req.method ?? "GET").toUpperCase();

  try {
    // GET /events
    if (method === "GET" && pathname === "/events") {
      return handleGetEvents(req, res, query);
    }

    // GET /holders
    if (method === "GET" && pathname === "/holders") {
      return handleGetHolders(req, res, query);
    }

    // GET /supply
    if (method === "GET" && pathname === "/supply") {
      return handleGetSupply(req, res);
    }

    // GET /health
    if (method === "GET" && pathname === "/health") {
      return json(res, 200, {
        service: "indexer",
        ok: true,
        uptime: process.uptime(),
        eventsIndexed: events.length,
        holdersTracked: holders.size,
        wsClients: wsClients.size,
      });
    }

    // 404
    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
});

// Handle WebSocket upgrade on any path (typically /ws or /)
server.on("upgrade", (req: IncomingMessage, socket: Socket) => {
  acceptWebSocket(req, socket);
});

server.listen(port, () => {
  console.log(`indexer listening on :${port} (HTTP + WebSocket)`);
});
