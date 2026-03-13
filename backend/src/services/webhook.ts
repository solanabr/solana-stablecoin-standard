import axios, { AxiosError } from "axios";
import { logger } from "./logger";
import { StablecoinEvent } from "./event-listener";

/**
 * Configurable webhook notification service with retry logic.
 */
export class WebhookService {
  private url: string;
  private secret: string;
  private retryCount: number;
  private retryDelayMs: number;

  constructor() {
    this.url = process.env.WEBHOOK_URL || "";
    this.secret = process.env.WEBHOOK_SECRET || "";
    this.retryCount = parseInt(process.env.WEBHOOK_RETRY_COUNT || "3");
    this.retryDelayMs = parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || "1000");
  }

  async dispatch(event: StablecoinEvent): Promise<boolean> {
    if (!this.url) {
      logger.debug("No webhook URL configured, skipping dispatch");
      return false;
    }

    const payload = {
      event: event.type,
      data: event.data,
      signature: event.signature,
      timestamp: event.timestamp.toISOString(),
    };

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (this.secret) {
          const crypto = await import("crypto");
          const hmac = crypto
            .createHmac("sha256", this.secret)
            .update(JSON.stringify(payload))
            .digest("hex");
          headers["X-SSS-Signature"] = hmac;
        }

        await axios.post(this.url, payload, { headers, timeout: 10000 });

        logger.info("Webhook dispatched", {
          event: event.type,
          attempt: attempt + 1,
        });
        return true;
      } catch (err) {
        const axiosErr = err as AxiosError;
        logger.warn("Webhook dispatch failed", {
          event: event.type,
          attempt: attempt + 1,
          status: axiosErr.response?.status,
          error: axiosErr.message,
        });

        if (attempt < this.retryCount) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.error("Webhook dispatch failed after all retries", {
      event: event.type,
      url: this.url,
    });
    return false;
  }
}
