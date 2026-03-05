import express from "express";
import { Pool } from "pg";
import * as crypto from "crypto";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3004");
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_RETRY_ATTEMPTS || "5");
const BASE_RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || "1000");
const API_KEY = process.env.API_KEY || "";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!API_KEY) return next();
  const token = req.headers["x-api-key"] || req.headers.authorization?.replace("Bearer ", "");
  if (token !== API_KEY) {
    res.status(401).json({ error: "Unauthorized — invalid or missing API key" });
    return;
  }
  next();
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (e: any) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

// ─── Register webhook endpoint ────────────────────────────────────────────────

app.post("/endpoints", requireAuth, async (req, res) => {
  const { url, secret, events = [] } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  const result = await db.query(
    `INSERT INTO webhook_endpoints (url, secret, events)
     VALUES ($1, $2, $3) RETURNING id`,
    [url, secret ?? null, events]
  );

  res.json({ id: result.rows[0].id, url, events });
});

app.get("/endpoints", async (_req, res) => {
  const result = await db.query(
    "SELECT id, url, events, active, created_at FROM webhook_endpoints WHERE active=true"
  );
  res.json(result.rows);
});

app.delete("/endpoints/:id", requireAuth, async (req, res) => {
  await db.query(
    "UPDATE webhook_endpoints SET active=false WHERE id=$1",
    [req.params.id]
  );
  res.json({ success: true });
});

// ─── Dispatch event (called by event-listener) ────────────────────────────────

app.post("/dispatch", async (req, res) => {
  const { eventType, payload } = req.body;
  if (!eventType) return res.status(400).json({ error: "eventType is required" });

  // Find all active endpoints that want this event
  const endpoints = await db.query(
    `SELECT * FROM webhook_endpoints
     WHERE active=true
       AND (events = '{}' OR $1 = ANY(events))`,
    [eventType]
  );

  for (const endpoint of endpoints.rows) {
    await db.query(
      `INSERT INTO webhook_deliveries (endpoint_id, event_type, payload, status, next_retry_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [endpoint.id, eventType, JSON.stringify(payload)]
    );
  }

  res.json({ queued: endpoints.rows.length });
});

// ─── Delivery processor (runs every 5 seconds) ────────────────────────────────

async function processPendingDeliveries(): Promise<void> {
  const pending = await db.query(
    `SELECT d.*, e.url, e.secret
     FROM webhook_deliveries d
     JOIN webhook_endpoints e ON d.endpoint_id = e.id
     WHERE d.status='pending'
       AND d.next_retry_at <= NOW()
       AND d.attempts < $1
     LIMIT 20`,
    [MAX_RETRY_ATTEMPTS]
  );

  for (const delivery of pending.rows) {
    await attemptDelivery(delivery);
  }
}

async function attemptDelivery(delivery: any): Promise<void> {
  const attempts = delivery.attempts + 1;
  const body = JSON.stringify({
    id: delivery.id,
    eventType: delivery.event_type,
    payload: delivery.payload,
    timestamp: new Date().toISOString(),
  });

  const signature = delivery.secret
    ? crypto
        .createHmac("sha256", delivery.secret)
        .update(body)
        .digest("hex")
    : null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(delivery.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "X-SSS-Signature": `sha256=${signature}` } : {}),
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const success = response.status >= 200 && response.status < 300;
    const status = success ? "delivered" : "pending";
    const nextRetry = success
      ? null
      : new Date(
          Date.now() + BASE_RETRY_DELAY_MS * Math.pow(2, attempts)
        ).toISOString();

    await db.query(
      `UPDATE webhook_deliveries
       SET status=$1, attempts=$2, last_attempt_at=NOW(), next_retry_at=$3, response_code=$4
       WHERE id=$5`,
      [
        attempts >= MAX_RETRY_ATTEMPTS && !success ? "failed" : status,
        attempts,
        nextRetry,
        response.status,
        delivery.id,
      ]
    );

    if (success) {
      log("info", "Webhook delivered", { id: delivery.id, url: delivery.url });
    } else {
      log("warn", "Webhook delivery failed, will retry", {
        id: delivery.id,
        status: response.status,
        attempts,
      });
    }
  } catch (e: any) {
    const nextRetry =
      attempts < MAX_RETRY_ATTEMPTS
        ? new Date(
            Date.now() + BASE_RETRY_DELAY_MS * Math.pow(2, attempts)
          ).toISOString()
        : null;

    await db.query(
      `UPDATE webhook_deliveries
       SET status=$1, attempts=$2, last_attempt_at=NOW(), next_retry_at=$3, error=$4
       WHERE id=$5`,
      [
        attempts >= MAX_RETRY_ATTEMPTS ? "failed" : "pending",
        attempts,
        nextRetry,
        e.message,
        delivery.id,
      ]
    );

    log("error", "Webhook delivery error", {
      id: delivery.id,
      error: e.message,
      attempts,
    });
  }
}

function log(level: string, msg: string, data: Record<string, any> = {}): void {
  console.log(JSON.stringify({
    level, msg, service: "webhook",
    timestamp: new Date().toISOString(), ...data,
  }));
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => log("info", `Webhook service started on port ${PORT}`));
const deliveryInterval = setInterval(() => processPendingDeliveries().catch(console.error), 5_000);

function shutdown(signal: string): void {
  log("info", `Received ${signal}, shutting down gracefully...`);
  clearInterval(deliveryInterval);
  server.close(() => {
    db.end().then(() => {
      log("info", "Shutdown complete");
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));