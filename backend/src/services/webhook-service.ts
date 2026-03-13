import * as crypto from "crypto";
import { createHmac } from "crypto";
import * as dns from "node:dns";
import * as net from "node:net";
import express, { Express, Request, Response } from "express";

const DEFAULT_PORT = parseInt(process.env.PORT || "3001", 10);
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 500;
const RETRY_JITTER_RATIO = 0.2;

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
  webhookUrl: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: string;
  lastAttemptAt: string;
}

export interface DeadLetterEntry {
  webhookId: string;
  webhookUrl: string;
  eventType: string;
  payload: unknown;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string;
  failedAt: string;
  lastError: string | null;
}

export interface WebhookServiceState {
  webhooks: Map<string, WebhookRegistration>;
  retryQueue: DeliveryAttempt[];
  deadLetterQueue: DeadLetterEntry[];
}

interface WebhookServiceOptions {
  apiKey?: string;
  port?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  retryIntervalMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  disableRetryProcessor?: boolean;
  dnsLookup?: DnsLookupFn;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  // 0.0.0.0
  if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // ::1 loopback
  if (normalized === "::1") return true;
  // :: unspecified
  if (normalized === "::") return true;
  // fc00::/7 (unique local: fc00-fdff)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // fe80::/10 (link-local: fe80-febf)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  )
    return true;
  return false;
}

export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

export type DnsLookupFn = (
  hostname: string
) => Promise<
  { address: string; family: number } | { address: string; family: number }[]
>;

async function defaultDnsLookup(
  hostname: string
): Promise<{ address: string; family: number }[]> {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

export async function validateWebhookUrl(
  url: string,
  lookup: DnsLookupFn = defaultDnsLookup
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "url must be a valid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "SSRF protection: only http and https schemes are allowed";
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return "SSRF protection: localhost URLs are not allowed";
  }

  // If hostname is already an IP literal, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return "SSRF protection: webhook URL points to a private/reserved IP address";
    }
    return null;
  }

  // Resolve hostname and check resolved IP
  try {
    const resolved = await lookup(hostname);
    const addresses = Array.isArray(resolved) ? resolved : [resolved];

    if (addresses.length === 0) {
      return "SSRF protection: could not resolve webhook URL hostname";
    }

    if (addresses.some(({ address }) => isPrivateIP(address))) {
      return "SSRF protection: webhook URL resolves to a private/reserved IP address";
    }
  } catch {
    return "SSRF protection: could not resolve webhook URL hostname";
  }

  return null;
}

function readIntegerEnv(
  value: string | undefined,
  fallback: number,
  minimum: number
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
}

function readMaxRetries(): number {
  return readIntegerEnv(
    process.env.WEBHOOK_MAX_RETRIES ?? process.env.MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
    0
  );
}

function readBaseDelayMs(): number {
  return readIntegerEnv(process.env.WEBHOOK_BASE_DELAY_MS, DEFAULT_BASE_DELAY_MS, 1);
}

function computeRetryDelayMs(
  attempts: number,
  baseDelayMs: number,
  random: () => number
): number {
  const nominalDelay = baseDelayMs * Math.pow(2, Math.max(0, attempts - 1));
  const jitterSeed = Math.min(1, Math.max(0, random()));
  const jitterFactor = 1 + jitterSeed * RETRY_JITTER_RATIO;
  return Math.round(nominalDelay * jitterFactor);
}

function generateId(now: () => number): string {
  return `wh_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isAuthorized(req: Request, res: Response, apiKey: string): boolean {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${apiKey}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

/**
 * Compute HMAC-SHA256 over a canonical signing string that binds the timestamp,
 * event type, and payload together. The canonical form is:
 *   `${timestamp}.${eventType}.${JSON.stringify(payload)}`
 *
 * Receivers should:
 *   1. Extract the timestamp from the X-Webhook-Timestamp header.
 *   2. Reject signatures where the timestamp is older than 5 minutes (replay protection).
 *   3. Reconstruct the canonical string and verify the HMAC.
 */
export function computeWebhookSignature(
  secret: string,
  timestamp: string,
  eventType: string,
  payload: unknown
): string {
  const canonicalString = `${timestamp}.${eventType}.${JSON.stringify(payload)}`;
  return createHmac("sha256", secret)
    .update(canonicalString)
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
  const rawApiKey = options.apiKey ?? process.env.API_KEY;
  const apiKey = rawApiKey?.trim();
  if (!apiKey) {
    throw new Error(
      "FATAL: API_KEY environment variable is required and must be non-empty"
    );
  }
  const port = options.port ?? DEFAULT_PORT;
  const maxRetries = options.maxRetries ?? readMaxRetries();
  const baseDelayMs = options.baseDelayMs ?? readBaseDelayMs();
  const retryIntervalMs =
    options.retryIntervalMs ??
    Math.max(250, Math.min(DEFAULT_RETRY_INTERVAL_MS, baseDelayMs));
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const dnsLookup = options.dnsLookup ?? defaultDnsLookup;

  const state: WebhookServiceState = {
    webhooks: new Map<string, WebhookRegistration>(),
    retryQueue: [],
    deadLetterQueue: [],
  };

  function pushToDeadLetterQueue(
    attempt: DeliveryAttempt,
    failedAt: number
  ): void {
    state.deadLetterQueue.push({
      webhookId: attempt.webhookId,
      webhookUrl: attempt.webhookUrl,
      eventType: attempt.eventType,
      payload: attempt.payload,
      attempts: attempt.attempts,
      createdAt: attempt.createdAt,
      lastAttemptAt: attempt.lastAttemptAt,
      failedAt: new Date(failedAt).toISOString(),
      lastError: attempt.lastError,
    });
  }

  function scheduleRetry(
    attempt: DeliveryAttempt,
    scheduledAt: number
  ): DeliveryAttempt {
    attempt.nextRetryAt =
      scheduledAt + computeRetryDelayMs(attempt.attempts, baseDelayMs, random);
    return attempt;
  }

  async function deliverToWebhook(
    registration: WebhookRegistration,
    eventType: string,
    payload: unknown,
    attempt: number
  ): Promise<boolean> {
    try {
      const urlError = await validateWebhookUrl(registration.url, dnsLookup);
      if (urlError) {
        registration.stats.lastError = urlError;
        return false;
      }

      const timestamp = new Date(now()).toISOString();
      const body = JSON.stringify({
        id: `evt_${now().toString(36)}`,
        type: eventType,
        payload,
        timestamp,
        attempt,
      });
      const signature = computeWebhookSignature(
        registration.secret,
        timestamp,
        eventType,
        payload
      );

      const response = await fetchImpl(registration.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Id": registration.id,
          "X-Webhook-Timestamp": timestamp,
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
      const attempt: DeliveryAttempt = {
        webhookId: registration.id,
        webhookUrl: registration.url,
        eventType,
        payload,
        attempts: 1,
        nextRetryAt: 0,
        lastError: registration.stats.lastError,
        createdAt: new Date(now()).toISOString(),
        lastAttemptAt: new Date(now()).toISOString(),
      };

      if (maxRetries === 0) {
        pushToDeadLetterQueue(attempt, now());
        console.error(
          `[retry] Sending ${eventType} to ${registration.url} failed with retries disabled`
        );
        continue;
      }

      state.retryQueue.push(scheduleRetry(attempt, now()));
    }

    return dispatched;
  }

  async function processRetryQueue(): Promise<void> {
    const currentTime = now();
    for (let queueIndex = state.retryQueue.length - 1; queueIndex >= 0; queueIndex--) {
      const item = state.retryQueue[queueIndex];
      if (!item || item.nextRetryAt > currentTime) {
        continue;
      }

      const registration = state.webhooks.get(item.webhookId);
      if (!registration) {
        state.retryQueue.splice(queueIndex, 1);
        continue;
      }

      item.attempts += 1;
      item.lastAttemptAt = new Date(currentTime).toISOString();
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

      registration.stats.failed++;
      item.lastError = registration.stats.lastError;

      if (item.attempts - 1 >= maxRetries) {
        pushToDeadLetterQueue(item, currentTime);
        console.error(
          `[retry] Giving up on delivery to ${registration.url} after ${item.attempts - 1} retries (${item.attempts} attempts total)`
        );
        state.retryQueue.splice(queueIndex, 1);
        continue;
      }

      scheduleRetry(item, currentTime);
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
      deadLetterQueueSize: state.deadLetterQueue.length,
      uptime: process.uptime(),
    });
  });

  app.post("/webhook/register", async (req: Request, res: Response) => {
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

    const urlError = await validateWebhookUrl(url, dnsLookup);
    if (urlError) {
      res.status(400).json({ error: urlError });
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
      deadLetterQueueSize: state.deadLetterQueue.length,
    });
  });

  app.get("/webhook/status", (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

    const registrations = Array.from(state.webhooks.values()).map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      secret: "[REDACTED]",
      createdAt: webhook.createdAt,
      stats: webhook.stats,
    }));

    res.json({
      webhooks: registrations,
      retryQueueSize: state.retryQueue.length,
      deadLetterQueueSize: state.deadLetterQueue.length,
      retryQueue: state.retryQueue.map((item) => ({
        webhookId: item.webhookId,
        webhookUrl: item.webhookUrl,
        eventType: item.eventType,
        attempts: item.attempts,
        createdAt: item.createdAt,
        lastAttemptAt: item.lastAttemptAt,
        nextRetryAt: new Date(item.nextRetryAt).toISOString(),
        lastError: item.lastError,
      })),
      deadLetterQueue: state.deadLetterQueue.map((item) => ({
        webhookId: item.webhookId,
        webhookUrl: item.webhookUrl,
        eventType: item.eventType,
        attempts: item.attempts,
        createdAt: item.createdAt,
        lastAttemptAt: item.lastAttemptAt,
        failedAt: item.failedAt,
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
