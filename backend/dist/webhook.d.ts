/**
 * Webhook Dispatcher
 *
 * Sends event notifications to configured webhook endpoints
 * with retry logic, idempotency keys, and audit logging.
 */
import { EventEmitter } from "events";
export declare enum WebhookEventType {
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
    AUTHORITY_TRANSFER = "authority.transfer"
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
export declare class WebhookDispatcher extends EventEmitter {
    private config;
    private deliveryLog;
    constructor(config?: Partial<WebhookConfig>);
    /**
     * Dispatch a webhook event
     */
    dispatch(event: WebhookEvent): Promise<WebhookDelivery>;
    /**
     * Create a webhook event
     */
    static createEvent(type: WebhookEventType, signature: string, mint: string, data?: Record<string, any>): WebhookEvent;
    /**
     * Get delivery log
     */
    getDeliveryLog(limit?: number): WebhookDelivery[];
    /**
     * Get delivery stats
     */
    getStats(): {
        total: number;
        success: number;
        failed: number;
        successRate: number;
    };
    private getUrlForEvent;
    private sendWebhook;
    private calculateRetryDelay;
    private createDelivery;
    private logDelivery;
    private sleep;
}
export declare function createWebhookDispatcherFromEnv(): WebhookDispatcher;
