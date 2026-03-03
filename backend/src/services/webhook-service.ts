/**
 * SSS Webhook Dispatch Service
 *
 * Receives events and dispatches them to registered webhook endpoints with
 * exponential-backoff retry. Stores registrations and delivery status in
 * memory (swap for Redis / Postgres in production).
 *
 * Endpoints:
 *   POST /webhook/register   - register a new webhook URL
 *   POST /webhook/dispatch    - dispatch an event to all registered hooks
 *   GET  /webhook/status      - list all registered webhooks and stats
 *   GET  /health              - health check
 *
 * Usage:
 *   PORT=3001 ts-node src/services/webhook-service.ts
 */

import express, { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3001", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "5", 10);
const BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookRegistration {
  id: string;
  url: string;
  eventTypes: string[]; // empty = all events
  secret: string;
  createdAt: string;
  stats: {
    delivered: number;
    failed: number;
    pending: number;
    lastDelivery: string | null;
    lastError: string | null;
  };
}

interface DispatchRequest {
  eventType: string;
  payload: unknown;
}

interface DeliveryAttempt {
  webhookId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const webhooks = new Map<string, WebhookRegistration>();
const retryQueue: DeliveryAttempt[] = [];

function generateId(): string {
  return `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Delivery logic
// ---------------------------------------------------------------------------

async function deliverToWebhook(
  registration: WebhookRegistration,
  eventType: string,
  payload: unknown,
  attempt: number
): Promise<boolean> {
  try {
    const body = JSON.stringify({
      id: `evt_${Date.now().toString(36)}`,
      type: eventType,
      payload,
      timestamp: new Date().toISOString(),
      attempt,
    });

    const res = await fetch(registration.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": registration.secret,
        "X-Webhook-Id": registration.id,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      registration.stats.delivered++;
      registration.stats.lastDelivery = new Date().toISOString();
      return true;
    }

    registration.stats.lastError = `HTTP ${res.status}: ${res.statusText}`;
    return false;
  } catch (err) {
    registration.stats.lastError = (err as Error).message;
    return false;
  }
}

async function dispatch(eventType: string, payload: unknown): Promise<number> {
  let dispatched = 0;

  for (const [, registration] of webhooks) {
    // Filter by event type if specified
    if (
      registration.eventTypes.length > 0 &&
      !registration.eventTypes.includes(eventType)
    ) {
      continue;
    }

    registration.stats.pending++;
    const success = await deliverToWebhook(registration, eventType, payload, 1);

    if (success) {
      registration.stats.pending--;
      dispatched++;
    } else {
      // Queue for retry
      registration.stats.failed++;
      registration.stats.pending--;
      retryQueue.push({
        webhookId: registration.id,
        eventType,
        payload,
        attempts: 1,
        nextRetryAt: Date.now() + BASE_DELAY_MS,
        lastError: registration.stats.lastError,
      });
    }
  }

  return dispatched;
}

// ---------------------------------------------------------------------------
// Retry processor
// ---------------------------------------------------------------------------

async function processRetryQueue(): Promise<void> {
  const now = Date.now();
  const ready = retryQueue.filter((item) => item.nextRetryAt <= now);

  for (const item of ready) {
    const idx = retryQueue.indexOf(item);
    const registration = webhooks.get(item.webhookId);

    if (!registration) {
      // Webhook was unregistered -- drop the item
      retryQueue.splice(idx, 1);
      continue;
    }

    item.attempts++;
    const success = await deliverToWebhook(
      registration,
      item.eventType,
      item.payload,
      item.attempts
    );

    if (success) {
      retryQueue.splice(idx, 1);
    } else if (item.attempts >= MAX_RETRIES) {
      console.error(
        `[retry] Giving up on delivery to ${registration.url} after ${item.attempts} attempts`
      );
      retryQueue.splice(idx, 1);
    } else {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
      const delay = BASE_DELAY_MS * Math.pow(2, item.attempts - 1);
      item.nextRetryAt = now + delay;
      item.lastError = registration.stats.lastError;
    }
  }
}

// Run retry processor every 5 seconds
setInterval(processRetryQueue, 5000);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "webhook-service",
    registeredWebhooks: webhooks.size,
    retryQueueSize: retryQueue.length,
    uptime: process.uptime(),
  });
});

// Register a new webhook
app.post("/webhook/register", (req: Request, res: Response) => {
  const { url, eventTypes, secret } = req.body as {
    url?: string;
    eventTypes?: string[];
    secret?: string;
  };

  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "url must be a valid URL" });
    return;
  }

  const id = generateId();
  const registration: WebhookRegistration = {
    id,
    url,
    eventTypes: eventTypes || [],
    secret: secret || generateId(),
    createdAt: new Date().toISOString(),
    stats: {
      delivered: 0,
      failed: 0,
      pending: 0,
      lastDelivery: null,
      lastError: null,
    },
  };

  webhooks.set(id, registration);

  console.log(`[register] Webhook registered: ${id} -> ${url}`);

  res.status(201).json({
    id: registration.id,
    url: registration.url,
    eventTypes: registration.eventTypes,
    secret: registration.secret,
    createdAt: registration.createdAt,
  });
});

// Dispatch event to all matching webhooks
app.post("/webhook/dispatch", async (req: Request, res: Response) => {
  const { eventType, payload } = req.body as DispatchRequest;

  if (!eventType) {
    res.status(400).json({ error: "eventType is required" });
    return;
  }

  const dispatched = await dispatch(eventType, payload);

  console.log(
    `[dispatch] Event "${eventType}" dispatched to ${dispatched}/${webhooks.size} webhooks`
  );

  res.json({
    eventType,
    dispatched,
    totalWebhooks: webhooks.size,
    retryQueueSize: retryQueue.length,
  });
});

// Status of all webhooks
app.get("/webhook/status", (_req: Request, res: Response) => {
  const registrations = Array.from(webhooks.values()).map((wh) => ({
    id: wh.id,
    url: wh.url,
    eventTypes: wh.eventTypes,
    createdAt: wh.createdAt,
    stats: wh.stats,
  }));

  res.json({
    webhooks: registrations,
    retryQueueSize: retryQueue.length,
    retryQueue: retryQueue.map((item) => ({
      webhookId: item.webhookId,
      eventType: item.eventType,
      attempts: item.attempts,
      nextRetryAt: new Date(item.nextRetryAt).toISOString(),
      lastError: item.lastError,
    })),
  });
});

// Delete a webhook
app.delete("/webhook/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!webhooks.has(id)) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  webhooks.delete(id);
  console.log(`[unregister] Webhook removed: ${id}`);
  res.json({ deleted: id });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log("=== SSS Webhook Service ===");
  console.log(`Listening on http://0.0.0.0:${PORT}`);
  console.log(`Max retries: ${MAX_RETRIES}`);
  console.log("");
});
