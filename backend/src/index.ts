import "dotenv/config";
import { Connection } from "@solana/web3.js";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { subscribeToProgramLogs } from "./events";
import { logger } from "./logger";

const env = loadEnv();
const connection = new Connection(env.RPC_URL);
const app = createApp();

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, rpc: env.RPC_URL, mint: env.MINT_ADDRESS ?? null },
    "SSS backend listening"
  );
  subscribeToProgramLogs(connection);
});
