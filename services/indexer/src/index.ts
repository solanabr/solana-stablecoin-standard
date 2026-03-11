import express from "express";
import pinoHttp from "pino-http";
import { parseConfig, redisConfigSchema, createPool, createRedisClient, createLogger, createHealthRouter, createSwaggerRouter } from "@sss/shared";
import { createConnection } from "@sss/shared";
import { PROGRAM_ID } from "@stbr/sss-token";
import { Poller } from "./poller";
import { createIndexerRouter } from "./routes";
import { indexerOpenApiSpec } from "./openapi";

const indexerSchema = redisConfigSchema.extend({});

async function main(): Promise<void> {
  const config = parseConfig(indexerSchema);
  const logger = createLogger("indexer", config.LOG_LEVEL);

  logger.info("Starting indexer service");

  // Infra init
  const pool = createPool(config.DATABASE_URL);
  createRedisClient(config.REDIS_URL);
  const connection = createConnection(config.RPC_URL);

  // Verify DB connection
  await pool.query("SELECT 1");
  logger.info("Database connected");

  // Express app
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
  const pollLimit = parseInt(process.env.POLL_LIMIT ?? "100", 10);
  const debugLogs = process.env.INDEXER_DEBUG_LOGS === "true" || process.env.INDEXER_DEBUG_LOGS === "1";

  app.use(
    createHealthRouter({
      serviceName: "indexer",
      rpcUrl: config.RPC_URL,
      checkRedis: true,
    }),
  );
  app.use(createSwaggerRouter(indexerOpenApiSpec));
  app.use("/", createIndexerRouter());

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Indexer HTTP server listening");
  });

  // Start poller
  const poller = new Poller({
    connection,
    programId: PROGRAM_ID.toBase58(),
    pollIntervalMs,
    pollLimit,
    logger,
    debugLogs,
  });
  poller.start();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    poller.stop();
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
