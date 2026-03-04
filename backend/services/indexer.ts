import { Connection, PublicKey, Logs, Context } from "@solana/web3.js";
import pino from "pino";

const log = pino({ name: "sss-indexer" });

export interface IndexedEvent {
  type: "mint" | "burn" | "freeze" | "thaw" | "pause" | "unpause" | "blacklist" | "seize" | "transfer";
  signature: string;
  slot: number;
  timestamp: number;
  data: Record<string, string>;
}

type EventHandler = (event: IndexedEvent) => Promise<void>;

/**
 * On-chain event indexer. Subscribes to program logs via websocket and
 * parses structured events from msg!() output for storage and dispatch.
 */
export class EventIndexer {
  private connection: Connection;
  private programId: PublicKey;
  private subscriptionId: number | null = null;
  private handlers: EventHandler[] = [];
  private processedSigs = new Set<string>();
  private maxCacheSize = 10_000;

  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this.programId = programId;
  }

  onEvent(handler: EventHandler): this {
    this.handlers.push(handler);
    return this;
  }

  async start(): Promise<void> {
    log.info({ program: this.programId.toBase58() }, "Starting event indexer");

    this.subscriptionId = this.connection.onLogs(
      this.programId,
      (logs: Logs, ctx: Context) => {
        this.handleLogs(logs, ctx).catch((err) => {
          log.error({ err, signature: logs.signature }, "Failed to process logs");
        });
      },
      "confirmed"
    );

    log.info("Event indexer running");
  }

  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      log.info("Event indexer stopped");
    }
  }

  /**
   * Backfill from recent transaction history. Useful after restarts.
   */
  async backfill(startSlot: number, endSlot?: number): Promise<number> {
    const signatures = await this.connection.getSignaturesForAddress(
      this.programId,
      { limit: 1000 },
      "confirmed"
    );

    let count = 0;
    for (const sigInfo of signatures) {
      if (sigInfo.slot < startSlot) continue;
      if (endSlot && sigInfo.slot > endSlot) continue;
      if (this.processedSigs.has(sigInfo.signature)) continue;

      const tx = await this.connection.getTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.meta?.logMessages) continue;

      const events = this.parseLogMessages(
        tx.meta.logMessages,
        sigInfo.signature,
        sigInfo.slot
      );
      for (const event of events) {
        await this.dispatch(event);
        count++;
      }
    }

    log.info({ count, startSlot, endSlot }, "Backfill complete");
    return count;
  }

  private async handleLogs(logs: Logs, ctx: Context): Promise<void> {
    if (logs.err) return;
    if (this.processedSigs.has(logs.signature)) return;

    // Evict old entries to bound memory
    if (this.processedSigs.size >= this.maxCacheSize) {
      const iter = this.processedSigs.values();
      for (let i = 0; i < 1000; i++) {
        const next = iter.next();
        if (next.done) break;
        this.processedSigs.delete(next.value);
      }
    }
    this.processedSigs.add(logs.signature);

    const events = this.parseLogMessages(logs.logs, logs.signature, ctx.slot);
    for (const event of events) {
      await this.dispatch(event);
    }
  }

  private parseLogMessages(
    logLines: string[],
    signature: string,
    slot: number
  ): IndexedEvent[] {
    const events: IndexedEvent[] = [];
    const now = Date.now();

    for (const line of logLines) {
      const mintMatch = line.match(/Minted (\d+) to (\w+) \(supply_cap=(\d+)\)/);
      if (mintMatch) {
        events.push({
          type: "mint",
          signature,
          slot,
          timestamp: now,
          data: { amount: mintMatch[1], destination: mintMatch[2], supplyCap: mintMatch[3] },
        });
        continue;
      }

      const burnMatch = line.match(/Burned (\d+) from (\w+)/);
      if (burnMatch) {
        events.push({
          type: "burn",
          signature,
          slot,
          timestamp: now,
          data: { amount: burnMatch[1], source: burnMatch[2] },
        });
        continue;
      }

      const freezeMatch = line.match(/Froze account (\w+)/);
      if (freezeMatch) {
        events.push({ type: "freeze", signature, slot, timestamp: now, data: { account: freezeMatch[1] } });
        continue;
      }

      const thawMatch = line.match(/Thawed account (\w+)/);
      if (thawMatch) {
        events.push({ type: "thaw", signature, slot, timestamp: now, data: { account: thawMatch[1] } });
        continue;
      }

      if (line.includes("Token paused by")) {
        const m = line.match(/Token paused by (\w+)/);
        events.push({ type: "pause", signature, slot, timestamp: now, data: { authority: m?.[1] ?? "" } });
        continue;
      }

      if (line.includes("Token unpaused by")) {
        const m = line.match(/Token unpaused by (\w+)/);
        events.push({ type: "unpause", signature, slot, timestamp: now, data: { authority: m?.[1] ?? "" } });
        continue;
      }

      const blAddMatch = line.match(/Added (\w+) to blacklist/);
      if (blAddMatch) {
        events.push({ type: "blacklist", signature, slot, timestamp: now, data: { address: blAddMatch[1], action: "add" } });
        continue;
      }

      const blRemoveMatch = line.match(/Removed (\w+) from blacklist/);
      if (blRemoveMatch) {
        events.push({ type: "blacklist", signature, slot, timestamp: now, data: { address: blRemoveMatch[1], action: "remove" } });
        continue;
      }

      const seizeMatch = line.match(/Seized (\d+) tokens from (\w+) \(owner: (\w+)\) -> treasury (\w+)/);
      if (seizeMatch) {
        events.push({
          type: "seize",
          signature,
          slot,
          timestamp: now,
          data: { amount: seizeMatch[1], sourceAccount: seizeMatch[2], owner: seizeMatch[3], treasury: seizeMatch[4] },
        });
        continue;
      }

      const hookMatch = line.match(/Transfer hook passed: (\w+) -> (\w+)/);
      if (hookMatch) {
        events.push({ type: "transfer", signature, slot, timestamp: now, data: { source: hookMatch[1], destination: hookMatch[2] } });
      }
    }

    return events;
  }

  private async dispatch(event: IndexedEvent): Promise<void> {
    log.debug({ type: event.type, signature: event.signature }, "Dispatching event");
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (err) {
        log.error({ err, event }, "Event handler failed");
      }
    }
  }
}
