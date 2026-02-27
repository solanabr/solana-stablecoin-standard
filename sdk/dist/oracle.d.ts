/**
 * Oracle Module - Pyth Price Feed Integration
 *
 * Provides USD-denominated supply caps and price feed parsing
 * for stablecoin operations using Pyth Network v2.
 */
import { Connection, PublicKey } from "@solana/web3.js";
/** Well-known Pyth price feed addresses (devnet) */
export declare const PYTH_FEEDS: {
    /** SOL/USD price feed */
    readonly SOL_USD: PublicKey;
    /** USDC/USD price feed */
    readonly USDC_USD: PublicKey;
    /** BTC/USD price feed */
    readonly BTC_USD: PublicKey;
    /** ETH/USD price feed */
    readonly ETH_USD: PublicKey;
};
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
export declare enum PriceStatus {
    Unknown = 0,
    Trading = 1,
    Halted = 2,
    Auction = 3
}
export interface OracleConfig {
    /** Pyth price feed public key */
    priceFeed: PublicKey;
    /** Maximum allowed price age in seconds */
    maxPriceAge: number;
    /** Minimum confidence ratio (confidence/price) */
    minConfidenceRatio: number;
}
/**
 * Parse a Pyth price feed account into structured data
 */
export declare function parsePythPrice(data: Buffer): PythPrice;
/**
 * Fetch and parse a Pyth price from the network
 */
export declare function fetchPythPrice(connection: Connection, priceFeed: PublicKey): Promise<PythPrice>;
/**
 * Convert a USD amount to token amount using Pyth price
 *
 * @param usdAmount - Amount in USD (e.g., 100.00)
 * @param pythPrice - Parsed Pyth price
 * @param tokenDecimals - Token decimal places (e.g., 6 for USDC)
 * @returns Token amount in base units
 */
export declare function usdToTokenAmount(usdAmount: number, pythPrice: PythPrice, tokenDecimals: number): bigint;
/**
 * Convert a token amount to USD value using Pyth price
 *
 * @param tokenAmount - Token amount in base units
 * @param pythPrice - Parsed Pyth price
 * @param tokenDecimals - Token decimal places
 * @returns USD value
 */
export declare function tokenAmountToUsd(tokenAmount: bigint, pythPrice: PythPrice, tokenDecimals: number): number;
/**
 * Build remaining accounts for oracle-aware instructions
 *
 * @param priceFeed - Pyth price feed public key
 * @returns Account meta for including in transaction
 */
export declare function buildOracleRemainingAccount(priceFeed: PublicKey): {
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
};
/**
 * Validate price freshness and confidence
 */
export declare function validatePrice(price: PythPrice, config: OracleConfig): {
    valid: boolean;
    reason?: string;
};
/**
 * Create a default oracle config
 */
export declare function createOracleConfig(priceFeed: PublicKey, maxPriceAge?: number, minConfidenceRatio?: number): OracleConfig;
//# sourceMappingURL=oracle.d.ts.map