import express from "express";
import pino from "pino";
import dotenv from "dotenv";
import https from "https";
import http from "http";

dotenv.config({ path: "../config/.env" });

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "sss-webhook" });
const PORT = parseInt(process.env.PORT || "3004");
const app = express();
app.use(express.json());

// ─── Types ───────────────────────────────────────────────────────

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[]; // ["mint", "burn", "blacklist", "*"]
  secret?: string;
  active: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: string;
  payload: unknown;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  responseStatus?: number;
  error?: string;
  createdAt: string;
}

const endpoints: WebhookEndpoint[] = [];
const deliveries: WebhookDelivery[] = [];

// ─── Retry Logic ─────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s, 8s, 16s (exponential backoff)

async function deliverWebhook(delivery: WebhookDelivery, endpoint: WebhookEndpoint) {
  delivery.attempts++;
  delivery.lastAttemptAt = new Date().toISOString();

  try {
    const responseStatus = await sendHttp(endpoint.url, delivery.payload, endpoint.secret);
    delivery.responseStatus = responseStatus;

    if (responseStatus >= 200 && responseStatus < 300) {
      delivery.status = "delivered";
      log.info({ deliveryId: delivery.id, status: responseStatus }, "Webhook delivered");
    } else {
      throw new Error(`HTTP ${responseStatus}`);
    }
  } catch (err: any) {
    delivery.error = err.message;
    log.warn(
      { deliveryId: delivery.id, attempt: delivery.attempts, err: err.message },
      "Webhook delivery failed"
    );

    if (delivery.attempts < delivery.maxAttempts) {
      const delay = BASE_DELAY_MS * Math.pow(2, delivery.attempts - 1);
      delivery.nextRetryAt = new Date(Date.now() + delay).toISOString();
      setTimeout(() => deliverWebhook(delivery, endpoint), delay);
    } else {
      delivery.status = "failed";
      log.error({ deliveryId: delivery.id }, "Webhook permanently failed after max retries");
    }
  }
}

function sendHttp(url: string, payload: unknown, secret?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
      "User-Agent": "SSS-Webhook/1.0",
    };
    if (secret) {
      // HMAC signature for payload verification
      const crypto = require("crypto");
      const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
      headers["X-SSS-Signature"] = `sha256=${sig}`;
    }

    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers,
        timeout: 10000,
      },
      (res) => resolve(res.statusCode || 500)
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

// ─── Routes ──────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "webhook",
    uptime: process.uptime(),
    endpoints: endpoints.filter((e) => e.active).length,
    pendingDeliveries: deliveries.filter((d) => d.status === "pending").length,
  });
});

/** Register a webhook endpoint. */
app.post("/api/endpoints", (req, res) => {
  const { url, events = ["*"], secret } = req.body;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const endpoint: WebhookEndpoint = {
    id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    url,
    events,
    secret,
    active: true,
    createdAt: new Date().toISOString(),
  };
  endpoints.push(endpoint);
  log.info({ endpointId: endpoint.id, url, events }, "Endpoint registered");
  res.status(201).json(endpoint);
});

/** List endpoints. */
app.get("/api/endpoints", (_req, res) => {
  res.json(endpoints.map(({ secret, ...ep }) => ep)); // Don't expose secrets
});

/** Delete an endpoint. */
app.delete("/api/endpoints/:id", (req, res) => {
  const idx = endpoints.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Endpoint not found" });
  endpoints[idx].active = false;
  res.json({ status: "deactivated" });
});

/** Dispatch an event to all matching endpoints. */
app.post("/api/dispatch", (req, res) => {
  const { event, payload } = req.body;
  if (!event || !payload) return res.status(400).json({ error: "Missing event or payload" });

  const matching = endpoints.filter(
    (ep) => ep.active && (ep.events.includes("*") || ep.events.includes(event))
  );

  const created: string[] = [];
  for (const ep of matching) {
    const delivery: WebhookDelivery = {
      id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      endpointId: ep.id,
      event,
      payload: { event, timestamp: new Date().toISOString(), data: payload },
      status: "pending",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      createdAt: new Date().toISOString(),
    };
    deliveries.push(delivery);
    created.push(delivery.id);

    // Fire-and-forget with retry
    deliverWebhook(delivery, ep);
  }

  log.info({ event, endpointCount: matching.length }, "Event dispatched");
  res.json({ dispatched: matching.length, deliveryIds: created });
});

/** Get delivery history. */
app.get("/api/deliveries", (req, res) => {
  const { status, limit = "50" } = req.query;
  let filtered = deliveries;
  if (status) filtered = filtered.filter((d) => d.status === (status as string));
  res.json(filtered.slice(-parseInt(limit as string)));
});

// ─── Start ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  log.info({ port: PORT }, "Webhook service started");
});

export default app;
