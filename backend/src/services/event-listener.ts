import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { logger } from "./logger";
import { sendWebhook } from "./webhook";

export interface ParsedEvent {
  program: "sss-core" | "sss-transfer-hook";
  type: string;
  signature: string;
  data: Record<string, string>;
  timestamp: number;
}

// Known event prefixes emitted by the programs
const CORE_EVENT_PREFIXES = [
  "Initialized",
  "TokensMinted",
  "TokensBurned",
  "AccountFrozen",
  "AccountThawed",
  "Paused",
  "Unpaused",
  "Seized",
  "RoleGranted",
  "RoleRevoked",
  "SupplyCapUpdated",
];

const HOOK_EVENT_PREFIXES = [
  "BlacklistAdded",
  "BlacklistRemoved",
  "TransferChecked",
];

/**
 * WebSocket event listener for on-chain SSS program events.
 * Subscribes to program log events and parses known event types.
 */
export class EventListener {
  private connection: Connection;
  private coreProgramId: PublicKey;
  private hookProgramId: PublicKey;
  private coreSubscriptionId: number | null = null;
  private hookSubscriptionId: number | null = null;

  constructor(
    connection: Connection,
    coreProgramId: PublicKey,
    hookProgramId: PublicKey,
  ) {
    this.connection = connection;
    this.coreProgramId = coreProgramId;
    this.hookProgramId = hookProgramId;
  }

  /**
   * Start listening for program log events via WebSocket.
   */
  start(): void {
    this.coreSubscriptionId = this.connection.onLogs(
      this.coreProgramId,
      (logs) => this.handleLogs(logs, "sss-core", CORE_EVENT_PREFIXES),
      "confirmed",
    );

    this.hookSubscriptionId = this.connection.onLogs(
      this.hookProgramId,
      (logs) => this.handleLogs(logs, "sss-transfer-hook", HOOK_EVENT_PREFIXES),
      "confirmed",
    );

    logger.info("Event listener subscriptions active", {
      core: this.coreProgramId.toBase58(),
      hook: this.hookProgramId.toBase58(),
    });
  }

  /**
   * Stop listening for events and remove WebSocket subscriptions.
   */
  async stop(): Promise<void> {
    if (this.coreSubscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.coreSubscriptionId);
      this.coreSubscriptionId = null;
    }
    if (this.hookSubscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.hookSubscriptionId);
      this.hookSubscriptionId = null;
    }
    logger.info("Event listener subscriptions removed");
  }

  /**
   * Parse program logs for known event patterns.
   */
  private handleLogs(
    logs: Logs,
    program: "sss-core" | "sss-transfer-hook",
    knownPrefixes: string[],
  ): void {
    if (logs.err) {
      logger.debug("Transaction with error, skipping event parse", {
        signature: logs.signature,
        error: JSON.stringify(logs.err),
      });
      return;
    }

    for (const log of logs.logs) {
      // Anchor events are emitted as "Program data: <base64>"
      // Program log messages use "Program log: <message>"
      if (!log.startsWith("Program log:") && !log.startsWith("Program data:")) {
        continue;
      }

      const message = log.replace(/^Program (log|data): /, "");

      for (const prefix of knownPrefixes) {
        if (message.includes(prefix)) {
          const event: ParsedEvent = {
            program,
            type: prefix,
            signature: logs.signature,
            data: this.extractEventData(message),
            timestamp: Date.now(),
          };

          logger.info("On-chain event detected", {
            program: event.program,
            type: event.type,
            signature: event.signature,
          });

          // Fire-and-forget webhook notification
          sendWebhook(event).catch((err) => {
            logger.warn("Webhook dispatch failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          });

          break;
        }
      }
    }
  }

  /**
   * Best-effort extraction of key-value pairs from event log messages.
   * Anchor events are base64-encoded, but program log messages may contain
   * human-readable data. This handles both gracefully.
   */
  private extractEventData(message: string): Record<string, string> {
    const data: Record<string, string> = {};

    // Try to parse as key=value pairs (common in program log messages)
    const kvPairs = message.match(/(\w+)=([^\s,]+)/g);
    if (kvPairs) {
      for (const pair of kvPairs) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex > 0) {
          data[pair.substring(0, eqIndex)] = pair.substring(eqIndex + 1);
        }
      }
    }

    // If no key-value pairs found, store the raw message
    if (Object.keys(data).length === 0) {
      data.raw = message;
    }

    return data;
  }
}
