import express from "express";
import pinoHttp from "pino-http";
import {
  parseConfig,
  mintBurnConfigSchema,
  createPool,
  createLogger,
  createHealthRouter,
  createSwaggerRouter,
  createConnection,
  keypairFromEnv,
} from "@sss/shared";
import { MintBurnService } from "./service";
import { createMintBurnRouter } from "./routes";
import { mintBurnOpenApiSpec } from "./openapi";

async function main(): Promise<void> {
  const config = parseConfig(mintBurnConfigSchema);
  const logger = createLogger("mint-burn", config.LOG_LEVEL);

  logger.info("Starting mint-burn service");

  const pool = createPool(config.DATABASE_URL);
  await pool.query("SELECT 1");
  logger.info("Database connected");

  const connection = createConnection(config.RPC_URL);
  const minterKeypair = keypairFromEnv(config.MINTER_PRIVATE_KEY);
  const burnerKeypair = keypairFromEnv(config.BURNER_PRIVATE_KEY);

  logger.info(
    { minter: minterKeypair.publicKey.toBase58(), burner: burnerKeypair.publicKey.toBase58() },
    "Loaded keypairs",
  );

  const service = new MintBurnService({
    connection,
    mintPubkey: config.MINT_PUBKEY,
    minterKeypair,
    burnerKeypair,
    complianceServiceUrl: config.COMPLIANCE_SERVICE_URL,
    screenBeforeMint: config.SCREEN_BEFORE_MINT ?? false,
    logger,
  });

  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use(createHealthRouter({ serviceName: "mint-burn", rpcUrl: config.RPC_URL }));
  app.use(createSwaggerRouter(mintBurnOpenApiSpec));
  app.use("/", createMintBurnRouter(service));

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Mint-burn HTTP server listening");
  });

  const shutdown = () => {
    logger.info("Shutting down...");
    server.close(() => {
      pool.end().then(() => process.exit(0));
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal error", err);
  process.exit(1);
});
