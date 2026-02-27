"use strict";
/**
 * Webhook Dispatcher
 *
 * Sends event notifications to configured webhook endpoints
 * with retry logic, idempotency keys, and audit logging.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookDispatcher = exports.WebhookEventType = void 0;
exports.createWebhookDispatcherFromEnv = createWebhookDispatcherFromEnv;
const events_1 = require("events");
// =============================================================================
// Types
// =============================================================================
var WebhookEventType;
(function (WebhookEventType) {
    WebhookEventType["MINT"] = "mint";
    WebhookEventType["BURN"] = "burn";
    WebhookEventType["TRANSFER"] = "transfer";
    WebhookEventType["FREEZE"] = "freeze";
    WebhookEventType["THAW"] = "thaw";
    WebhookEventType["PAUSE"] = "pause";
    WebhookEventType["UNPAUSE"] = "unpause";
    WebhookEventType["BLACKLIST_ADD"] = "blacklist.add";
    WebhookEventType["BLACKLIST_REMOVE"] = "blacklist.remove";
    WebhookEventType["ALLOWLIST_ADD"] = "allowlist.add";
    WebhookEventType["ALLOWLIST_REMOVE"] = "allowlist.remove";
    WebhookEventType["SEIZE"] = "seize";
    WebhookEventType["ROLE_GRANT"] = "role.grant";
    WebhookEventType["ROLE_REVOKE"] = "role.revoke";
    WebhookEventType["AUTHORITY_TRANSFER"] = "authority.transfer";
})(WebhookEventType || (exports.WebhookEventType = WebhookEventType = {}));
// =============================================================================
// Constants
// =============================================================================
const DEFAULT_CONFIG = {
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 10000,
    enabled: true,
};
// =============================================================================
// Webhook Dispatcher
// =============================================================================
class WebhookDispatcher extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.deliveryLog = [];
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Dispatch a webhook event
     */
    async dispatch(event) {
        if (!this.config.enabled) {
            return this.createDelivery(event, "", 0, true, "Webhooks disabled");
        }
        const url = this.getUrlForEvent(event.type);
        if (!url) {
            return this.createDelivery(event, "", 0, true, "No URL configured");
        }
        let lastError;
        let lastStatusCode;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const result = await this.sendWebhook(url, event, attempt);
                const delivery = this.createDelivery(event, url, attempt, true);
                delivery.statusCode = result.statusCode;
                this.logDelivery(delivery);
                this.emit("delivered", delivery);
                return delivery;
            }
            catch (err) {
                lastError = err.message || String(err);
                lastStatusCode = err.statusCode;
                if (attempt < this.config.maxRetries) {
                    const delay = this.calculateRetryDelay(attempt);
                    await this.sleep(delay);
                }
            }
        }
        const failedDelivery = this.createDelivery(event, url, this.config.maxRetries, false, lastError);
        failedDelivery.statusCode = lastStatusCode;
        this.logDelivery(failedDelivery);
        this.emit("failed", failedDelivery);
        return failedDelivery;
    }
    /**
     * Create a webhook event
     */
    static createEvent(type, signature, mint, data = {}) {
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
    getDeliveryLog(limit = 100) {
        return this.deliveryLog.slice(-limit);
    }
    /**
     * Get delivery stats
     */
    getStats() {
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
    getUrlForEvent(type) {
        return this.config.eventUrls?.[type] || this.config.url;
    }
    async sendWebhook(url, event, attempt) {
        const body = JSON.stringify(event);
        const headers = {
            "Content-Type": "application/json",
            "X-Webhook-Event": event.type,
            "X-Idempotency-Key": event.signature,
            "X-Delivery-Attempt": String(attempt),
            "User-Agent": "SSS-Webhook/1.0",
        };
        // Add HMAC signature if secret is configured
        if (this.config.secret) {
            const crypto = await Promise.resolve().then(() => __importStar(require("crypto")));
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
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.statusCode = response.status;
                throw error;
            }
            return { statusCode: response.status };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    calculateRetryDelay(attempt) {
        // Exponential backoff with jitter
        const baseDelay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.3 * baseDelay;
        return baseDelay + jitter;
    }
    createDelivery(event, url, attempt, success, error) {
        return {
            event,
            url,
            attempt,
            success,
            error,
            timestamp: new Date().toISOString(),
        };
    }
    logDelivery(delivery) {
        this.deliveryLog.push(delivery);
        // Keep last 1000 entries
        if (this.deliveryLog.length > 1000) {
            this.deliveryLog = this.deliveryLog.slice(-1000);
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.WebhookDispatcher = WebhookDispatcher;
// =============================================================================
// Factory - Create from environment
// =============================================================================
function createWebhookDispatcherFromEnv() {
    return new WebhookDispatcher({
        url: process.env.WEBHOOK_URL,
        secret: process.env.WEBHOOK_SECRET,
        maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || "3"),
        retryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY || "1000"),
        timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT || "10000"),
        enabled: process.env.WEBHOOK_ENABLED !== "false",
    });
}
