"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintService = void 0;
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("../../shared/logger");
const redis_1 = require("../../shared/redis");
class MintService {
    constructor() {
        this.connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
    }
    async mint(request) {
        try {
            const { recipient, amount, authority } = request;
            // Validate recipient
            let recipientPubkey;
            try {
                recipientPubkey = new web3_js_1.PublicKey(recipient);
            }
            catch {
                return { success: false, error: "Invalid recipient address" };
            }
            // Check rate limit
            const key = `mint:${recipient}`;
            const current = await redis_1.redis.get(key);
            if (current && parseInt(current) > 10) {
                return { success: false, error: "Rate limit exceeded" };
            }
            await redis_1.redis.incr(key);
            await redis_1.redis.expire(key, 3600);
            // Queue the mint (in production, this would be processed by a worker)
            const jobId = await this.queueMint(recipient, amount);
            logger_1.logger.info(`Mint queued: jobId=${jobId}, recipient=${recipient}, amount=${amount}`);
            // For demo, return a mock signature
            return {
                success: true,
                signature: `mock_${jobId}`,
            };
        }
        catch (error) {
            logger_1.logger.error("Mint error:", error);
            return { success: false, error: error.message };
        }
    }
    async queueMint(recipient, amount) {
        const jobId = `mint_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        await redis_1.redis.setex(`job:${jobId}`, 3600, JSON.stringify({
            type: "mint",
            recipient,
            amount,
            status: "pending",
            createdAt: Date.now(),
        }));
        return jobId;
    }
    async getPendingMints() {
        const keys = await redis_1.redis.keys("job:mint_*");
        const jobs = await Promise.all(keys.map(async (key) => {
            const data = await redis_1.redis.get(key);
            return data ? JSON.parse(data) : null;
        }));
        return jobs.filter(Boolean);
    }
}
exports.MintService = MintService;
