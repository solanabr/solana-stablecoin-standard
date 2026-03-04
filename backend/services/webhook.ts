import pino from "pino";

const log = pino({ name: "sss-webhooks" });

interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: number;
}

interface WebhookPayload {
  id: string;
  type: string;
  timestamp: number;
  data: Record<string, string>;
  signature: string;
}

interface WebhookDelivery {
  subscriptionId: string;
  payload: WebhookPayload;
  attempt: number;
  status: "pending" | "delivered" | "failed";
  httpStatus?: number;
  error?: string;
}

/**
 * Webhook notification service. Dispatches token events to registered
 * HTTP endpoints with HMAC-SHA256 signatures for payload verification.
 */
export class WebhookService {
  private subscriptions = new Map<string, WebhookSubscription>();
  private deliveryQueue: WebhookDelivery[] = [];
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private processing = false;

  constructor(opts?: { maxRetries?: number; retryDelayMs?: number; timeoutMs?: number }) {
    this.maxRetries = opts?.maxRetries ?? 3;
    this.retryDelayMs = opts?.retryDelayMs ?? 5000;
    this.timeoutMs = opts?.timeoutMs ?? 10000;
  }

  subscribe(sub: WebhookSubscription): void {
    this.subscriptions.set(sub.id, sub);
    log.info({ id: sub.id, url: sub.url, events: sub.events }, "Webhook registered");
  }

  unsubscribe(id: string): boolean {
    const removed = this.subscriptions.delete(id);
    if (removed) log.info({ id }, "Webhook unsubscribed");
    return removed;
  }

  async dispatch(event: {
    type: string;
    signature: string;
    timestamp: number;
    data: Record<string, string>;
  }): Promise<void> {
    const matching = Array.from(this.subscriptions.values()).filter(
      (sub) => sub.active && (sub.events.includes(event.type) || sub.events.includes("*"))
    );

    if (matching.length === 0) return;

    for (const sub of matching) {
      this.deliveryQueue.push({
        subscriptionId: sub.id,
        payload: {
          id: `${event.signature}-${sub.id}-${Date.now()}`,
          type: event.type,
          timestamp: event.timestamp,
          data: event.data,
          signature: event.signature,
        },
        attempt: 0,
        status: "pending",
      });
    }

    if (!this.processing) {
      this.processQueue().catch((err) => log.error({ err }, "Queue processing error"));
    }
  }

  getQueueSize(): number {
    return this.deliveryQueue.length;
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.deliveryQueue.length > 0) {
      const delivery = this.deliveryQueue.shift()!;
      const sub = this.subscriptions.get(delivery.subscriptionId);
      if (!sub || !sub.active) continue;

      delivery.attempt++;

      try {
        const hmac = await this.computeHmac(sub.secret, JSON.stringify(delivery.payload));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SSS-Signature": hmac,
            "X-SSS-Event": delivery.payload.type,
            "X-SSS-Delivery": delivery.payload.id,
          },
          body: JSON.stringify(delivery.payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        delivery.httpStatus = response.status;

        if (response.ok) {
          delivery.status = "delivered";
          log.debug({ id: delivery.payload.id, url: sub.url }, "Webhook delivered");
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (err: any) {
        delivery.error = err.message;
        log.warn({ id: delivery.payload.id, attempt: delivery.attempt, error: err.message }, "Webhook delivery failed");

        if (delivery.attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, delivery.attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.deliveryQueue.push(delivery);
        } else {
          delivery.status = "failed";
          log.error({ id: delivery.payload.id, url: sub.url }, "Webhook permanently failed");
        }
      }
    }

    this.processing = false;
  }

  private async computeHmac(secret: string, payload: string): Promise<string> {
    const crypto = await import("crypto");
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }
}
