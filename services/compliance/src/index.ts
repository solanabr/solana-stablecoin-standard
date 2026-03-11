import express from "express";
import pinoHttp from "pino-http";
import {
  parseConfig,
  complianceConfigSchema,
  createPool,
  createRedisClient,
  createLogger,
  createHealthRouter,
  createSwaggerRouter,
  createConnection,
  keypairFromEnv,
} from "@sss/shared";
import { BlacklistService } from "./blacklist";
import { ScreeningService, createScreeningProvider } from "./screening";
import { TransactionMonitor } from "./monitor";
import { createComplianceRouter } from "./routes";
import { complianceOpenApiSpec } from "./openapi";

async function main(): Promise<void> {
  const config = parseConfig(complianceConfigSchema);
  const logger = createLogger("compliance", config.LOG_LEVEL);

  logger.info("Starting compliance service");

  const pool = createPool(config.DATABASE_URL);
  await pool.query("SELECT 1");
  createRedisClient(config.REDIS_URL);
  logger.info("Infrastructure connected");

  const connection = createConnection(config.RPC_URL);
  const blacklisterKeypair = keypairFromEnv(config.BLACKLISTER_PRIVATE_KEY);

  logger.info(
    { blacklister: blacklisterKeypair.publicKey.toBase58() },
    "Loaded keypairs",
  );

  const blacklistService = new BlacklistService(
    connection,
    config.MINT_PUBKEY,
    blacklisterKeypair,
    logger,
  );

  const screeningProvider = createScreeningProvider(
    config.SANCTIONS_API_URL,
    config.SANCTIONS_API_KEY,
  );
  const screeningService = new ScreeningService(screeningProvider, logger);

  const monitor = new TransactionMonitor(
    config.REDIS_URL,
    {
      largeMintThreshold: config.LARGE_MINT_THRESHOLD,
      largeBurnThreshold: config.LARGE_BURN_THRESHOLD,
    },
    blacklistService,
    logger,
  );
  await monitor.start();

  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use(
    createHealthRouter({
      serviceName: "compliance",
      rpcUrl: config.RPC_URL,
      checkRedis: true,
    }),
  );
  app.use(createSwaggerRouter(complianceOpenApiSpec));
  app.use("/", createComplianceRouter(blacklistService, screeningService));

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Compliance HTTP server listening");
  });

  const shutdown = async () => {
    logger.info("Shutting down...");
    await monitor.stop();
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
