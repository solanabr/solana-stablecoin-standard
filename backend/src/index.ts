import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { logger } from "./services/logger";
import { operationsRouter } from "./routes/operations";
import { complianceRouter } from "./routes/compliance";
import { healthRouter } from "./routes/health";
import { EventListenerService } from "./services/event-listener";
import { WebhookService } from "./services/webhook";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/api/v1/operations", operationsRouter);
app.use("/api/v1/compliance", complianceRouter);
app.use("/api/v1/health", healthRouter);

const eventListener = new EventListenerService();
const webhookService = new WebhookService();

eventListener.on("event", (event) => {
  webhookService.dispatch(event).catch((err) => {
    logger.error("Webhook dispatch failed", { error: err.message });
  });
});

app.listen(PORT, HOST, () => {
  logger.info(`SSS Backend running on ${HOST}:${PORT}`);

  if (process.env.MINT_ADDRESS) {
    eventListener.start(process.env.MINT_ADDRESS).catch((err) => {
      logger.error("Event listener failed to start", { error: err.message });
    });
  } else {
    logger.warn("No MINT_ADDRESS configured — event listener not started");
  }
});

process.on("SIGTERM", async () => {
  logger.info("Shutting down...");
  await eventListener.stop();
  process.exit(0);
});
