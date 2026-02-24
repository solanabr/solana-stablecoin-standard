import { Connection, PublicKey } from "@solana/web3.js";

/**
 * Oracle price feed utilities for SSS stablecoins.
 *
 * The sss-core mint instruction supports an optional oracle price feed
 * via remaining_accounts. When provided, the program adjusts a USD-denominated
 * supply cap to token units using the oracle price.
 *
 * Compatible with Pyth v2 price accounts:
 *   - Exponent (i32 LE) at byte offset 20
 *   - Aggregate price (i64 LE) at byte offset 208
 */

/** Parsed price from an oracle feed. */
export interface OraclePrice {
  /** Raw price value (e.g., 100_000_000 for $1.00 with expo=-8) */
  price: bigint;
  /** Price exponent (typically negative, e.g., -8) */
  exponent: number;
  /** Normalized price as a floating-point number */
  priceUsd: number;
}

/** Well-known Pyth price feed addresses. */
export const PYTH_FEEDS = {
  /** SOL/USD on mainnet */
  SOL_USD_MAINNET: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"),
  /** SOL/USD on devnet */
  SOL_USD_DEVNET: new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix"),
  /** USDC/USD on mainnet */
  USDC_USD_MAINNET: new PublicKey("Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD"),
  /** USDT/USD on mainnet */
  USDT_USD_MAINNET: new PublicKey("3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL"),
} as const;

/**
 * Parse a Pyth v2 price account to extract the current price.
 *
 * Pyth v2 price account layout (relevant fields):
 *   - Offset 20: exponent (i32 LE)
 *   - Offset 208: aggregate price (i64 LE)
 *   - Offset 216: aggregate confidence (u64 LE)
 */
export function parsePythPrice(data: Buffer | Uint8Array): OraclePrice {
  if (data.length < 224) {
    throw new Error(
      `Invalid Pyth price account: expected >= 224 bytes, got ${data.length}`,
    );
  }

  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  );

  const exponent = view.getInt32(20, true);
  const price = view.getBigInt64(208, true);

  if (price <= 0n) {
    throw new Error(`Invalid oracle price: ${price} (must be positive)`);
  }

  const priceUsd = Number(price) * Math.pow(10, exponent);

  return { price, exponent, priceUsd };
}

/**
 * Fetch and parse a Pyth price feed from the network.
 */
export async function fetchPythPrice(
  connection: Connection,
  priceFeedAddress: PublicKey,
): Promise<OraclePrice> {
  const accountInfo = await connection.getAccountInfo(priceFeedAddress);
  if (!accountInfo) {
    throw new Error(
      `Price feed account not found: ${priceFeedAddress.toBase58()}`,
    );
  }
  return parsePythPrice(accountInfo.data);
}

/**
 * Convert a USD amount to token amount using an oracle price.
 *
 * @param usdAmount - Amount in USD base units (e.g., cents if decimals=2)
 * @param price - Oracle price data
 * @param tokenDecimals - Token mint decimals
 * @returns Token amount in base units
 */
export function usdToTokenAmount(
  usdAmount: bigint,
  price: OraclePrice,
  tokenDecimals: number,
): bigint {
  const decimalsPow = BigInt(10 ** tokenDecimals);

  if (price.exponent < 0) {
    // Typical case: expo = -8 means price has 8 decimal places
    // token_amount = usd_amount * 10^decimals * 10^|expo| / price
    const absExpo = Math.abs(price.exponent);
    const numerator = usdAmount * decimalsPow * BigInt(10 ** absExpo);
    return numerator / price.price;
  } else {
    // Rare case: positive exponent
    // token_amount = usd_amount * 10^decimals / (price * 10^expo)
    const numerator = usdAmount * decimalsPow;
    const denominator = price.price * BigInt(10 ** price.exponent);
    return numerator / denominator;
  }
}

/**
 * Convert a token amount to USD using an oracle price.
 *
 * @param tokenAmount - Amount in token base units
 * @param price - Oracle price data
 * @param tokenDecimals - Token mint decimals
 * @returns USD amount as a floating-point number
 */
export function tokenAmountToUsd(
  tokenAmount: bigint,
  price: OraclePrice,
  tokenDecimals: number,
): number {
  const decimalsPow = BigInt(10 ** tokenDecimals);

  if (price.exponent < 0) {
    // usd = token_amount * price / (10^decimals * 10^|expo|)
    const absExpo = Math.abs(price.exponent);
    const numerator = tokenAmount * price.price;
    const denominator = decimalsPow * BigInt(10 ** absExpo);
    return Number(numerator) / Number(denominator);
  } else {
    // usd = token_amount * price * 10^expo / 10^decimals
    const numerator = tokenAmount * price.price * BigInt(10 ** price.exponent);
    return Number(numerator) / Number(decimalsPow);
  }
}

/**
 * Build the remaining accounts array for oracle-aware minting.
 *
 * Pass the returned AccountMeta to the mint instruction's remainingAccounts
 * to enable USD-denominated supply cap checking.
 */
export function buildOracleRemainingAccount(
  priceFeedAddress: PublicKey,
): { pubkey: PublicKey; isSigner: boolean; isWritable: boolean } {
  return {
    pubkey: priceFeedAddress,
    isSigner: false,
    isWritable: false,
  };
}
