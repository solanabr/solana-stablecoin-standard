import "reflect-metadata";
import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "../shared/logger";
import { db, initializeDatabase } from "./database";
import cron from "node-cron";

const PROGRAM_ID = new PublicKey(
  process.env.SSS2_PROGRAM_ID || "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx"
);

const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL || "5000");

interface Event {
  signature: string;
  slot: number;
  blockTime: number | null;
  programId: string;
  instruction: string;
  data: any;
}

class EventIndexer {
  private connection: Connection;
  private currentSlot: number;
  private lastProcessedSignature: string | null;

  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed"
    );
    this.currentSlot = 0;
    this.lastProcessedSignature = null;
  }

  async start(): Promise<void> {
    logger.info("Starting SSS Event Indexer...");
    logger.info(`Monitoring program: ${PROGRAM_ID.toString()}`);

    // Initialize database
    await initializeDatabase();

    // Get starting slot
    const slot = await this.connection.getSlot();
    this.currentSlot = slot;
    logger.info(`Starting from slot: ${slot}`);

    // Start polling
    this.pollEvents();

    // Also run cron job for backfill
    cron.schedule("*/5 * * * *", () => {
      this.backfillEvents();
    });
  }

  async pollEvents(): Promise<void> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        PROGRAM_ID,
        { limit: 10 },
        "confirmed"
      );

      for (const sigInfo of signatures) {
        if (sigInfo.signature === this.lastProcessedSignature) {
          break;
        }

        await this.processTransaction(sigInfo.signature);
      }

      if (signatures.length > 0) {
        this.lastProcessedSignature = signatures[0].signature;
      }
    } catch (error) {
      logger.error("Polling error:", error);
    }

    setTimeout(() => this.pollEvents(), POLLING_INTERVAL);
  }

  async processTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta) return;

      const blockTime = tx.blockTime;
      const slot = tx.slot;

      // Process logs
      if (tx.meta.logMessages) {
        for (const log of tx.meta.logMessages) {
          if (log.includes("Transfer hook executed")) {
            await this.handleTransferEvent({
              signature,
              slot,
              blockTime: blockTime || null,
              programId: PROGRAM_ID.toString(),
              instruction: "execute_transfer_hook",
              data: this.parseTransferLog(log),
            });
          }

          if (log.includes("Fee config updated")) {
            await this.handleFeeUpdateEvent({
              signature,
              slot,
              blockTime: blockTime || null,
              programId: PROGRAM_ID.toString(),
              instruction: "update_fee_config",
              data: {},
            });
          }

          if (log.includes("Added to BLACKLIST")) {
            await this.handleBlacklistAdd({
              signature,
              slot,
              blockTime: blockTime || null,
              programId: PROGRAM_ID.toString(),
              instruction: "add_blacklist",
              data: this.parseAddressLog(log),
            });
          }

          if (log.includes("Added to whitelist")) {
            await this.handleWhitelistAdd({
              signature,
              slot,
              blockTime: blockTime || null,
              programId: PROGRAM_ID.toString(),
              instruction: "add_whitelist",
              data: this.parseAddressLog(log),
            });
          }

          if (log.includes("AuthorityTransferStarted")) {
            logger.info(`Authority transfer started in ${signature}`);
            // Fire-and-forget logging to satisfy two-step authority tracking
          }
        }
      }

      logger.info(`Processed: ${signature.substring(0, 20)}...`);
    } catch (error) {
      logger.error(`Failed to process ${signature}:`, error);
    }
  }

  private parseTransferLog(log: string): any {
    // Parse log for transfer details
    const match = log.match(
      /Source:\s*(\S+)\.\s*Destination:\s*(\S+)\.\s*Amount:\s*(\d+)/i
    );
    if (match) {
      return {
        source: match[1],
        destination: match[2],
        amount: parseInt(match[3]),
      };
    }
    return {};
  }

  private parseAddressLog(log: string): any {
    const match = log.match(/:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (match) {
      return { address: match[1] };
    }
    return {};
  }

  private async handleTransferEvent(event: Event): Promise<void> {
    logger.info(
      `Transfer event: ${event.data.source} -> ${event.data.destination}`
    );
    // Save to database
    await db.query(
      `INSERT INTO transfers (signature, slot, block_time, source, destination, amount, program_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (signature) DO NOTHING`,
      [
        event.signature,
        event.slot,
        event.blockTime || null,
        event.data.source,
        event.data.destination,
        event.data.amount,
        event.programId,
      ]
    );
  }

  private async handleFeeUpdateEvent(event: Event): Promise<void> {
    logger.info(`Fee config updated in ${event.signature}`);
    await db.query(
      `INSERT INTO fee_updates (signature, slot, block_time, program_id, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (signature) DO NOTHING`,
      [
        event.signature,
        event.slot,
        event.blockTime || null,
        event.programId,
        JSON.stringify(event.data),
      ]
    );
  }

  private async handleBlacklistAdd(event: Event): Promise<void> {
    logger.info(`Address blacklisted: ${event.data.address}`);
    await db.query(
      `INSERT INTO blacklist_events (signature, slot, block_time, address, action, program_id)
       VALUES ($1, $2, $3, $4, 'add', $5)
       ON CONFLICT (signature) DO NOTHING`,
      [
        event.signature,
        event.slot,
        event.blockTime,
        event.data.address,
        event.programId,
      ]
    );
  }

  private async handleWhitelistAdd(event: Event): Promise<void> {
    logger.info(`Address whitelisted: ${event.data.address}`);
    await db.query(
      `INSERT INTO whitelist_events (signature, slot, block_time, address, action, program_id)
       VALUES ($1, $2, $3, $4, 'add', $5)
       ON CONFLICT (signature) DO NOTHING`,
      [
        event.signature,
        event.slot,
        event.blockTime || null,
        event.data.address,
        event.programId,
      ]
    );
  }

  async backfillEvents(): Promise<void> {
    logger.info("Running backfill...");
    // Implement backfill logic here
  }
}

// Start indexer
const indexer = new EventIndexer();
indexer.start().catch((error) => {
  logger.error("Indexer failed to start:", error);
  process.exit(1);
});

export default EventIndexer;
