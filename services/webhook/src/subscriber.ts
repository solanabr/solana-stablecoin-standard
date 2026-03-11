import Redis from "ioredis";
import { SSS_EVENTS_CHANNEL, Logger } from "@sss/shared";
import {
  findMatchingSubscriptions,
  createDelivery,
  getPendingRetries,
} from "./repository";
import { Dispatcher } from "./dispatcher";

interface RedisEventPayload {
  eventId: string;
  eventType: string;
  mint: string;
  slot: number;
  signature: string;
  payload: Record<string, unknown>;
}

export class EventSubscriber {
  private subClient: Redis;

  constructor(
    redisUrl: string,
    private readonly dispatcher: Dispatcher,
    private readonly logger: Logger,
  ) {
    // Use a dedicated connection for subscriptions (cannot run other commands while subscribed)
    this.subClient = new Redis(redisUrl, { lazyConnect: false });
  }

  async start(): Promise<void> {
    this.subClient.on("error", (err) => {
      this.logger.error({ err }, "Redis subscriber error");
    });

    await this.subClient.subscribe(SSS_EVENTS_CHANNEL);
    this.logger.info({ channel: SSS_EVENTS_CHANNEL }, "Subscribed to SSS events");

    this.subClient.on("message", (_channel, message) => {
      void this.handleMessage(message);
    });
  }

  private async handleMessage(message: string): Promise<void> {
    let event: RedisEventPayload;
    try {
      event = JSON.parse(message) as RedisEventPayload;
    } catch {
      this.logger.warn({ message }, "Failed to parse event message");
      return;
    }

    this.logger.debug(
      { eventId: event.eventId, eventType: event.eventType, mint: event.mint },
      "Received SSS event",
    );

    try {
      const subscriptions = await findMatchingSubscriptions(event.eventType, event.mint);

      for (const subscription of subscriptions) {
        const delivery = await createDelivery({
          subscriptionId: subscription.id,
          eventId: event.eventId,
        });

        this.dispatcher.enqueue({
          delivery,
          subscription,
          eventPayload: {
            eventId: event.eventId,
            eventType: event.eventType,
            mint: event.mint,
            slot: event.slot,
            signature: event.signature,
            data: event.payload,
          },
        });
      }
    } catch (err) {
      this.logger.error({ err, eventId: event.eventId }, "Failed to handle SSS event");
    }
  }

  async stop(): Promise<void> {
    await this.subClient.unsubscribe();
    this.subClient.disconnect();
  }
}

export async function startRetryTicker(
  dispatcher: Dispatcher,
  intervalMs: number,
  logger: Logger,
): Promise<NodeJS.Timeout> {
  const tick = async () => {
    try {
      const pending = await getPendingRetries();
      if (pending.length > 0) {
        logger.debug({ count: pending.length }, "Retry ticker found pending deliveries");
        dispatcher.enqueueMany(
          pending.map((row) => ({
            delivery: row,
            subscription: row.subscription,
            eventPayload: row.event_payload,
          })),
        );
      }
    } catch (err) {
      logger.error({ err }, "Retry ticker error");
    }
  };

  await tick();
  return setInterval(() => void tick(), intervalMs);
}
