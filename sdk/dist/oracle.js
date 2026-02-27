"use strict";
/**
 * Oracle Module - Pyth Price Feed Integration
 *
 * Provides USD-denominated supply caps and price feed parsing
 * for stablecoin operations using Pyth Network v2.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceStatus = exports.PYTH_FEEDS = void 0;
exports.parsePythPrice = parsePythPrice;
exports.fetchPythPrice = fetchPythPrice;
exports.usdToTokenAmount = usdToTokenAmount;
exports.tokenAmountToUsd = tokenAmountToUsd;
exports.buildOracleRemainingAccount = buildOracleRemainingAccount;
exports.validatePrice = validatePrice;
exports.createOracleConfig = createOracleConfig;
const web3_js_1 = require("@solana/web3.js");
// =============================================================================
// Constants
// =============================================================================
/** Well-known Pyth price feed addresses (devnet) */
exports.PYTH_FEEDS = {
    /** SOL/USD price feed */
    SOL_USD: new web3_js_1.PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix"),
    /** USDC/USD price feed */
    USDC_USD: new web3_js_1.PublicKey("5SSkXsEKhepKUFgPMq4Kfgk3TqEv2TbvFMx5CgoQ1JjN"),
    /** BTC/USD price feed */
    BTC_USD: new web3_js_1.PublicKey("HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J"),
    /** ETH/USD price feed */
    ETH_USD: new web3_js_1.PublicKey("EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9GvYRnh1hB5Z8"),
};
/** Pyth price feed magic number */
const PYTH_MAGIC = 0xa1b2c3d4;
var PriceStatus;
(function (PriceStatus) {
    PriceStatus[PriceStatus["Unknown"] = 0] = "Unknown";
    PriceStatus[PriceStatus["Trading"] = 1] = "Trading";
    PriceStatus[PriceStatus["Halted"] = 2] = "Halted";
    PriceStatus[PriceStatus["Auction"] = 3] = "Auction";
})(PriceStatus || (exports.PriceStatus = PriceStatus = {}));
// =============================================================================
// Core Functions
// =============================================================================
/**
 * Parse a Pyth price feed account into structured data
 */
function parsePythPrice(data) {
    if (data.length < 96) {
        throw new Error(`Invalid Pyth price data: expected at least 96 bytes, got ${data.length}`);
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
        status: status,
    };
}
/**
 * Fetch and parse a Pyth price from the network
 */
async function fetchPythPrice(connection, priceFeed) {
    const accountInfo = await connection.getAccountInfo(priceFeed);
    if (!accountInfo) {
        throw new Error(`Pyth price feed account not found: ${priceFeed.toBase58()}`);
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
function usdToTokenAmount(usdAmount, pythPrice, tokenDecimals) {
    if (pythPrice.price <= 0) {
        throw new Error("Invalid price: must be positive");
    }
    if (pythPrice.status !== PriceStatus.Trading) {
        throw new Error(`Price feed not trading: status=${PriceStatus[pythPrice.status]}`);
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
function tokenAmountToUsd(tokenAmount, pythPrice, tokenDecimals) {
    if (pythPrice.status !== PriceStatus.Trading) {
        throw new Error(`Price feed not trading: status=${PriceStatus[pythPrice.status]}`);
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
function buildOracleRemainingAccount(priceFeed) {
    return {
        pubkey: priceFeed,
        isSigner: false,
        isWritable: false,
    };
}
/**
 * Validate price freshness and confidence
 */
function validatePrice(price, config) {
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
                reason: `Confidence too wide: ${(confidenceRatio * 100).toFixed(2)}% > ${(config.minConfidenceRatio * 100).toFixed(2)}%`,
            };
        }
    }
    return { valid: true };
}
/**
 * Create a default oracle config
 */
function createOracleConfig(priceFeed, maxPriceAge = 60, minConfidenceRatio = 0.05) {
    return {
        priceFeed,
        maxPriceAge,
        minConfidenceRatio,
    };
}
//# sourceMappingURL=oracle.js.map