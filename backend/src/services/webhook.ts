import { logger } from "./logger";
import type { ParsedEvent } from "./event-listener";

/**
 * Send a webhook notification for an on-chain event.
 *
 * Webhook URLs are configured via the WEBHOOK_URLS env var (comma-separated).
 * Each URL receives a POST with the event payload.
 * Failures are logged but do not throw — webhook delivery is best-effort.
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

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

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

        logger.debug("Webhook delivered", { url, event: event.type });
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      logger.warn("Webhook delivery failed", {
        url: urls[i],
        event: event.type,
        error: result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      });
    }
  }
}
