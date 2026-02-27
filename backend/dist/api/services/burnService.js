"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BurnService = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const logger_1 = require("../../shared/logger");
const redis_1 = require("../../shared/redis");
class BurnService {
    constructor() {
        this.connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
    }
    async burn(request) {
        try {
            const { amount, authority, account } = request;
            // Validate amount
            const burnAmount = new anchor_1.BN(amount);
            if (burnAmount.lte(new anchor_1.BN(0))) {
                return { success: false, error: "Invalid burn amount" };
            }
            // Check rate limit
            const key = `burn:${account || "global"}`;
            const current = await redis_1.redis.get(key);
            if (current && parseInt(current) > 10) {
                return { success: false, error: "Rate limit exceeded" };
            }
            await redis_1.redis.incr(key);
            await redis_1.redis.expire(key, 3600);
            // Queue the burn
            const jobId = await this.queueBurn(amount, account);
            logger_1.logger.info(`Burn queued: jobId=${jobId}, amount=${amount}`);
            return {
                success: true,
                signature: `mock_${jobId}`,
            };
        }
        catch (error) {
            logger_1.logger.error("Burn error:", error);
            return { success: false, error: error.message };
        }
    }
    async queueBurn(amount, account) {
        const jobId = `burn_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        await redis_1.redis.setex(`job:${jobId}`, 3600, JSON.stringify({
            type: "burn",
            amount,
            account,
            status: "pending",
            createdAt: Date.now(),
        }));
        return jobId;
    }
}
exports.BurnService = BurnService;
