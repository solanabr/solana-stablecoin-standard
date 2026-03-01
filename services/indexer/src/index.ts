import { Connection, PublicKey } from "@solana/web3.js";
import { createLogger, format, transports } from "winston";
import dotenv from "dotenv";

dotenv.config();

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  process.env.SSS_PROGRAM_ID || "SSStoken11111111111111111111111111111111111"
);

const RPC_URL = process.env.RPC_URL || "http://localhost:8899";
const WS_URL = process.env.WS_URL || "ws://localhost:8900";

async function main() {
  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    wsEndpoint: WS_URL,
  });

  logger.info("SSS Indexer starting", {
    rpcUrl: RPC_URL,
    programId: SSS_TOKEN_PROGRAM_ID.toBase58(),
  });

  // Subscribe to program logs
  const subscriptionId = connection.onLogs(
    SSS_TOKEN_PROGRAM_ID,
    (logs) => {
      const { signature, logs: logMessages } = logs;

      // Parse SSS-specific log messages
      const sssLogs = logMessages.filter((l) => l.startsWith("Program log: SSS:"));

      if (sssLogs.length > 0) {
        logger.info("SSS Event", {
          signature,
          events: sssLogs,
          slot: logs.err ? "error" : "success",
        });

        // In production: store events in a database, emit webhooks, etc.
        for (const log of sssLogs) {
          processEvent(signature, log);
        }
      }
    },
    "confirmed"
  );

  logger.info(`Subscribed to SSS program logs (subscription: ${subscriptionId})`);

  // Keep alive
  process.on("SIGINT", async () => {
    logger.info("Shutting down indexer...");
    await connection.removeOnLogsListener(subscriptionId);
    process.exit(0);
  });
}

function processEvent(signature: string, log: string) {
  // Parse event type from log message
  if (log.includes("Initialized stablecoin")) {
    logger.info("Event: StablecoinInitialized", { signature, log });
  } else if (log.includes("Minted")) {
    logger.info("Event: TokensMinted", { signature, log });
  } else if (log.includes("Burned")) {
    logger.info("Event: TokensBurned", { signature, log });
  } else if (log.includes("Froze")) {
    logger.info("Event: AccountFrozen", { signature, log });
  } else if (log.includes("Thawed")) {
    logger.info("Event: AccountThawed", { signature, log });
  } else if (log.includes("paused")) {
    logger.info("Event: Paused", { signature, log });
  } else if (log.includes("unpaused")) {
    logger.info("Event: Unpaused", { signature, log });
  } else if (log.includes("blacklist")) {
    logger.info("Event: BlacklistChange", { signature, log });
  } else if (log.includes("Seized")) {
    logger.info("Event: TokensSeized", { signature, log });
  } else if (log.includes("Role")) {
    logger.info("Event: RoleChange", { signature, log });
  } else if (log.includes("Authority")) {
    logger.info("Event: AuthorityTransfer", { signature, log });
  }
}

main().catch((err) => {
  logger.error("Indexer fatal error", { error: err.message });
  process.exit(1);
});
