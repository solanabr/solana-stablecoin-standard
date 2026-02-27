import { PublicKey, Connection, Keypair, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { logger } from "../../shared/logger";
import { redis } from "../../shared/redis";

interface MintRequest {
  recipient: string;
  amount: string;
  authority?: string;
}

interface MintResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export class MintService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
  }

  async mint(request: MintRequest): Promise<MintResult> {
    try {
      const { recipient, amount, authority } = request;

      // Validate recipient
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(recipient);
      } catch {
        return { success: false, error: "Invalid recipient address" };
      }

      // Check rate limit
      const key = `mint:${recipient}`;
      const current = await redis.get(key);
      if (current && parseInt(current) > 10) {
        return { success: false, error: "Rate limit exceeded" };
      }
      await redis.incr(key);
      await redis.expire(key, 3600);

      // Queue the mint (in production, this would be processed by a worker)
      const jobId = await this.queueMint(recipient, amount);

      logger.info(
        `Mint queued: jobId=${jobId}, recipient=${recipient}, amount=${amount}`
      );

      // For demo, return a mock signature
      return {
        success: true,
        signature: `mock_${jobId}`,
      };
    } catch (error: any) {
      logger.error("Mint error:", error);
      return { success: false, error: error.message };
    }
  }

  private async queueMint(recipient: string, amount: string): Promise<string> {
    const jobId = `mint_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await redis.setex(
      `job:${jobId}`,
      3600,
      JSON.stringify({
        type: "mint",
        recipient,
        amount,
        status: "pending",
        createdAt: Date.now(),
      })
    );

    return jobId;
  }

  async getPendingMints(): Promise<any[]> {
    const keys = await redis.keys("job:mint_*");
    const jobs = await Promise.all(
      keys.map(async (key) => {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
      })
    );
    return jobs.filter(Boolean);
  }
}
