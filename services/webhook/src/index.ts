import express from "express";
import pinoHttp from "pino-http";
import {
  parseConfig,
  redisConfigSchema,
  createPool,
  createRedisClient,
  createLogger,
  createHealthRouter,
  createSwaggerRouter,
} from "@sss/shared";
import { Dispatcher } from "./dispatcher";
import { EventSubscriber, startRetryTicker } from "./subscriber";
import { createWebhookRouter } from "./routes";
import { webhookOpenApiSpec } from "./openapi";

const webhookConfigSchema = redisConfigSchema.extend({});

async function main(): Promise<void> {
  const config = parseConfig(webhookConfigSchema);
  const logger = createLogger("webhook", config.LOG_LEVEL);

  logger.info("Starting webhook service");

  const pool = createPool(config.DATABASE_URL);
  await pool.query("SELECT 1");
  createRedisClient(config.REDIS_URL);
  logger.info("Infrastructure connected");

  const timeoutMs = parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? "10000", 10);
  const maxAttempts = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS ?? "6", 10);
  const baseDelayMs = parseInt(process.env.WEBHOOK_BASE_DELAY_MS ?? "30000", 10);
  const retryTickMs = parseInt(process.env.RETRY_TICK_MS ?? "15000", 10);

  const dispatcher = new Dispatcher({ timeoutMs, maxAttempts, baseDelayMs, logger });

  const subscriber = new EventSubscriber(config.REDIS_URL, dispatcher, logger);
  await subscriber.start();

  const retryTicker = await startRetryTicker(dispatcher, retryTickMs, logger);

  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use(createHealthRouter({ serviceName: "webhook", checkRedis: true }));
  app.use(createSwaggerRouter(webhookOpenApiSpec));
  app.use("/", createWebhookRouter());

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Webhook HTTP server listening");
  });

  const shutdown = async () => {
    logger.info("Shutting down...");
    clearInterval(retryTicker);
    await subscriber.stop();
    server.close(() => {
      pool.end().then(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch((err) => {
  console.error("Fatal error", err);
  process.exit(1);
});
