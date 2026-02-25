import { logger } from "./logger";
import type { ParsedEvent } from "./event-listener";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Send a webhook notification for an on-chain event.
 *
 * Webhook URLs are configured via the WEBHOOK_URLS env var (comma-separated).
 * Each URL receives a POST with the event payload.
 * Retries with exponential backoff (1s, 2s, 4s) on failure.
 * Failures after all retries are logged but do not throw.
 */
export async function sendWebhook(event: ParsedEvent): Promise<void> {
  const webhookUrls = process.env.WEBHOOK_URLS;
  if (!webhookUrls) {
    return;
  }

  const urls = webhookUrls
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    event: event.type,
    program: event.program,
    signature: event.signature,
    data: event.data,
    timestamp: event.timestamp,
  });

  await Promise.allSettled(
    urls.map((url) => deliverWithRetry(url, payload, event.type)),
  );
}

async function deliverWithRetry(
  url: string,
  payload: string,
  eventType: string,
): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "sss-backend/0.1.0",
          },
          body: payload,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        logger.debug("Webhook delivered", { url, event: eventType, attempt });
        return;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn("Webhook delivery failed, retrying", {
          url,
          event: eventType,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          retryInMs: delay,
          error: message,
        });
        await sleep(delay);
      } else {
        logger.error("Webhook delivery failed after all retries", {
          url,
          event: eventType,
          totalAttempts: MAX_RETRIES + 1,
          error: message,
        });
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
