import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { EventEmitter } from "events";
import { logger } from "./logger";

export interface StablecoinEvent {
  type: string;
  data: Record<string, any>;
  signature: string;
  slot: number;
  timestamp: Date;
}

/**
 * On-chain event listener/indexer service.
 * Monitors program logs for stablecoin events and emits them
 * for downstream processing (webhooks, off-chain state).
 */
export class EventListenerService extends EventEmitter {
  private connection: Connection | null = null;
  private subscriptionId: number | null = null;
  private running = false;

  constructor() {
    super();
  }

  async start(mintAddress: string): Promise<void> {
    if (this.running) {
      logger.warn("Event listener already running");
      return;
    }

    const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
    const wsUrl = process.env.WS_URL || rpcUrl.replace("https", "wss");

    this.connection = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: wsUrl,
    });

    const programId = new PublicKey(
      process.env.PROGRAM_ID || "SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz"
    );

    this.subscriptionId = this.connection.onLogs(
      programId,
      (logs: Logs) => {
        this.processLogs(logs);
      },
      "confirmed"
    );

    this.running = true;
    logger.info("Event listener started", {
      programId: programId.toBase58(),
      mint: mintAddress,
    });
  }

  async stop(): Promise<void> {
    if (!this.running || !this.connection || this.subscriptionId === null) {
      return;
    }

    await this.connection.removeOnLogsListener(this.subscriptionId);
    this.running = false;
    this.subscriptionId = null;
    logger.info("Event listener stopped");
  }

  private processLogs(logs: Logs): void {
    const eventPrefixes = [
      "StablecoinInitialized",
      "TokensMinted",
      "TokensBurned",
      "AccountFrozenEvent",
      "AccountThawedEvent",
      "StablecoinPaused",
      "StablecoinUnpaused",
      "BlacklistAdded",
      "BlacklistRemoved",
      "TokensSeized",
      "RoleUpdated",
      "MinterUpdated",
      "AuthorityTransferred",
    ];

    for (const log of logs.logs) {
      if (!log.startsWith("Program data:")) continue;

      const dataStr = log.replace("Program data: ", "");
      for (const prefix of eventPrefixes) {
        try {
          const decoded = Buffer.from(dataStr, "base64");
          const event: StablecoinEvent = {
            type: prefix,
            data: { raw: dataStr },
            signature: logs.signature,
            slot: 0, // populated by downstream
            timestamp: new Date(),
          };

          this.emit("event", event);
          logger.debug("Event detected", {
            type: prefix,
            signature: logs.signature,
          });
          break;
        } catch {
          // Not this event type, continue
        }
      }
    }
  }
}
