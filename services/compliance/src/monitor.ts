import Redis from "ioredis";
import { SSS_EVENTS_CHANNEL, Logger } from "@sss/shared";
import { createAlert } from "./repository";
import { BlacklistService } from "./blacklist";

interface MonitorRules {
  largeMintThreshold: bigint;
  largeBurnThreshold: bigint;
}

interface RedisEventPayload {
  eventId: string;
  eventType: string;
  mint: string;
  slot: number;
  signature: string;
  payload: Record<string, unknown>;
}

export class TransactionMonitor {
  private subClient: Redis;

  constructor(
    redisUrl: string,
    private readonly rules: MonitorRules,
    private readonly blacklistService: BlacklistService,
    private readonly logger: Logger,
  ) {
    this.subClient = new Redis(redisUrl, { lazyConnect: false });
  }

  async start(): Promise<void> {
    this.subClient.on("error", (err) => {
      this.logger.error({ err }, "Monitor Redis error");
    });

    await this.subClient.subscribe(SSS_EVENTS_CHANNEL);
    this.logger.info({ channel: SSS_EVENTS_CHANNEL }, "Transaction monitor subscribed");

    this.subClient.on("message", (_channel, message) => {
      void this.evaluate(message);
    });
  }

  async stop(): Promise<void> {
    await this.subClient.unsubscribe();
    this.subClient.disconnect();
  }

  private async evaluate(message: string): Promise<void> {
    let event: RedisEventPayload;
    try {
      event = JSON.parse(message) as RedisEventPayload;
    } catch {
      return;
    }

    try {
      await this.applyRules(event);
    } catch (err) {
      this.logger.error({ err, eventId: event.eventId }, "Monitor rule evaluation error");
    }
  }

  private async applyRules(event: RedisEventPayload): Promise<void> {
    const { eventId, eventType, mint, payload } = event;

    switch (eventType) {
      case "MintTokensEvent": {
        const amount = BigInt(String(payload.amount ?? 0));
        if (amount >= this.rules.largeMintThreshold) {
          await createAlert({
            eventId,
            mint,
            rule: "large_mint",
            severity: "warning",
            details: { amount: amount.toString(), minter: payload.minter, to: payload.to },
          });
          this.logger.warn({ eventId, mint, amount: amount.toString() }, "Large mint alert");
        }

        // Check if recipient is blacklisted
        if (typeof payload.to === "string") {
          const isBlacklisted = await this.blacklistService.isBlacklisted(payload.to);
          if (isBlacklisted) {
            await createAlert({
              eventId,
              mint,
              rule: "blacklisted_recipient",
              severity: "critical",
              details: { wallet: payload.to, eventType },
            });
            this.logger.error({ eventId, mint, wallet: payload.to }, "Blacklisted recipient in mint");
          }
        }
        break;
      }

      case "BurnTokensEvent": {
        const amount = BigInt(String(payload.amount ?? 0));
        if (amount >= this.rules.largeBurnThreshold) {
          await createAlert({
            eventId,
            mint,
            rule: "large_burn",
            severity: "warning",
            details: { amount: amount.toString(), burner: payload.burner, from: payload.from },
          });
          this.logger.warn({ eventId, mint, amount: amount.toString() }, "Large burn alert");
        }
        break;
      }

      case "SeizeEvent": {
        await createAlert({
          eventId,
          mint,
          rule: "seize_event",
          severity: "critical",
          details: { seizer: payload.seizer, from: payload.from, to: payload.to },
        });
        this.logger.warn({ eventId, mint }, "Seize event alert");
        break;
      }

      case "AddToBlacklistEvent": {
        await createAlert({
          eventId,
          mint,
          rule: "blacklist_add",
          severity: "info",
          details: { wallet: payload.blacklisted, reason: payload.reason },
        });
        break;
      }

      case "FreezeAccountEvent": {
        await createAlert({
          eventId,
          mint,
          rule: "account_freeze",
          severity: "info",
          details: { ata: payload.ata_to_freeze },
        });
        break;
      }
    }
  }
}
