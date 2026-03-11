import { Job } from "bullmq";
import pino from "pino";
import {
  insertEvent,
  updateBlacklistStatus,
  updateMinterActivity,
} from "./db";
import { createEventWorker, EventJobData } from "./queue";
import { dispatchWebhooks } from "./webhook";

const logger = pino({ name: "worker" });

async function processEvent(job: Job<EventJobData>): Promise<void> {
  const { mint, eventType, txSignature, slot, data } = job.data;

  // Insert event into database
  await insertEvent(mint, eventType, txSignature, slot, data);

  // Update derived tables based on event type
  switch (eventType) {
    case "BlacklistEvent": {
      const action = (data as any).action;
      const wallet = (data as any).wallet;
      const reason = (data as any).reason;
      if (action === "Add") {
        await updateBlacklistStatus(mint, wallet, true, reason);
      } else if (action === "Remove") {
        await updateBlacklistStatus(mint, wallet, false);
      }
      break;
    }
    case "MintEvent": {
      const minter = (data as any).minter;
      if (minter) {
        await updateMinterActivity(
          mint,
          minter,
          BigInt((data as any).remainingAllowance || 0),
          BigInt((data as any).totalMinted || 0),
          true
        );
      }
      break;
    }
  }

  // Dispatch webhooks
  await dispatchWebhooks(mint, eventType, txSignature, data);
}

// Start the worker
const worker = createEventWorker(processEvent);

logger.info("Worker started, waiting for events...");

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Shutting down worker...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Shutting down worker...");
  await worker.close();
  process.exit(0);
});
