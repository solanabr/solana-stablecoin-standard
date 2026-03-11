import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";

const logger = pino({ name: "queue" });

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const eventQueue = new Queue("sss-events", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export interface EventJobData {
  mint: string;
  eventType: string;
  txSignature: string;
  slot: number;
  data: Record<string, unknown>;
}

export async function enqueueEvent(data: EventJobData): Promise<void> {
  await eventQueue.add(data.eventType, data);
  logger.info({ eventType: data.eventType, tx: data.txSignature }, "Event enqueued");
}

export function createEventWorker(
  processor: (job: Job<EventJobData>) => Promise<void>
): Worker<EventJobData> {
  const worker = new Worker<EventJobData>("sss-events", processor, {
    connection,
    concurrency: 5,
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, eventType: job.name }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "Job failed");
  });

  return worker;
}

export { connection as redisConnection };
