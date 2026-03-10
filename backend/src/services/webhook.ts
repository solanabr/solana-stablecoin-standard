import http from "http";
import https from "https";
import crypto from "crypto";
import { URL } from "url";
import { config } from "../config";
import { createLogger } from "../logger";
import {
  getDb,
  getActiveWebhooks,
  insertWebhookDelivery,
  EventRow,
  WebhookRow,
} from "./database";

const log = createLogger("webhook");

// ── Types ───────────────────────────────────────────────────────────────────

interface WebhookPayload {
  event_id: number;
  event_type: string;
  program_id: string;
  signature: string;
  slot: number;
  data: Record<string, unknown>;
  timestamp: string;
}

// ── Delivery with retry ─────────────────────────────────────────────────────

async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string | null
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(payload);
    const transport = parsed.protocol === "https:" ? https : http;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
      "User-Agent": "SSS-Webhook/1.0",
    };

    if (secret) {
      const hmac = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");
      headers["X-SSS-Signature"] = `sha256=${hmac}`;
    }

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
        timeout: 10000,
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk: Buffer) => {
          responseBody += chunk.toString();
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: responseBody.slice(0, 1024),
          });
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out after 10s"));
    });
    req.write(body);
    req.end();
  });
}

async function deliverWithRetry(
  webhook: WebhookRow,
  event: EventRow
): Promise<void> {
  const payload: WebhookPayload = {
    event_id: event.id,
    event_type: event.event_type,
    program_id: event.program_id,
    signature: event.signature,
    slot: event.slot,
    data: JSON.parse(event.data),
    timestamp: event.created_at,
  };

  const maxRetries = config.webhook.maxRetries;
  const baseDelay = config.webhook.retryDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendWebhook(
        webhook.url,
        payload,
        webhook.secret
      );

      insertWebhookDelivery(
        webhook.id,
        event.id,
        attempt,
        result.statusCode,
        result.body,
        null
      );

      if (result.statusCode >= 200 && result.statusCode < 300) {
        log.info(
          `Delivered event ${event.id} to webhook ${webhook.id} (attempt ${attempt})`
        );
        return;
      }

      log.warn(
        `Webhook ${webhook.id} returned ${result.statusCode} for event ${event.id} (attempt ${attempt})`
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : String(err);

      insertWebhookDelivery(
        webhook.id,
        event.id,
        attempt,
        null,
        null,
        errorMsg
      );

      log.warn(
        `Webhook ${webhook.id} failed for event ${event.id} (attempt ${attempt}): ${errorMsg}`
      );
    }

    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt - 1);
      log.debug(`Waiting ${delay}ms before retry`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  log.error(
    `Failed to deliver event ${event.id} to webhook ${webhook.id} after ${maxRetries} attempts`
  );
}

// ── Dispatch to all matching webhooks ───────────────────────────────────────

export async function dispatchEvent(event: EventRow): Promise<void> {
  const webhooks = getActiveWebhooks(event.event_type);

  if (webhooks.length === 0) {
    log.debug(`No webhooks registered for event type: ${event.event_type}`);
    return;
  }

  log.info(
    `Dispatching event ${event.id} (${event.event_type}) to ${webhooks.length} webhook(s)`
  );

  await Promise.allSettled(
    webhooks.map((webhook) => deliverWithRetry(webhook, event))
  );
}

// ── Polling loop for new events ─────────────────────────────────────────────

let lastProcessedId = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function getLastProcessedId(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(event_id), 0) as last_id FROM webhook_deliveries`
    )
    .get() as { last_id: number } | undefined;
  return row?.last_id ?? 0;
}

async function pollForNewEvents(): Promise<void> {
  const db = getDb();

  try {
    const events = db
      .prepare(
        `SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT 100`
      )
      .all(lastProcessedId) as EventRow[];

    for (const event of events) {
      await dispatchEvent(event);
      lastProcessedId = event.id;
    }
  } catch (err) {
    log.error("Error polling for new events", err);
  }
}

// ── Health check server ─────────────────────────────────────────────────────

function startHealthServer(): void {
  const port = 3003;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        lastProcessedEventId: lastProcessedId,
      })
    );
  });

  server.listen(port, () => {
    log.info(`Webhook health server listening on port ${port}`);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

export function startWebhookService(): void {
  getDb();
  lastProcessedId = getLastProcessedId();
  log.info(`Starting from event ID: ${lastProcessedId}`);

  // Poll every 2 seconds for new events
  pollTimer = setInterval(() => {
    pollForNewEvents().catch((err) =>
      log.error("Unhandled error in poll loop", err)
    );
  }, 2000);

  startHealthServer();

  const shutdown = () => {
    log.info("Shutting down webhook service...");
    if (pollTimer) clearInterval(pollTimer);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  log.info("Starting SSS Webhook Service");
  startWebhookService();
}
