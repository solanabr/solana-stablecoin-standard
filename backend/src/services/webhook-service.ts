import * as crypto from "crypto";
import { createHmac } from "crypto";
import express, { Express, Request, Response } from "express";

const DEFAULT_PORT = parseInt(process.env.PORT || "3001", 10);
const DEFAULT_MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "5", 10);
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 5000;

export interface WebhookRegistration {
  id: string;
  url: string;
  eventTypes: string[];
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

export interface DeliveryAttempt {
  webhookId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
}

export interface WebhookServiceState {
  webhooks: Map<string, WebhookRegistration>;
  retryQueue: DeliveryAttempt[];
}

interface WebhookServiceOptions {
  apiKey?: string;
  port?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  retryIntervalMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  disableRetryProcessor?: boolean;
}

function generateId(now: () => number): string {
  return `wh_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAuthorized(req: Request, res: Response, apiKey?: string): boolean {
  if (!apiKey) {
    return true;
  }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${apiKey}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

export function computeWebhookSignature(secret: string, payload: unknown): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function createWebhookService(options: WebhookServiceOptions = {}): {
  app: Express;
  state: WebhookServiceState;
  dispatch: (eventType: string, payload: unknown) => Promise<number>;
  processRetryQueue: () => Promise<void>;
  start: () => void;
  stopRetryProcessor: () => void;
} {
  const apiKey = options.apiKey ?? process.env.API_KEY;
  const port = options.port ?? DEFAULT_PORT;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  const state: WebhookServiceState = {
    webhooks: new Map<string, WebhookRegistration>(),
    retryQueue: [],
  };

  async function deliverToWebhook(
    registration: WebhookRegistration,
    eventType: string,
    payload: unknown,
    attempt: number
  ): Promise<boolean> {
    try {
      const body = JSON.stringify({
        id: `evt_${now().toString(36)}`,
        type: eventType,
        payload,
        timestamp: new Date(now()).toISOString(),
        attempt,
      });
      const signature = computeWebhookSignature(registration.secret, payload);

      const response = await fetchImpl(registration.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": registration.id,
          "X-Webhook-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        registration.stats.delivered++;
        registration.stats.lastDelivery = new Date(now()).toISOString();
        registration.stats.lastError = null;
        return true;
      }

      registration.stats.lastError = `HTTP ${response.status}: ${response.statusText}`;
      return false;
    } catch (error) {
      registration.stats.lastError = (error as Error).message;
      return false;
    }
  }

  async function dispatch(eventType: string, payload: unknown): Promise<number> {
    let dispatched = 0;

    for (const registration of state.webhooks.values()) {
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
        continue;
      }

      registration.stats.failed++;
      registration.stats.pending--;
      state.retryQueue.push({
        webhookId: registration.id,
        eventType,
        payload,
        attempts: 1,
        nextRetryAt: now() + baseDelayMs,
        lastError: registration.stats.lastError,
      });
    }

    return dispatched;
  }

  async function processRetryQueue(): Promise<void> {
    const currentTime = now();
    const readyItems = state.retryQueue.filter((item) => item.nextRetryAt <= currentTime);

    for (const item of readyItems) {
      const queueIndex = state.retryQueue.indexOf(item);
      const registration = state.webhooks.get(item.webhookId);

      if (queueIndex === -1) {
        continue;
      }

      if (!registration) {
        state.retryQueue.splice(queueIndex, 1);
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
        state.retryQueue.splice(queueIndex, 1);
        continue;
      }

      if (item.attempts >= maxRetries) {
        console.error(
          `[retry] Giving up on delivery to ${registration.url} after ${item.attempts} attempts`
        );
        state.retryQueue.splice(queueIndex, 1);
        continue;
      }

      const delay = baseDelayMs * Math.pow(2, item.attempts - 1);
      item.nextRetryAt = currentTime + delay;
      item.lastError = registration.stats.lastError;
    }
  }

  const retryProcessor = options.disableRetryProcessor
    ? null
    : setInterval(() => {
        void processRetryQueue();
      }, retryIntervalMs);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "webhook-service",
      registeredWebhooks: state.webhooks.size,
      retryQueueSize: state.retryQueue.length,
      uptime: process.uptime(),
    });
  });

  app.post("/webhook/register", (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

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

    const id = generateId(now);
    const registration: WebhookRegistration = {
      id,
      url,
      eventTypes: eventTypes || [],
      secret: secret || crypto.randomUUID(),
      createdAt: new Date(now()).toISOString(),
      stats: {
        delivered: 0,
        failed: 0,
        pending: 0,
        lastDelivery: null,
        lastError: null,
      },
    };

    state.webhooks.set(id, registration);

    console.log(`[register] Webhook registered: ${id} -> ${url}`);

    res.status(201).json({
      id: registration.id,
      url: registration.url,
      eventTypes: registration.eventTypes,
      secret: registration.secret,
      createdAt: registration.createdAt,
    });
  });

  app.post("/webhook/dispatch", async (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

    const { eventType, payload } = req.body as DispatchRequest;

    if (!eventType) {
      res.status(400).json({ error: "eventType is required" });
      return;
    }

    const dispatched = await dispatch(eventType, payload);

    console.log(
      `[dispatch] Event "${eventType}" dispatched to ${dispatched}/${state.webhooks.size} webhooks`
    );

    res.json({
      eventType,
      dispatched,
      totalWebhooks: state.webhooks.size,
      retryQueueSize: state.retryQueue.length,
    });
  });

  app.get("/webhook/status", (_req: Request, res: Response) => {
    const registrations = Array.from(state.webhooks.values()).map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      createdAt: webhook.createdAt,
      stats: webhook.stats,
    }));

    res.json({
      webhooks: registrations,
      retryQueueSize: state.retryQueue.length,
      retryQueue: state.retryQueue.map((item) => ({
        webhookId: item.webhookId,
        eventType: item.eventType,
        attempts: item.attempts,
        nextRetryAt: new Date(item.nextRetryAt).toISOString(),
        lastError: item.lastError,
      })),
    });
  });

  app.delete("/webhook/:id", (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

    const id = req.params.id as string;

    if (!state.webhooks.has(id)) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }

    state.webhooks.delete(id);
    for (let index = state.retryQueue.length - 1; index >= 0; index--) {
      if (state.retryQueue[index]?.webhookId === id) {
        state.retryQueue.splice(index, 1);
      }
    }

    console.log(`[unregister] Webhook removed: ${id}`);
    res.json({ deleted: id });
  });

  function start(): void {
    app.listen(port, () => {
      console.log("=== SSS Webhook Service ===");
      console.log(`Listening on http://0.0.0.0:${port}`);
      console.log(`Max retries: ${maxRetries}`);
      console.log("");
    });
  }

  function stopRetryProcessor(): void {
    if (retryProcessor) {
      clearInterval(retryProcessor);
    }
  }

  return {
    app,
    state,
    dispatch,
    processRetryQueue,
    start,
    stopRetryProcessor,
  };
}

if (require.main === module) {
  createWebhookService().start();
}
