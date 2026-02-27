"use strict";
/**
 * SDK Utilities for SSS Token
 *
 * Helper functions for common operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStablecoinPDA = getStablecoinPDA;
exports.getMintPDA = getMintPDA;
exports.getRolePDA = getRolePDA;
exports.getMinterPDA = getMinterPDA;
exports.getMultisigConfigPDA = getMultisigConfigPDA;
exports.getProposalPDA = getProposalPDA;
exports.getMintAuthorityPDA = getMintAuthorityPDA;
exports.getBurnAuthorityPDA = getBurnAuthorityPDA;
exports.getFreezeAuthorityPDA = getFreezeAuthorityPDA;
exports.getHookConfigPDA = getHookConfigPDA;
exports.getBlacklistPDA = getBlacklistPDA;
exports.getWhitelistPDA = getWhitelistPDA;
exports.validateName = validateName;
exports.validateSymbol = validateSymbol;
exports.validateDecimals = validateDecimals;
exports.validateBatch = validateBatch;
exports.hasRole = hasRole;
exports.decodeRoles = decodeRoles;
exports.encodeRoles = encodeRoles;
exports.hasFeature = hasFeature;
exports.decodeFeatures = decodeFeatures;
exports.isSSS2 = isSSS2;
exports.calculateFee = calculateFee;
exports.wouldExceedQuota = wouldExceedQuota;
exports.wouldExceedCap = wouldExceedCap;
exports.formatAmount = formatAmount;
exports.parseAmount = parseAmount;
exports.formatWithSymbol = formatWithSymbol;
exports.getTokenBalance = getTokenBalance;
exports.accountExists = accountExists;
exports.getAccountOwner = getAccountOwner;
exports.extractError = extractError;
exports.isAnchorError = isAnchorError;
exports.isInsufficientFunds = isInsufficientFunds;
exports.isSlippageError = isSlippageError;
exports.sleep = sleep;
exports.withRetry = withRetry;
exports.formatTimestamp = formatTimestamp;
exports.now = now;
exports.timeUntilEpochReset = timeUntilEpochReset;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const types_1 = require("./types");
// ============================================
// PDA HELPERS
// ============================================
/**
 * Get stablecoin PDA (state account)
 */
function getStablecoinPDA(mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("stablecoin"), mint.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get mint PDA
 */
function getMintPDA(stablecoin) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("mint"), stablecoin.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get role PDA
 */
function getRolePDA(owner, mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), owner.toBuffer(), mint.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get minter info PDA
 */
function getMinterPDA(minter, mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("minter"), minter.toBuffer(), mint.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get multisig config PDA
 */
function getMultisigConfigPDA(stablecoin) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("multisig"), stablecoin.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get proposal PDA
 */
function getProposalPDA(multisigConfig, proposer, timestamp) {
    return web3_js_1.PublicKey.findProgramAddressSync([
        Buffer.from("proposal"),
        multisigConfig.toBuffer(),
        proposer.toBuffer(),
        timestamp.toArrayLike(Buffer, "le", 8),
    ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get mint authority PDA
 */
function getMintAuthorityPDA(stablecoin) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("mint_authority"), stablecoin.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get burn authority PDA
 */
function getBurnAuthorityPDA(stablecoin) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("burn_authority"), stablecoin.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
/**
 * Get freeze authority PDA
 */
function getFreezeAuthorityPDA(stablecoin) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("freeze_authority"), stablecoin.toBuffer()], types_1.SSS_TOKEN_PROGRAM_ID)[0];
}
// ============================================
// SSS-2 PDA HELPERS
// ============================================
/**
 * Get hook config PDA
 */
function getHookConfigPDA(mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("hook_config"), mint.toBuffer()], types_1.SSS_TRANSFER_HOOK_PROGRAM_ID)[0];
}
/**
 * Get blacklist entry PDA
 */
function getBlacklistPDA(config, address) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("blacklist"), config.toBuffer(), address.toBuffer()], types_1.SSS_TRANSFER_HOOK_PROGRAM_ID)[0];
}
/**
 * Get whitelist entry PDA
 */
function getWhitelistPDA(config, address) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("whitelist"), config.toBuffer(), address.toBuffer()], types_1.SSS_TRANSFER_HOOK_PROGRAM_ID)[0];
}
// ============================================
// VALIDATION HELPERS
// ============================================
/**
 * Validate token name
 * @returns true if valid
 */
function validateName(name) {
    if (name.length === 0) {
        return { valid: false, error: "Name is required" };
    }
    if (name.length > 32) {
        return { valid: false, error: "Name must be 32 characters or less" };
    }
    // Check for invalid characters
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
        return {
            valid: false,
            error: "Name can only contain letters, numbers, spaces, hyphens and underscores",
        };
    }
    return { valid: true };
}
/**
 * Validate token symbol
 */
function validateSymbol(symbol) {
    if (symbol.length === 0) {
        return { valid: false, error: "Symbol is required" };
    }
    if (symbol.length > 10) {
        return { valid: false, error: "Symbol must be 10 characters or less" };
    }
    if (!/^[A-Z]+$/.test(symbol)) {
        return { valid: false, error: "Symbol must be uppercase letters only" };
    }
    return { valid: true };
}
/**
 * Validate decimals
 */
function validateDecimals(decimals) {
    if (decimals < 0 || decimals > 9) {
        return { valid: false, error: "Decimals must be between 0 and 9" };
    }
    return { valid: true };
}
/**
 * Validate batch parameters
 */
function validateBatch(recipients, amounts) {
    if (recipients.length !== amounts.length) {
        return { valid: false, error: "Recipients and amounts length mismatch" };
    }
    if (recipients.length === 0) {
        return { valid: false, error: "At least one recipient required" };
    }
    if (recipients.length > 10) {
        return { valid: false, error: "Maximum 10 recipients per batch" };
    }
    for (let i = 0; i < recipients.length; i++) {
        if (amounts[i].lte(new anchor_1.BN(0))) {
            return {
                valid: false,
                error: `Amount at index ${i} must be greater than 0`,
            };
        }
    }
    return { valid: true };
}
// ============================================
// ROLE HELPERS
// ============================================
/**
 * Check if roles bitmask includes specific role
 */
function hasRole(roles, role) {
    return (roles & role) !== 0;
}
/**
 * Decode roles bitmask to human-readable names
 */
function decodeRoles(roles) {
    const roleNames = [];
    if (hasRole(roles, types_1.ROLE_MASTER))
        roleNames.push("MASTER");
    if (hasRole(roles, types_1.ROLE_MINTER))
        roleNames.push("MINTER");
    if (hasRole(roles, types_1.ROLE_BURNER))
        roleNames.push("BURNER");
    if (hasRole(roles, types_1.ROLE_PAUSER))
        roleNames.push("PAUSER");
    if (hasRole(roles, types_1.ROLE_BLACKLISTER))
        roleNames.push("BLACKLISTER");
    if (hasRole(roles, types_1.ROLE_SEIZER))
        roleNames.push("SEIZER");
    return roleNames;
}
/**
 * Encode role names to bitmask
 */
function encodeRoles(roleNames) {
    let roles = 0;
    const roleMap = {
        MASTER: types_1.ROLE_MASTER,
        MINTER: types_1.ROLE_MINTER,
        BURNER: types_1.ROLE_BURNER,
        PAUSER: types_1.ROLE_PAUSER,
        BLACKLISTER: types_1.ROLE_BLACKLISTER,
        SEIZER: types_1.ROLE_SEIZER,
    };
    for (const name of roleNames) {
        const upper = name.toUpperCase();
        if (roleMap[upper]) {
            roles |= roleMap[upper];
        }
    }
    return roles;
}
// ============================================
// FEATURE HELPERS
// ============================================
/**
 * Check if feature is enabled
 */
function hasFeature(features, feature) {
    return (features & feature) !== 0;
}
/**
 * Decode features bitmask
 */
function decodeFeatures(features) {
    const featureNames = [];
    if (hasFeature(features, 1))
        featureNames.push("TRANSFER_HOOK");
    if (hasFeature(features, 2))
        featureNames.push("PERMANENT_DELEGATE");
    if (hasFeature(features, 4))
        featureNames.push("MINT_CLOSE_AUTHORITY");
    if (hasFeature(features, 8))
        featureNames.push("DEFAULT_ACCOUNT_STATE");
    return featureNames;
}
/**
 * Check if stablecoin is SSS-2 (has compliance features)
 */
function isSSS2(features) {
    return hasFeature(features, 1) || hasFeature(features, 2);
}
// ============================================
// CALCULATION HELPERS
// ============================================
/**
 * Calculate transfer fee
 */
function calculateFee(amount, feeBps, maxFee, minAmount) {
    // Check minimum amount
    if (amount.lt(minAmount)) {
        throw new Error(`Amount ${amount.toString()} below minimum ${minAmount.toString()}`);
    }
    // Calculate fee
    const fee = amount.muln(feeBps).divn(10000);
    // Apply cap
    const actualFee = fee.gt(maxFee) ? maxFee : fee;
    // Calculate net amount
    const netAmount = amount.sub(actualFee);
    return {
        fee: actualFee,
        netAmount,
        rateBps: feeBps,
    };
}
/**
 * Check if mint amount would exceed quota
 */
function wouldExceedQuota(current, quota, amount) {
    return current.add(amount).gt(quota);
}
/**
 * Check if mint amount would exceed supply cap
 */
function wouldExceedCap(currentSupply, cap, amount) {
    if (cap.eq(new anchor_1.BN(0)))
        return false; // 0 = unlimited
    return currentSupply.add(amount).gt(cap);
}
// ============================================
// AMOUNT FORMATTING
// ============================================
/**
 * Format amount with decimals for display
 * @example formatAmount(new BN(1000000), 6) // "1.000000"
 */
function formatAmount(amount, decimals) {
    const divisor = new anchor_1.BN(10).pow(new anchor_1.BN(decimals));
    const whole = amount.div(divisor).toString();
    const fraction = amount.mod(divisor).toString().padStart(decimals, "0");
    // Trim trailing zeros
    const trimmed = fraction.replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole;
}
/**
 * Parse human-readable amount to BN
 * @example parseAmount("1.5", 6) // BN(1500000)
 */
function parseAmount(amount, decimals) {
    const [whole, frac = ""] = amount.split(".");
    const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
    const wholeBN = new anchor_1.BN(whole || "0");
    const fractionBN = new anchor_1.BN(fraction);
    const divisor = new anchor_1.BN(10).pow(new anchor_1.BN(decimals));
    return wholeBN.mul(divisor).add(fractionBN);
}
/**
 * Format amount with symbol
 * @example formatWithSymbol(new BN(1000000), 6, 'USDC') // "1.00 USDC"
 */
function formatWithSymbol(amount, decimals, symbol, precision = 2) {
    const divisor = new anchor_1.BN(10).pow(new anchor_1.BN(decimals));
    const whole = amount.div(divisor);
    const fraction = amount.mod(divisor);
    // Convert fraction to percentage with specified precision
    const precisionMultiplier = new anchor_1.BN(10).pow(new anchor_1.BN(decimals - precision));
    const fractionDisplay = fraction.div(precisionMultiplier).toNumber();
    const fractionStr = fractionDisplay.toString().padStart(precision, "0");
    return `${whole}.${fractionStr} ${symbol}`;
}
// ============================================
// RPC HELPERS
// ============================================
/**
 * Get token account balance
 */
async function getTokenBalance(connection, tokenAccount) {
    const account = await connection.getTokenAccountBalance(tokenAccount);
    return new anchor_1.BN(account.value.amount);
}
/**
 * Check if account exists
 */
async function accountExists(connection, account) {
    const balance = await connection.getBalance(account);
    return balance > 0;
}
/**
 * Get account owner
 */
async function getAccountOwner(connection, tokenAccount) {
    try {
        const account = await connection.getParsedAccountInfo(tokenAccount);
        const data = account.value?.data;
        return data?.parsed?.info?.owner
            ? new web3_js_1.PublicKey(data.parsed.info.owner)
            : null;
    }
    catch {
        return null;
    }
}
// ============================================
// ERROR HANDLING
// ============================================
/**
 * Extract error message from transaction result
 */
function extractError(error) {
    if (typeof error === "string")
        return error;
    if (error?.message)
        return error.message;
    if (error?.toString)
        return error.toString();
    return "Unknown error";
}
/**
 * Check if error is a specific Anchor error
 */
function isAnchorError(error, errorCode) {
    const errorStr = error?.toString() || "";
    return (errorStr.includes(`0x${errorCode.toString(16).padStart(4, "0")}`) ||
        errorStr.includes(`custom program error: ${errorCode}`));
}
/**
 * Check if transaction failed due to insufficient funds
 */
function isInsufficientFunds(error) {
    const errorStr = extractError(error).toLowerCase();
    return (errorStr.includes("insufficient funds") ||
        errorStr.includes("insufficient lamports"));
}
/**
 * Check if transaction failed due to slippage (for swaps)
 */
function isSlippageError(error) {
    const errorStr = extractError(error).toLowerCase();
    return (errorStr.includes("slippage") ||
        errorStr.includes("exceeds desired slippage"));
}
// ============================================
// SLEEP/RETRY
// ============================================
/**
 * Sleep for milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry a function with exponential backoff
 */
async function withRetry(fn, retries = 3, delay = 1000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (i < retries - 1) {
                await sleep(delay * Math.pow(2, i));
            }
        }
    }
    throw lastError;
}
// ============================================
// DATE/TIME HELPERS
// ============================================
/**
 * Format timestamp to readable string
 */
function formatTimestamp(timestamp) {
    return new Date(timestamp.toNumber() * 1000).toISOString();
}
/**
 * Get current timestamp as BN
 */
function now() {
    return new anchor_1.BN(Math.floor(Date.now() / 1000));
}
/**
 * Calculate time until epoch reset
 */
function timeUntilEpochReset(epochStart, epochDurationSeconds = 86400) {
    const current = now().toNumber();
    const start = epochStart.toNumber();
    const elapsed = current - start;
    const remaining = epochDurationSeconds - elapsed;
    return Math.max(0, remaining);
}
// ============================================
// EXPORTS
// ============================================
exports.default = {
    // PDA
    getStablecoinPDA,
    getMintPDA,
    getRolePDA,
    getMinterPDA,
    getMultisigConfigPDA,
    getProposalPDA,
    getMintAuthorityPDA,
    getBurnAuthorityPDA,
    getFreezeAuthorityPDA,
    getHookConfigPDA,
    getBlacklistPDA,
    getWhitelistPDA,
    // Validation
    validateName,
    validateSymbol,
    validateDecimals,
    validateBatch,
    // Roles
    hasRole,
    decodeRoles,
    encodeRoles,
    // Features
    hasFeature,
    decodeFeatures,
    isSSS2,
    // Calculations
    calculateFee,
    wouldExceedQuota,
    wouldExceedCap,
    // Formatting
    formatAmount,
    parseAmount,
    formatWithSymbol,
    // RPC
    getTokenBalance,
    accountExists,
    getAccountOwner,
    // Errors
    extractError,
    isAnchorError,
    isInsufficientFunds,
    isSlippageError,
    // Utils
    sleep,
    withRetry,
    // Time
    formatTimestamp,
    now,
    timeUntilEpochReset,
};
//# sourceMappingURL=utils.js.map