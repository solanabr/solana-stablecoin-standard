import Redis from "ioredis";

let client: Redis | null = null;

export function createRedisClient(redisUrl: string): Redis {
  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("error", (err) => {
    console.error("Redis client error", err);
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!client)
    throw new Error("Redis client not initialized. Call createRedisClient first.");
  return client;
}

export async function publishEvent(
  channel: string,
  payload: unknown,
): Promise<void> {
  await getRedisClient().publish(channel, JSON.stringify(payload));
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    await getRedisClient().ping();
    return true;
  } catch {
    return false;
  }
}

export const SSS_EVENTS_CHANNEL = "sss:events";
export const WEBHOOK_JOBS_KEY = "sss:webhook_jobs";
