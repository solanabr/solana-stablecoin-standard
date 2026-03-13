/**
 * Event listener — monitors on-chain events and dispatches webhooks.
 * @module services/listener
 */

import { Connection, PublicKey } from "@solana/web3.js";
import type { FastifyBaseLogger } from "fastify";
import type { WebhookService } from "./webhook";

export class EventListener {
  private readonly connection: Connection;
  private readonly configPda: PublicKey;
  private readonly logger: FastifyBaseLogger;
  private readonly webhook: WebhookService;
  private subscriptionId: number | null = null;
  private lastSignature: string | null = null;

  constructor(
    rpcUrl: string,
    configPda: PublicKey,
    logger: FastifyBaseLogger,
    webhook: WebhookService
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.configPda = configPda;
    this.logger = logger;
    this.webhook = webhook;
  }

  /** Start polling for new transactions */
  async start(intervalMs: number = 5000): Promise<void> {
    this.logger.info(
      { configPda: this.configPda.toBase58(), intervalMs },
      "Event listener started"
    );

    // Initial fetch to set baseline
    const initial = await this.connection.getSignaturesForAddress(
      this.configPda, { limit: 1 }
    );
    if (initial.length > 0) {
      this.lastSignature = initial[0].signature;
    }

    // Poll for new transactions
    const poll = async () => {
      try {
        const opts = this.lastSignature
          ? { until: this.lastSignature, limit: 50 }
          : { limit: 1 };

        const sigs = await this.connection.getSignaturesForAddress(
          this.configPda, opts
        );

        if (sigs.length > 0) {
          this.lastSignature = sigs[0].signature;

          for (const sig of sigs.reverse()) {
            this.logger.info(
              { signature: sig.signature.slice(0, 16), status: sig.err ? "fail" : "ok" },
              "New transaction detected"
            );

            this.webhook.notify("transaction", {
              signature: sig.signature,
              blockTime: sig.blockTime
                ? new Date(sig.blockTime * 1000).toISOString()
                : null,
              status: sig.err ? "failed" : "success",
              memo: sig.memo ?? null,
            });
          }
        }
      } catch (err) {
        this.logger.error({ err: (err as Error).message }, "Event poll error");
      }
    };

    // Run first poll immediately, then on interval
    await poll();
    setInterval(poll, intervalMs);
  }

  /** Subscribe to account changes via WebSocket */
  subscribeToConfig(): void {
    this.subscriptionId = this.connection.onAccountChange(
      this.configPda,
      (accountInfo) => {
        this.logger.info("Config account changed");
        this.webhook.notify("config_changed", {
          dataLength: accountInfo.data.length,
          lamports: accountInfo.lamports,
        });
      },
      "confirmed"
    );
    this.logger.info("Subscribed to config account changes");
  }

  /** Stop listeners */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
    }
    this.logger.info("Event listener stopped");
  }
}
