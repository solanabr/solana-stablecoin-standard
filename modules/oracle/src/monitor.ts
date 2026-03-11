import { Connection } from "@solana/web3.js";
import { OraclePriceFeed, DepegMonitor, DepegStatus } from "./index";

/**
 * CLI monitor for SSS stablecoin depeg detection
 * Usage: FEED_PUBKEY=<aggregator> RPC_URL=<url> npx ts-node src/monitor.ts
 */
async function main() {
  const rpcUrl = process.env.RPC_URL || "https://api.devnet.solana.com";
  const feedPubkey = process.env.FEED_PUBKEY;
  const feedName = process.env.FEED_NAME || "SOL/USD";
  const cluster = (process.env.CLUSTER || "devnet") as "mainnet" | "devnet";
  const maxDeviation = parseFloat(process.env.MAX_DEVIATION || "0.01");
  const intervalMs = parseInt(process.env.INTERVAL_MS || "30000", 10);

  const connection = new Connection(rpcUrl, "confirmed");

  let feed: OraclePriceFeed;
  if (feedPubkey) {
    const { PublicKey } = await import("@solana/web3.js");
    feed = new OraclePriceFeed(connection, new PublicKey(feedPubkey));
  } else {
    feed = OraclePriceFeed.fromKnownFeed(connection, feedName, cluster);
  }

  console.log(`S\u00b3 Depeg Monitor`);
  console.log(`Feed: ${feedName}`);
  console.log(`Cluster: ${cluster}`);
  console.log(`Max Deviation: ${maxDeviation * 100}%`);
  console.log(`Polling Interval: ${intervalMs}ms`);
  console.log(`---`);

  const monitor = new DepegMonitor(
    feed,
    {
      maxDeviation,
      pegPrice: 1.0,
      maxStalenessSeconds: 300,
    },
    (status: DepegStatus) => {
      console.warn(
        `[ALERT] DEPEG DETECTED! Price: ${status.currentPrice.toFixed(6)} | ` +
          `Deviation: ${status.deviationPercent.toFixed(4)}%`
      );
    }
  );

  const stop = monitor.startMonitoring(intervalMs);

  // Log status periodically
  setInterval(async () => {
    try {
      const status = await monitor.checkStatus();
      const statusIcon = status.isDepegged ? "!!" : "OK";
      const staleIcon = status.isStale ? " [STALE]" : "";
      console.log(
        `[${statusIcon}] Price: ${status.currentPrice.toFixed(6)} | ` +
          `Dev: ${status.deviationPercent.toFixed(4)}%${staleIcon}`
      );
    } catch {
      // Errors already logged by monitor
    }
  }, intervalMs);

  process.on("SIGINT", () => {
    console.log("\nStopping monitor...");
    stop();
    process.exit(0);
  });
}

main().catch(console.error);
