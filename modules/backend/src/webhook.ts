import pino from "pino";
import { getWebhookSubscriptions } from "./db";
import * as crypto from "crypto";

const logger = pino({ name: "webhook" });

export async function dispatchWebhooks(
  mint: string,
  eventType: string,
  txSignature: string,
  data: Record<string, unknown>
): Promise<void> {
  const subscriptions = await getWebhookSubscriptions(mint, eventType);

  for (const sub of subscriptions) {
    try {
      const payload = JSON.stringify({
        event_type: eventType,
        mint,
        transaction_signature: txSignature,
        data,
        timestamp: new Date().toISOString(),
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sub.secret) {
        const signature = crypto
          .createHmac("sha256", sub.secret)
          .update(payload)
          .digest("hex");
        headers["X-SSS-Signature"] = signature;
      }

      const response = await fetch(sub.url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.warn(
          { url: sub.url, status: response.status },
          "Webhook delivery failed"
        );
      } else {
        logger.info({ url: sub.url, eventType }, "Webhook delivered");
      }
    } catch (err: any) {
      logger.error({ url: sub.url, err: err.message }, "Webhook delivery error");
    }
  }
}
