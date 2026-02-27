/**
 * Oracle Module - Pyth Price Feed Integration
 *
 * Provides USD-denominated supply caps and price feed parsing
 * for stablecoin operations using Pyth Network v2.
 */

import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";

// =============================================================================
// Constants
// =============================================================================

/** Well-known Pyth price feed addresses (devnet) */
export const PYTH_FEEDS = {
  /** SOL/USD price feed */
  SOL_USD: new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix"),
  /** USDC/USD price feed */
  USDC_USD: new PublicKey("5SSkXsEKhepKUFgPMq4Kfgk3TqEv2TbvFMx5CgoQ1JjN"),
  /** BTC/USD price feed */
  BTC_USD: new PublicKey("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J"),
  /** ETH/USD price feed */
  ETH_USD: new PublicKey("EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9GvYRnh1hB5Z8"),
} as const;

/** Pyth price feed magic number */
const PYTH_MAGIC = 0xa1b2c3d4;

// =============================================================================
// Types
// =============================================================================

export interface PythPrice {
  /** Price in USD (as float) */
  price: number;
  /** Confidence interval */
  confidence: number;
  /** Price exponent (negative for decimals) */
  exponent: number;
  /** Raw price (before exponent) */
  rawPrice: bigint;
  /** Raw confidence */
  rawConfidence: bigint;
  /** Last update slot */
  slot: number;
  /** Publish time (unix timestamp) */
  publishTime: number;
  /** Price status */
  status: PriceStatus;
}

export enum PriceStatus {
  Unknown = 0,
  Trading = 1,
  Halted = 2,
  Auction = 3,
}

export interface OracleConfig {
  /** Pyth price feed public key */
  priceFeed: PublicKey;
  /** Maximum allowed price age in seconds */
  maxPriceAge: number;
  /** Minimum confidence ratio (confidence/price) */
  minConfidenceRatio: number;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Parse a Pyth price feed account into structured data
 */
export function parsePythPrice(data: Buffer): PythPrice {
  if (data.length < 96) {
    throw new Error(
      `Invalid Pyth price data: expected at least 96 bytes, got ${data.length}`
    );
  }

  // Simplified Pyth v2 parsing
  const magic = data.readUInt32LE(0);
  if (magic !== PYTH_MAGIC && magic !== 0) {
    // Fallback: parse as raw price data
  }

  const exponent = data.readInt32LE(20);
  const status = data.readUInt32LE(28);
  const rawPrice = data.readBigInt64LE(32);
  const rawConfidence = data.readBigUInt64LE(40);
  const slot = Number(data.readBigUInt64LE(48));
  const publishTime = Number(data.readBigInt64LE(56));

  const price = Number(rawPrice) * Math.pow(10, exponent);
  const confidence = Number(rawConfidence) * Math.pow(10, exponent);

  return {
    price,
    confidence,
    exponent,
    rawPrice,
    rawConfidence,
    slot,
    publishTime,
    status: status as PriceStatus,
  };
}

/**
 * Fetch and parse a Pyth price from the network
 */
export async function fetchPythPrice(
  connection: Connection,
  priceFeed: PublicKey
): Promise<PythPrice> {
  const accountInfo = await connection.getAccountInfo(priceFeed);
  if (!accountInfo) {
    throw new Error(
      `Pyth price feed account not found: ${priceFeed.toBase58()}`
    );
  }
  return parsePythPrice(accountInfo.data);
}

/**
 * Convert a USD amount to token amount using Pyth price
 *
 * @param usdAmount - Amount in USD (e.g., 100.00)
 * @param pythPrice - Parsed Pyth price
 * @param tokenDecimals - Token decimal places (e.g., 6 for USDC)
 * @returns Token amount in base units
 */
export function usdToTokenAmount(
  usdAmount: number,
  pythPrice: PythPrice,
  tokenDecimals: number
): bigint {
  if (pythPrice.price <= 0) {
    throw new Error("Invalid price: must be positive");
  }
  if (pythPrice.status !== PriceStatus.Trading) {
    throw new Error(
      `Price feed not trading: status=${PriceStatus[pythPrice.status]}`
    );
  }

  const tokenAmount = usdAmount / pythPrice.price;
  const baseUnits = tokenAmount * Math.pow(10, tokenDecimals);
  return BigInt(Math.floor(baseUnits));
}

/**
 * Convert a token amount to USD value using Pyth price
 *
 * @param tokenAmount - Token amount in base units
 * @param pythPrice - Parsed Pyth price
 * @param tokenDecimals - Token decimal places
 * @returns USD value
 */
export function tokenAmountToUsd(
  tokenAmount: bigint,
  pythPrice: PythPrice,
  tokenDecimals: number
): number {
  if (pythPrice.status !== PriceStatus.Trading) {
    throw new Error(
      `Price feed not trading: status=${PriceStatus[pythPrice.status]}`
    );
  }

  const humanAmount = Number(tokenAmount) / Math.pow(10, tokenDecimals);
  return humanAmount * pythPrice.price;
}

/**
 * Build remaining accounts for oracle-aware instructions
 *
 * @param priceFeed - Pyth price feed public key
 * @returns Account meta for including in transaction
 */
export function buildOracleRemainingAccount(priceFeed: PublicKey) {
  return {
    pubkey: priceFeed,
    isSigner: false,
    isWritable: false,
  };
}

/**
 * Validate price freshness and confidence
 */
export function validatePrice(
  price: PythPrice,
  config: OracleConfig
): { valid: boolean; reason?: string } {
  // Check status
  if (price.status !== PriceStatus.Trading) {
    return {
      valid: false,
      reason: `Price not trading: ${PriceStatus[price.status]}`,
    };
  }

  // Check price age
  const now = Math.floor(Date.now() / 1000);
  const age = now - price.publishTime;
  if (age > config.maxPriceAge) {
    return {
      valid: false,
      reason: `Price too stale: ${age}s > ${config.maxPriceAge}s`,
    };
  }

  // Check confidence
  if (price.price > 0) {
    const confidenceRatio = price.confidence / price.price;
    if (confidenceRatio > config.minConfidenceRatio) {
      return {
        valid: false,
        reason: `Confidence too wide: ${(confidenceRatio * 100).toFixed(
          2
        )}% > ${(config.minConfidenceRatio * 100).toFixed(2)}%`,
      };
    }
  }

  return { valid: true };
}

/**
 * Create a default oracle config
 */
export function createOracleConfig(
  priceFeed: PublicKey,
  maxPriceAge: number = 60,
  minConfidenceRatio: number = 0.05
): OracleConfig {
  return {
    priceFeed,
    maxPriceAge,
    minConfidenceRatio,
  };
}
