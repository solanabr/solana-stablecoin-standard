import { PublicKey, Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { logger } from "../../shared/logger";
import { redis } from "../../shared/redis";

interface BurnRequest {
  amount: string;
  authority?: string;
  account?: string;
}

interface BurnResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export class BurnService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
  }

  async burn(request: BurnRequest): Promise<BurnResult> {
    try {
      const { amount, authority, account } = request;

      // Validate amount
      const burnAmount = new BN(amount);
      if (burnAmount.lte(new BN(0))) {
        return { success: false, error: "Invalid burn amount" };
      }

      // Check rate limit
      const key = `burn:${account || "global"}`;
      const current = await redis.get(key);
      if (current && parseInt(current) > 10) {
        return { success: false, error: "Rate limit exceeded" };
      }
      await redis.incr(key);
      await redis.expire(key, 3600);

      // Queue the burn
      const jobId = await this.queueBurn(amount, account);

      logger.info(`Burn queued: jobId=${jobId}, amount=${amount}`);

      return {
        success: true,
        signature: `mock_${jobId}`,
      };
    } catch (error: any) {
      logger.error("Burn error:", error);
      return { success: false, error: error.message };
    }
  }

  private async queueBurn(amount: string, account?: string): Promise<string> {
    const jobId = `burn_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await redis.setex(
      `job:${jobId}`,
      3600,
      JSON.stringify({
        type: "burn",
        amount,
        account,
        status: "pending",
        createdAt: Date.now(),
      })
    );

    return jobId;
  }
}
