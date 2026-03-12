import { logger } from "./logger";

export class WebhookDispatcher {
  constructor(
    private readonly url: string,
    private readonly maxRetries: number
  ) {}

  async dispatch(payload: unknown, attempt = 1): Promise<void> {
    if (!this.url) return; // no webhook configured

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      if (attempt >= this.maxRetries) {
        logger.warn("Webhook max retries exceeded", { url: this.url, error: err.message });
        return;
      }
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise((r) => setTimeout(r, delay));
      return this.dispatch(payload, attempt + 1);
    }
  }
}
