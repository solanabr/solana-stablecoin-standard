import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Price feed data from a Switchboard aggregator
 */
export interface PriceFeedData {
  /** The aggregator public key */
  aggregator: PublicKey;
  /** Current price value */
  price: number;
  /** Confidence interval */
  confidence: number;
  /** Unix timestamp of last update */
  lastUpdatedSlot: number;
  /** Number of oracle responses */
  numSuccess: number;
}

/**
 * Known Switchboard feed addresses for common stablecoin price pairs
 */
export const KNOWN_FEEDS = {
  mainnet: {
    "USDC/USD": new PublicKey("BjUgj6YCnFBZ49wF54ddBVA9qu8TeqkFtkbqmZcee8uW"),
    "USDT/USD": new PublicKey("3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL"),
    "SOL/USD": new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"),
  },
  devnet: {
    "SOL/USD": new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"),
  },
};

/**
 * Switchboard Aggregator account data layout (simplified)
 * Reads the minimum fields needed for price feed data
 */
function parseAggregatorAccountData(data: Buffer): {
  latestResult: number;
  latestTimestamp: number;
  minOracleResults: number;
} {
  // Switchboard V2 aggregator layout offsets (simplified)
  // The actual layout depends on the Switchboard version
  // We parse the SwitchboardDecimal at the known offset

  // Skip discriminator (8 bytes) + various fields
  // latestConfirmedRound starts at offset 112 in V2
  const roundOffset = 112;

  // SwitchboardDecimal: mantissa (16 bytes i128) + scale (4 bytes u32)
  // Result is at roundOffset + 8 (after numSuccess and numError)
  const resultOffset = roundOffset + 8;

  const mantissaLow = data.readBigInt64LE(resultOffset);
  const mantissaHigh = data.readBigInt64LE(resultOffset + 8);
  const mantissa = Number(mantissaLow) + Number(mantissaHigh) * 2 ** 64;
  const scale = data.readUInt32LE(resultOffset + 16);

  const latestResult = mantissa / Math.pow(10, scale);

  // Timestamp at roundOffset + 28
  const timestampOffset = roundOffset + 28;
  const latestTimestamp = Number(data.readBigInt64LE(timestampOffset));

  // minOracleResults at a known offset
  const minOracleResults = data.readUInt32LE(24);

  return { latestResult, latestTimestamp, minOracleResults };
}

/**
 * Oracle price feed reader for SSS stablecoins
 */
export class OraclePriceFeed {
  private connection: Connection;
  private aggregatorKey: PublicKey;

  constructor(connection: Connection, aggregatorKey: PublicKey) {
    this.connection = connection;
    this.aggregatorKey = aggregatorKey;
  }

  /**
   * Create from a known feed name
   */
  static fromKnownFeed(
    connection: Connection,
    feedName: string,
    cluster: "mainnet" | "devnet" = "devnet"
  ): OraclePriceFeed {
    const feeds = KNOWN_FEEDS[cluster] as Record<string, PublicKey>;
    const key = feeds[feedName];
    if (!key) {
      throw new Error(
        `Unknown feed: ${feedName}. Available: ${Object.keys(feeds).join(", ")}`
      );
    }
    return new OraclePriceFeed(connection, key);
  }

  /**
   * Fetch the latest price from the aggregator
   */
  async fetchPrice(): Promise<PriceFeedData> {
    const accountInfo = await this.connection.getAccountInfo(this.aggregatorKey);
    if (!accountInfo) {
      throw new Error(`Aggregator account not found: ${this.aggregatorKey.toBase58()}`);
    }

    const data = Buffer.from(accountInfo.data);
    const parsed = parseAggregatorAccountData(data);

    return {
      aggregator: this.aggregatorKey,
      price: parsed.latestResult,
      confidence: 0, // Would need more parsing for confidence
      lastUpdatedSlot: parsed.latestTimestamp,
      numSuccess: parsed.minOracleResults,
    };
  }

  /**
   * Check if the price is stale (older than maxAge seconds)
   */
  async isPriceStale(maxAgeSeconds: number): Promise<boolean> {
    const feed = await this.fetchPrice();
    const now = Math.floor(Date.now() / 1000);
    return now - feed.lastUpdatedSlot > maxAgeSeconds;
  }
}

/**
 * Depeg detection configuration
 */
export interface DepegConfig {
  /** Maximum allowed deviation from peg (e.g., 0.01 = 1%) */
  maxDeviation: number;
  /** Target peg price (usually 1.0 for USD stablecoins) */
  pegPrice: number;
  /** Maximum age of price data in seconds */
  maxStalenessSeconds: number;
}

/**
 * Depeg detection result
 */
export interface DepegStatus {
  isDepegged: boolean;
  currentPrice: number;
  deviation: number;
  deviationPercent: number;
  isStale: boolean;
  timestamp: number;
}

/**
 * Depeg monitor for SSS stablecoins
 * Watches Switchboard price feeds and detects deviations from peg
 */
export class DepegMonitor {
  private feed: OraclePriceFeed;
  private config: DepegConfig;
  private onDepeg?: (status: DepegStatus) => void;

  constructor(
    feed: OraclePriceFeed,
    config: DepegConfig,
    onDepeg?: (status: DepegStatus) => void
  ) {
    this.feed = feed;
    this.config = config;
    this.onDepeg = onDepeg;
  }

  /**
   * Check current depeg status
   */
  async checkStatus(): Promise<DepegStatus> {
    const priceData = await this.feed.fetchPrice();

    const deviation = Math.abs(priceData.price - this.config.pegPrice);
    const deviationPercent = (deviation / this.config.pegPrice) * 100;
    const isDepegged = deviationPercent > this.config.maxDeviation * 100;

    const now = Math.floor(Date.now() / 1000);
    const isStale = now - priceData.lastUpdatedSlot > this.config.maxStalenessSeconds;

    const status: DepegStatus = {
      isDepegged,
      currentPrice: priceData.price,
      deviation,
      deviationPercent,
      isStale,
      timestamp: now,
    };

    if (isDepegged && this.onDepeg) {
      this.onDepeg(status);
    }

    return status;
  }

  /**
   * Start continuous monitoring
   * @param intervalMs Polling interval in milliseconds
   * @returns cleanup function to stop monitoring
   */
  startMonitoring(intervalMs: number = 10_000): () => void {
    let running = true;

    const poll = async () => {
      while (running) {
        try {
          await this.checkStatus();
        } catch (err) {
          console.error("Depeg monitor error:", err);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };

    poll();

    return () => {
      running = false;
    };
  }
}
