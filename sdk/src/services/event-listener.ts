import { Connection, PublicKey, Logs, Context } from "@solana/web3.js";
import { MintEvent, BurnEvent, TransferEvent } from "../types";

type EventCallback<T> = (event: T) => void;

/**
 * Listens for SSS token events by subscribing to program logs.
 * Parses mint, burn, and transfer events from on-chain log messages.
 */
export class SssEventListener {
  private connection: Connection;
  private programId: PublicKey;
  private subscriptionId: number | null = null;
  private handlers: Map<string, EventCallback<any>[]> = new Map();

  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this.programId = programId;
  }

  /**
   * Register a callback for mint events.
   */
  onMint(callback: EventCallback<MintEvent>): this {
    this.addHandler("mint", callback);
    return this;
  }

  /**
   * Register a callback for burn events.
   */
  onBurn(callback: EventCallback<BurnEvent>): this {
    this.addHandler("burn", callback);
    return this;
  }

  /**
   * Register a callback for transfer events (hook executions).
   */
  onTransfer(callback: EventCallback<TransferEvent>): this {
    this.addHandler("transfer", callback);
    return this;
  }

  /**
   * Start listening. Returns the subscription ID.
   */
  start(): number {
    if (this.subscriptionId !== null) {
      throw new Error("Already listening — call stop() first");
    }

    this.subscriptionId = this.connection.onLogs(
      this.programId,
      (logs: Logs, ctx: Context) => {
        this.parseLogs(logs, ctx);
      },
      "confirmed"
    );

    return this.subscriptionId;
  }

  /**
   * Stop listening and clean up the subscription.
   */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
  }

  private addHandler(event: string, callback: EventCallback<any>): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(callback);
    this.handlers.set(event, existing);
  }

  private parseLogs(logs: Logs, ctx: Context): void {
    if (logs.err) return;

    for (const log of logs.logs) {
      // Anchor program logs follow the format: "Program log: Minted X to Y (supply_cap=Z)"
      if (log.includes("Minted ")) {
        const match = log.match(
          /Minted (\d+) to (\w+) \(supply_cap=(\d+)\)/
        );
        if (match) {
          const event: Partial<MintEvent> = {
            amount: BigInt(match[1]),
            destination: new PublicKey(match[2]),
            timestamp: Date.now(),
          };
          this.emit("mint", event);
        }
      }

      if (log.includes("Burned ")) {
        const match = log.match(/Burned (\d+) from (\w+)/);
        if (match) {
          const event: Partial<BurnEvent> = {
            amount: BigInt(match[1]),
            source: new PublicKey(match[2]),
            timestamp: Date.now(),
          };
          this.emit("burn", event);
        }
      }

      if (log.includes("Transfer hook passed")) {
        const match = log.match(
          /Transfer hook passed: (\w+) -> (\w+)/
        );
        if (match) {
          const event: Partial<TransferEvent> = {
            source: new PublicKey(match[1]),
            destination: new PublicKey(match[2]),
            timestamp: Date.now(),
          };
          this.emit("transfer", event);
        }
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.handlers.get(event) ?? [];
    for (const cb of callbacks) {
      try {
        cb(data);
      } catch (err) {
        console.error(`Event handler error (${event}):`, err);
      }
    }
  }
}
