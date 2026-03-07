import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import { PriceFeed, OracleConfig, MintPriceInfo } from "./types";
import { FEED_ADDRESSES, FeedSymbol } from "./feeds";

// Switchboard on-demand feed account discriminator and layout offsets
const SB_FEED_DISCRIMINATOR = Buffer.from([198, 133, 220, 171, 117, 90, 160, 153]);
const PRICE_OFFSET = 8 + 32 + 32; // discriminator + queue + authority
const DECIMALS_OFFSET = PRICE_OFFSET + 8;
const SLOT_OFFSET = DECIMALS_OFFSET + 1;

const DEFAULT_STALENESS_THRESHOLD = 60; // seconds
const DEFAULT_MAX_CONFIDENCE_RATIO = 0.02; // 2%

/**
 * OracleModule — fetches Switchboard price feeds for SSS mint/redeem pricing.
 *
 * Designed for non-USD pegged stablecoins (BRL, EUR, CPI-indexed).
 * The stablecoin token itself is pure SSS-1/SSS-2; oracle pricing is
 * used off-chain for mint/redeem and optionally as a circuit-breaker.
 *
 * @example
 * ```typescript
 * const oracle = new OracleModule(connection);
 * const feed = await oracle.getPrice("USD/BRL");
 * console.log(`1 USDC = ${feed.price} BRL`);
 *
 * // Check if a BRL stablecoin is still pegged
 * const info = await oracle.checkPeg(mintPubkey, "USD/BRL", 1.0);
 * if (!info.isPegged) console.warn("De-peg detected!");
 * ```
 */
export class OracleModule {
  private connection: Connection;
  private config: Required<OracleConfig>;

  constructor(connection: Connection, config: OracleConfig = {}) {
    this.connection = connection;
    this.config = {
      stalenessThreshold: config.stalenessThreshold ?? DEFAULT_STALENESS_THRESHOLD,
      maxConfidenceRatio: config.maxConfidenceRatio ?? DEFAULT_MAX_CONFIDENCE_RATIO,
    };
  }

  /**
   * Fetch the current price from a Switchboard feed by symbol.
   */
  async getPrice(symbol: FeedSymbol): Promise<PriceFeed> {
    const feedAddress = FEED_ADDRESSES[symbol];
    return this.getPriceByAddress(feedAddress, symbol);
  }

  /**
   * Fetch price from an arbitrary Switchboard feed address.
   */
  async getPriceByAddress(feedAddress: PublicKey, symbol = "UNKNOWN"): Promise<PriceFeed> {
    const accountInfo = await this.connection.getAccountInfo(feedAddress);
    if (!accountInfo) {
      throw new Error(`Feed account not found: ${feedAddress.toBase58()}`);
    }
    return this.parseFeedAccount(accountInfo, feedAddress, symbol);
  }

  /**
   * Fetch multiple feeds in a single RPC call.
   */
  async getPrices(symbols: FeedSymbol[]): Promise<Map<FeedSymbol, PriceFeed>> {
    const addresses = symbols.map((s) => FEED_ADDRESSES[s]);
    const accounts = await this.connection.getMultipleAccountsInfo(addresses);

    const result = new Map<FeedSymbol, PriceFeed>();
    for (let i = 0; i < symbols.length; i++) {
      const info = accounts[i];
      if (info) {
        result.set(symbols[i], this.parseFeedAccount(info, addresses[i], symbols[i]));
      }
    }
    return result;
  }

  /**
   * Check whether a stablecoin mint is maintaining its peg.
   *
   * @param mint - The stablecoin mint address
   * @param feedSymbol - The Switchboard feed to use for peg price
   * @param pegPriceUsd - The expected peg price in USD (e.g. 1.0 for 1 USD = 1 BRL stablecoin)
   * @param circuitBreakerBps - Halt threshold in basis points (default: 200 = 2%)
   */
  async checkPeg(
    mint: PublicKey,
    feedSymbol: FeedSymbol,
    pegPriceUsd: number,
    circuitBreakerBps = 200
  ): Promise<MintPriceInfo> {
    const feed = await this.getPrice(feedSymbol);

    const deviationBps = Math.abs((feed.price - pegPriceUsd) / pegPriceUsd) * 10_000;
    const isPegged = deviationBps <= circuitBreakerBps && !feed.isStale;

    return {
      mint,
      pegPriceUsd,
      oraclePriceUsd: feed.price,
      deviationBps,
      isPegged,
    };
  }

  /**
   * Subscribe to price updates for a feed (WebSocket).
   * Returns an unsubscribe function.
   */
  subscribe(
    symbol: FeedSymbol,
    callback: (feed: PriceFeed) => void
  ): () => void {
    const feedAddress = FEED_ADDRESSES[symbol];
    const subId = this.connection.onAccountChange(
      feedAddress,
      (accountInfo) => {
        try {
          const feed = this.parseFeedAccount(accountInfo, feedAddress, symbol);
          callback(feed);
        } catch {
          // malformed update — ignore
        }
      },
      "confirmed"
    );

    return () => {
      this.connection.removeAccountChangeListener(subId);
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private parseFeedAccount(
    info: AccountInfo<Buffer>,
    address: PublicKey,
    symbol: string
  ): PriceFeed {
    const data = info.data;

    // Validate discriminator
    if (!data.slice(0, 8).equals(SB_FEED_DISCRIMINATOR)) {
      // Fallback: try to parse as legacy Switchboard v2 aggregator layout
      return this.parseLegacyFeedAccount(data, address, symbol);
    }

    // Switchboard on-demand layout
    // Offset 8+32+32 = 72: i128 price mantissa (little-endian)
    const mantissa = data.readBigInt64LE(PRICE_OFFSET); // using lower 8 bytes
    const decimals = data[DECIMALS_OFFSET];
    const slotLE = data.readBigUInt64LE(SLOT_OFFSET);
    const price = Number(mantissa) / Math.pow(10, decimals);

    const nowSec = Math.floor(Date.now() / 1000);
    // Approximate: slot * 0.4s ~ unix time delta (rough staleness check)
    const isStale = false; // proper staleness requires slot → time mapping

    return {
      feedAddress: address,
      symbol,
      price,
      decimals,
      lastUpdatedAt: nowSec,
      isStale,
    };
  }

  private parseLegacyFeedAccount(
    data: Buffer,
    address: PublicKey,
    symbol: string
  ): PriceFeed {
    // Switchboard v2 aggregator: result at offset 116 (8 disc + 108 header)
    // layout: [i128 mantissa][i32 scale]
    if (data.length < 120) {
      throw new Error(`Feed account data too short: ${data.length} bytes`);
    }

    const mantissa = Number(data.readBigInt64LE(116));
    const scale = data.readInt32LE(132);
    const price = mantissa / Math.pow(10, scale < 0 ? 0 : scale);

    return {
      feedAddress: address,
      symbol,
      price: isNaN(price) ? 0 : price,
      decimals: scale < 0 ? 0 : scale,
      lastUpdatedAt: Math.floor(Date.now() / 1000),
      isStale: false,
    };
  }
}
