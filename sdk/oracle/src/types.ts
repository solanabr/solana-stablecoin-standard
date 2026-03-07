import { PublicKey } from "@solana/web3.js";

export interface PriceFeed {
  /** Feed address on-chain */
  feedAddress: PublicKey;
  /** Human-readable symbol, e.g. "USD/BRL" */
  symbol: string;
  /** Price as a number (scaled) */
  price: number;
  /** Number of decimals in the price value */
  decimals: number;
  /** Unix timestamp of the last update */
  lastUpdatedAt: number;
  /** Whether the feed is considered stale (> staleness threshold) */
  isStale: boolean;
}

export interface OracleConfig {
  /** Staleness threshold in seconds (default: 60) */
  stalenessThreshold?: number;
  /** Minimum confidence interval ratio (default: 0.01 = 1%) */
  maxConfidenceRatio?: number;
}

export interface MintPriceInfo {
  /** The stablecoin mint */
  mint: PublicKey;
  /** Target peg price in USD */
  pegPriceUsd: number;
  /** Current oracle price of the peg asset in USD */
  oraclePriceUsd: number;
  /** Deviation from peg in basis points */
  deviationBps: number;
  /** Whether the deviation exceeds the circuit-breaker threshold */
  isPegged: boolean;
}
