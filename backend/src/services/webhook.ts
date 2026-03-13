/**
 * Webhook service — send event notifications to external endpoints with retry.
 * @module services/webhook
 */

import type { FastifyBaseLogger } from "fastify";

export interface WebhookEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export class WebhookService {
  private readonly url: string | null;
  private readonly secret: string | null;
  private readonly logger: FastifyBaseLogger;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor(url: string | null, secret: string | null, logger: FastifyBaseLogger) {
    this.url = url;
    this.secret = secret;
    this.logger = logger;
  }

  /** Whether webhooks are configured */
  get isEnabled(): boolean {
    return this.url !== null;
  }

  /** Send a webhook event with retry logic */
  async send(event: WebhookEvent): Promise<boolean> {
    if (!this.url) return false;

    const payload = JSON.stringify(event);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.secret ? { "X-Webhook-Secret": this.secret } : {}),
          },
          body: payload,
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          this.logger.info({ type: event.type, attempt }, "Webhook delivered");
          return true;
        }

        this.logger.warn(
          { type: event.type, attempt, status: response.status },
          "Webhook delivery failed, retrying"
        );
      } catch (err) {
        this.logger.warn(
          { type: event.type, attempt, err: (err as Error).message },
          "Webhook delivery error, retrying"
        );
      }

      if (attempt < this.maxRetries) {
        await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
      }
    }

    this.logger.error({ type: event.type }, "Webhook delivery failed after all retries");
    return false;
  }

  /** Fire-and-forget: send without blocking */
  notify(type: string, data: Record<string, unknown>): void {
    if (!this.isEnabled) return;
    this.send({
      type,
      timestamp: new Date().toISOString(),
      data,
    }).catch(() => { }); // fire-and-forget
  }
}
