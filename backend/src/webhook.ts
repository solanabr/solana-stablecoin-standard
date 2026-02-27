/**
 * Webhook Dispatcher
 *
 * Sends event notifications to configured webhook endpoints
 * with retry logic, idempotency keys, and audit logging.
 */

import { EventEmitter } from "events";

// =============================================================================
// Types
// =============================================================================

export enum WebhookEventType {
  MINT = "mint",
  BURN = "burn",
  TRANSFER = "transfer",
  FREEZE = "freeze",
  THAW = "thaw",
  PAUSE = "pause",
  UNPAUSE = "unpause",
  BLACKLIST_ADD = "blacklist.add",
  BLACKLIST_REMOVE = "blacklist.remove",
  ALLOWLIST_ADD = "allowlist.add",
  ALLOWLIST_REMOVE = "allowlist.remove",
  SEIZE = "seize",
  ROLE_GRANT = "role.grant",
  ROLE_REVOKE = "role.revoke",
  AUTHORITY_TRANSFER = "authority.transfer",
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  signature: string;
  mint: string;
  data: Record<string, any>;
}

export interface WebhookConfig {
  /** Default webhook URL for all events */
  url?: string;
  /** Per-event type webhook URLs (overrides default) */
  eventUrls?: Partial<Record<WebhookEventType, string>>;
  /** Secret for HMAC signature verification */
  secret?: string;
  /** Max retry attempts */
  maxRetries: number;
  /** Base retry delay in ms */
  retryDelayMs: number;
  /** Request timeout in ms */
  timeoutMs: number;
  /** Enable/disable webhooks */
  enabled: boolean;
}

export interface WebhookDelivery {
  event: WebhookEvent;
  url: string;
  attempt: number;
  statusCode?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: WebhookConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 10000,
  enabled: true,
};

// =============================================================================
// Webhook Dispatcher
// =============================================================================

export class WebhookDispatcher extends EventEmitter {
  private config: WebhookConfig;
  private deliveryLog: WebhookDelivery[] = [];

  constructor(config: Partial<WebhookConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Dispatch a webhook event
   */
  async dispatch(event: WebhookEvent): Promise<WebhookDelivery> {
    if (!this.config.enabled) {
      return this.createDelivery(event, "", 0, true, "Webhooks disabled");
    }

    const url = this.getUrlForEvent(event.type);
    if (!url) {
      return this.createDelivery(event, "", 0, true, "No URL configured");
    }

    let lastError: string | undefined;
    let lastStatusCode: number | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.sendWebhook(url, event, attempt);
        const delivery = this.createDelivery(event, url, attempt, true);
        delivery.statusCode = result.statusCode;
        this.logDelivery(delivery);
        this.emit("delivered", delivery);
        return delivery;
      } catch (err: any) {
        lastError = err.message || String(err);
        lastStatusCode = err.statusCode;

        if (attempt < this.config.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    const failedDelivery = this.createDelivery(
      event,
      url,
      this.config.maxRetries,
      false,
      lastError
    );
    failedDelivery.statusCode = lastStatusCode;
    this.logDelivery(failedDelivery);
    this.emit("failed", failedDelivery);
    return failedDelivery;
  }

  /**
   * Create a webhook event
   */
  static createEvent(
    type: WebhookEventType,
    signature: string,
    mint: string,
    data: Record<string, any> = {}
  ): WebhookEvent {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      signature,
      mint,
      data,
    };
  }

  /**
   * Get delivery log
   */
  getDeliveryLog(limit: number = 100): WebhookDelivery[] {
    return this.deliveryLog.slice(-limit);
  }

  /**
   * Get delivery stats
   */
  getStats(): {
    total: number;
    success: number;
    failed: number;
    successRate: number;
  } {
    const total = this.deliveryLog.length;
    const success = this.deliveryLog.filter((d) => d.success).length;
    const failed = total - success;
    return {
      total,
      success,
      failed,
      successRate: total > 0 ? (success / total) * 100 : 0,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getUrlForEvent(type: WebhookEventType): string | undefined {
    return this.config.eventUrls?.[type] || this.config.url;
  }

  private async sendWebhook(
    url: string,
    event: WebhookEvent,
    attempt: number
  ): Promise<{ statusCode: number }> {
    const body = JSON.stringify(event);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": event.type,
      "X-Idempotency-Key": event.signature,
      "X-Delivery-Attempt": String(attempt),
      "User-Agent": "SSS-Webhook/1.0",
    };

    // Add HMAC signature if secret is configured
    if (this.config.secret) {
      const crypto = await import("crypto");
      const hmac = crypto.createHmac("sha256", this.config.secret);
      hmac.update(body);
      headers["X-Webhook-Signature"] = `sha256=${hmac.digest("hex")}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error: any = new Error(
          `HTTP ${response.status}: ${response.statusText}`
        );
        error.statusCode = response.status;
        throw error;
      }

      return { statusCode: response.status };
    } finally {
      clearTimeout(timeout);
    }
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * baseDelay;
    return baseDelay + jitter;
  }

  private createDelivery(
    event: WebhookEvent,
    url: string,
    attempt: number,
    success: boolean,
    error?: string
  ): WebhookDelivery {
    return {
      event,
      url,
      attempt,
      success,
      error,
      timestamp: new Date().toISOString(),
    };
  }

  private logDelivery(delivery: WebhookDelivery): void {
    this.deliveryLog.push(delivery);
    // Keep last 1000 entries
    if (this.deliveryLog.length > 1000) {
      this.deliveryLog = this.deliveryLog.slice(-1000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Factory - Create from environment
// =============================================================================

export function createWebhookDispatcherFromEnv(): WebhookDispatcher {
  return new WebhookDispatcher({
    url: process.env.WEBHOOK_URL,
    secret: process.env.WEBHOOK_SECRET,
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || "3"),
    retryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY || "1000"),
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT || "10000"),
    enabled: process.env.WEBHOOK_ENABLED !== "false",
  });
}
