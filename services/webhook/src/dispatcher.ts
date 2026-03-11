import { createHmac } from "crypto";
import { Logger } from "@sss/shared";
import {
  updateDelivery,
  WebhookDelivery,
  WebhookSubscription,
} from "./repository";

interface DispatchJob {
  delivery: WebhookDelivery;
  subscription: WebhookSubscription;
  eventPayload: unknown;
}

interface DispatcherOptions {
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  logger: Logger;
}

export class Dispatcher {
  private queue: DispatchJob[] = [];
  private processing = false;

  constructor(private readonly opts: DispatcherOptions) {}

  enqueue(job: DispatchJob): void {
    this.queue.push(job);
    if (!this.processing) void this.drain();
  }

  enqueueMany(jobs: DispatchJob[]): void {
    for (const job of jobs) this.queue.push(job);
    if (!this.processing) void this.drain();
  }

  private async drain(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      await this.dispatch(job);
    }
    this.processing = false;
  }

  async dispatch(job: DispatchJob): Promise<void> {
    const { delivery, subscription, eventPayload } = job;
    const { timeoutMs, maxAttempts, baseDelayMs, logger } = this.opts;

    const attempts = delivery.attempts + 1;

    const body = JSON.stringify({
      deliveryId: delivery.id,
      subscriptionId: subscription.id,
      event: eventPayload,
      timestamp: new Date().toISOString(),
    });

    const signature = computeHmac(body, subscription.secret);

    let statusCode: number | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(subscription.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event-Id": String(delivery.event_id),
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      statusCode = response.status;

      if (response.ok) {
        await updateDelivery(delivery.id, {
          status: "success",
          attempts,
          lastStatusCode: statusCode,
        });
        logger.info(
          { deliveryId: delivery.id, subscriptionId: subscription.id, statusCode },
          "Webhook delivered",
        );
        return;
      }
    } catch (err) {
      logger.warn(
        { deliveryId: delivery.id, subscriptionId: subscription.id, err },
        "Webhook dispatch error",
      );
    }

    // Failure path
    if (attempts >= maxAttempts) {
      await updateDelivery(delivery.id, {
        status: "exhausted",
        attempts,
        lastStatusCode: statusCode,
      });
      logger.warn(
        { deliveryId: delivery.id, attempts, maxAttempts },
        "Webhook delivery exhausted",
      );
      return;
    }

    // Exponential backoff: 30s, 60s, 120s, 240s, 480s, ...
    const delayMs = baseDelayMs * Math.pow(2, attempts - 1);
    const nextRetryAt = new Date(Date.now() + delayMs);

    await updateDelivery(delivery.id, {
      status: "pending",
      attempts,
      lastStatusCode: statusCode,
      nextRetryAt,
    });

    logger.info(
      { deliveryId: delivery.id, attempts, nextRetryAt },
      "Webhook delivery scheduled for retry",
    );
  }
}

function computeHmac(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}
