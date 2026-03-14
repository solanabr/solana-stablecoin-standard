import { createServer, IncomingMessage, ServerResponse, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { randomUUID, createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastTriggered: string | null;
  failureCount: number;
}

interface DeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  success: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_KEY = process.env.API_KEY ?? "";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const webhooks: Map<string, Webhook> = new Map();
const deliveryLogs: DeliveryLog[] = [];

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
// HMAC-SHA256 webhook signing
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 signature for a webhook payload.
 * Recipients can verify: hmac_sha256(secret, body) === X-SSS-Signature header
 */
function computeSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

// ---------------------------------------------------------------------------
// Webhook delivery
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget: POST the event payload to the webhook URL.
 * Includes HMAC-SHA256 signature in X-SSS-Signature header.
 */
function deliverWebhook(webhook: Webhook, event: string, payload: Record<string, unknown>): void {
  const body = JSON.stringify({ event, data: payload, webhookId: webhook.id, timestamp: new Date().toISOString() });
  const signature = computeSignature(webhook.secret, body);

  const parsed = new URL(webhook.url);
  const isHttps = parsed.protocol === "https:";

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "user-agent": "stbr-webhook-service/0.1.0",
      "x-sss-signature": signature,
    },
    timeout: 10_000,
  };

  const reqFn = isHttps ? httpsRequest : httpRequest;

  const req = reqFn(options, (res) => {
    const statusCode = res.statusCode ?? 0;
    const success = statusCode >= 200 && statusCode < 300;

    deliveryLogs.push({
      id: randomUUID(),
      webhookId: webhook.id,
      event,
      payload,
      statusCode,
      success,
      timestamp: new Date().toISOString(),
    });

    webhook.lastTriggered = new Date().toISOString();
    if (!success) {
      webhook.failureCount++;
    }

    // Drain response
    res.resume();
  });

  req.on("error", (err) => {
    deliveryLogs.push({
      id: randomUUID(),
      webhookId: webhook.id,
      event,
      payload,
      statusCode: null,
      success: false,
      timestamp: new Date().toISOString(),
    });
    webhook.failureCount++;
    console.error(`Webhook delivery failed for ${webhook.id}:`, err.message);
  });

  req.write(body);
  req.end();
}

/**
 * Dispatch an event to all registered webhooks that subscribe to it.
 */
function dispatchEvent(event: string, payload: Record<string, unknown>): void {
  for (const webhook of webhooks.values()) {
    if (!webhook.active) continue;
    if (webhook.events.includes("*") || webhook.events.includes(event)) {
      deliverWebhook(webhook, event, payload);
    }
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleRegisterWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { url?: string; events?: string[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  if (!body.url || !body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return json(res, 400, { error: "Missing required fields: url, events (non-empty array)" });
  }

  // Validate URL
  try {
    new URL(body.url);
  } catch {
    return json(res, 400, { error: "Invalid webhook URL" });
  }

  // Generate a signing secret for this webhook
  const secret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

  const webhook: Webhook = {
    id: randomUUID(),
    url: body.url,
    secret,
    events: body.events,
    active: true,
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    failureCount: 0,
  };
  webhooks.set(webhook.id, webhook);

  // Return the webhook including the secret (only shown once at creation)
  return json(res, 201, webhook);
}

function handleRemoveWebhook(res: ServerResponse, id: string): void {
  if (!webhooks.has(id)) {
    return json(res, 404, { error: "Webhook not found" });
  }
  webhooks.delete(id);
  return json(res, 200, { message: "Webhook removed", id });
}

function handleListWebhooks(_req: IncomingMessage, res: ServerResponse): void {
  const entries = Array.from(webhooks.values()).map((w) => ({
    ...w,
    secret: "***", // Mask secret in list response
  }));
  return json(res, 200, { total: entries.length, data: entries });
}

/** Internal endpoint to test dispatching events. */
async function handleDispatchTest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: { event?: string; payload?: Record<string, unknown> };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  if (!body.event) {
    return json(res, 400, { error: "Missing required field: event" });
  }

  dispatchEvent(body.event, body.payload ?? {});
  return json(res, 200, { message: "Event dispatched", event: body.event });
}

function handleGetDeliveryLogs(_req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
  let results = [...deliveryLogs];

  const webhookId = query.get("webhookId");
  if (webhookId) {
    results = results.filter((l) => l.webhookId === webhookId);
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
      return json(res, 200, {
        service: "webhook-service",
        ok: true,
        uptime: process.uptime(),
        registeredWebhooks: webhooks.size,
        totalDeliveries: deliveryLogs.length,
      });
    }

    // All other endpoints require auth
    if (!checkAuth(req, res)) return;

    // POST /webhooks
    if (method === "POST" && pathname === "/webhooks") {
      return await handleRegisterWebhook(req, res);
    }

    // DELETE /webhooks/:id
    const webhookMatch = pathname.match(/^\/webhooks\/([a-f0-9-]+)$/);
    if (method === "DELETE" && webhookMatch) {
      return handleRemoveWebhook(res, webhookMatch[1]);
    }

    // GET /webhooks
    if (method === "GET" && pathname === "/webhooks") {
      return handleListWebhooks(req, res);
    }

    // POST /dispatch (internal - for testing webhook delivery)
    if (method === "POST" && pathname === "/dispatch") {
      return await handleDispatchTest(req, res);
    }

    // GET /deliveries (view delivery logs)
    if (method === "GET" && pathname === "/deliveries") {
      return handleGetDeliveryLogs(req, res, query);
    }

    // 404
    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`webhook-service listening on :${port}`);
  if (API_KEY) {
    console.log("  Bearer token auth enabled");
  } else {
    console.log("  WARNING: No API_KEY set — auth disabled");
  }
});
