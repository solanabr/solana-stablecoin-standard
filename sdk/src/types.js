"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURE_ALLOWLIST_REQUIRED = exports.FEATURE_AUDITOR = exports.FEATURE_CONFIDENTIAL_TRANSFERS = exports.TransferHookError = exports.StablecoinError = exports.WhitelistType = exports.FEATURE_DEFAULT_ACCOUNT_STATE = exports.FEATURE_MINT_CLOSE_AUTHORITY = exports.FEATURE_PERMANENT_DELEGATE = exports.FEATURE_TRANSFER_HOOK = exports.ROLE_NAMES = exports.ROLE_SEIZER = exports.ROLE_BLACKLISTER = exports.ROLE_PAUSER = exports.ROLE_BURNER = exports.ROLE_MINTER = exports.ROLE_MASTER = exports.SSS_TRANSFER_HOOK_PROGRAM_ID = exports.SSS_TOKEN_PROGRAM_ID = void 0;
exports.decodeError = decodeError;
exports.calculateFee = calculateFee;
exports.hasRole = hasRole;
exports.getFeatureString = getFeatureString;
exports.formatAmount = formatAmount;
exports.parseAmount = parseAmount;
exports.isSSS3 = isSSS3;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
// ============================================
// PROGRAM IDS - Updated!
// ============================================
/**
 * SSS Token program ID
 * @default "b3AxhgSuNvjsv2F4XmuXYJbBCRcTT1XPXQvRe77NbrK"
 */
exports.SSS_TOKEN_PROGRAM_ID = new web3_js_1.PublicKey("b3AxhgSuNvjsv2F4XmuXYJbBCRcTT1XPXQvRe77NbrK");
/**
 * SSS Transfer Hook program ID
 * @default "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx"
 */
exports.SSS_TRANSFER_HOOK_PROGRAM_ID = new web3_js_1.PublicKey("97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx");
// ============================================
// ROLE CONSTANTS
// ============================================
/** Full control - can do everything */
exports.ROLE_MASTER = 1;
/** Can mint tokens */
exports.ROLE_MINTER = 2;
/** Can burn tokens */
exports.ROLE_BURNER = 4;
/** Can freeze/thaw accounts and pause contract */
exports.ROLE_PAUSER = 8;
/** Can add/remove from blacklist (SSS-2) */
exports.ROLE_BLACKLISTER = 16;
/** Can seize tokens (SSS-2) */
exports.ROLE_SEIZER = 32;
/** Human-readable role names */
exports.ROLE_NAMES = {
    1: "MASTER",
    2: "MINTER",
    4: "BURNER",
    8: "PAUSER",
    16: "BLACKLISTER",
    32: "SEIZER",
};
// ============================================
// FEATURE FLAGS
// ============================================
/** Transfer hook enabled (bit 0) */
exports.FEATURE_TRANSFER_HOOK = 1;
/** Permanent delegate enabled (bit 1) */
exports.FEATURE_PERMANENT_DELEGATE = 2;
/** Mint close authority enabled (bit 2) */
exports.FEATURE_MINT_CLOSE_AUTHORITY = 4;
/** Default account state enabled (bit 3) */
exports.FEATURE_DEFAULT_ACCOUNT_STATE = 8;
/** Whitelist type */
var WhitelistType;
(function (WhitelistType) {
    WhitelistType["FeeExempt"] = "fee_exempt";
    WhitelistType["FullBypass"] = "full_bypass";
})(WhitelistType || (exports.WhitelistType = WhitelistType = {}));
// ============================================
// ERROR CODES (for SDK error handling)
// ============================================
/** Error codes from SSS Token program */
var StablecoinError;
(function (StablecoinError) {
    StablecoinError[StablecoinError["Unauthorized"] = 6000] = "Unauthorized";
    StablecoinError[StablecoinError["ContractPaused"] = 6001] = "ContractPaused";
    StablecoinError[StablecoinError["InvalidAmount"] = 6002] = "InvalidAmount";
    StablecoinError[StablecoinError["QuotaExceeded"] = 6003] = "QuotaExceeded";
    StablecoinError[StablecoinError["RoleAlreadyAssigned"] = 6004] = "RoleAlreadyAssigned";
    StablecoinError[StablecoinError["MathOverflow"] = 6005] = "MathOverflow";
    StablecoinError[StablecoinError["InvalidAuthority"] = 6006] = "InvalidAuthority";
    StablecoinError[StablecoinError["ComplianceNotEnabled"] = 6007] = "ComplianceNotEnabled";
    StablecoinError[StablecoinError["AlreadyInitialized"] = 6008] = "AlreadyInitialized";
    StablecoinError[StablecoinError["InsufficientBalance"] = 6009] = "InsufficientBalance";
    StablecoinError[StablecoinError["SupplyCapExceeded"] = 6010] = "SupplyCapExceeded";
    StablecoinError[StablecoinError["EpochQuotaExceeded"] = 6011] = "EpochQuotaExceeded";
})(StablecoinError || (exports.StablecoinError = StablecoinError = {}));
/** Error codes from Transfer Hook program */
var TransferHookError;
(function (TransferHookError) {
    TransferHookError[TransferHookError["HookPaused"] = 8000] = "HookPaused";
    TransferHookError[TransferHookError["SourceBlacklisted"] = 8001] = "SourceBlacklisted";
    TransferHookError[TransferHookError["DestinationBlacklisted"] = 8002] = "DestinationBlacklisted";
    TransferHookError[TransferHookError["AmountTooLow"] = 8003] = "AmountTooLow";
    TransferHookError[TransferHookError["InvalidAuthority"] = 8004] = "InvalidAuthority";
    TransferHookError[TransferHookError["AlreadyBlacklisted"] = 8005] = "AlreadyBlacklisted";
    TransferHookError[TransferHookError["BlacklistNotFound"] = 8006] = "BlacklistNotFound";
    TransferHookError[TransferHookError["AlreadyWhitelisted"] = 8007] = "AlreadyWhitelisted";
    TransferHookError[TransferHookError["ComplianceNotEnabled"] = 8008] = "ComplianceNotEnabled";
    TransferHookError[TransferHookError["InvalidInstruction"] = 8009] = "InvalidInstruction";
    TransferHookError[TransferHookError["MathOverflow"] = 8010] = "MathOverflow";
    TransferHookError[TransferHookError["SelfSeizure"] = 8011] = "SelfSeizure";
})(TransferHookError || (exports.TransferHookError = TransferHookError = {}));
/** Decode error code to message */
function decodeError(code) {
    const errors = {
        [StablecoinError.Unauthorized]: "Unauthorized: Insufficient role permissions",
        [StablecoinError.ContractPaused]: "Contract is paused",
        [StablecoinError.InvalidAmount]: "Invalid amount",
        [StablecoinError.QuotaExceeded]: "Minter quota exceeded",
        [StablecoinError.RoleAlreadyAssigned]: "Role already assigned",
        [StablecoinError.MathOverflow]: "Math overflow",
        [StablecoinError.InvalidAuthority]: "Invalid authority",
        [StablecoinError.ComplianceNotEnabled]: "Compliance feature not enabled",
        [StablecoinError.AlreadyInitialized]: "Already initialized",
        [StablecoinError.InsufficientBalance]: "Insufficient balance",
        [StablecoinError.SupplyCapExceeded]: "Supply cap exceeded",
        [StablecoinError.EpochQuotaExceeded]: "Epoch quota exceeded",
        [TransferHookError.HookPaused]: "Transfer hook paused",
        [TransferHookError.SourceBlacklisted]: "Source address blacklisted",
        [TransferHookError.DestinationBlacklisted]: "Destination address blacklisted",
        [TransferHookError.AmountTooLow]: "Transfer amount below minimum",
        [TransferHookError.InvalidAuthority]: "Invalid authority",
        [TransferHookError.AlreadyBlacklisted]: "Address already blacklisted",
        [TransferHookError.BlacklistNotFound]: "Blacklist entry not found",
        [TransferHookError.AlreadyWhitelisted]: "Address already whitelisted",
        [TransferHookError.ComplianceNotEnabled]: "Compliance not enabled",
        [TransferHookError.SelfSeizure]: "Cannot seize from self",
    };
    return errors[code] || `Unknown error: ${code}`;
}
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Calculate fee for transfer
 */
function calculateFee(amount, feeBps, maxFee, minAmount) {
    if (amount.lt(minAmount)) {
        throw new Error("Amount below minimum");
    }
    const fee = amount.muln(feeBps).divn(10000);
    const actualFee = fee.gt(maxFee) ? maxFee : fee;
    const netAmount = amount.sub(actualFee);
    return {
        fee: actualFee,
        netAmount,
        rateBps: feeBps,
    };
}
/**
 * Check if address has specific role
 */
function hasRole(roles, role) {
    return (roles & role) !== 0;
}
/**
 * Get feature string representation
 */
function getFeatureString(feature) {
    switch (feature) {
        case 1:
            return "Transfer Hook";
        case 2:
            return "Permanent Delegate";
        case 4:
            return "Mint Close Authority";
        case 8:
            return "Default Account State";
        default:
            return "Unknown";
    }
}
/**
 * Format token amount with decimals
 */
function formatAmount(amount, decimals) {
    const divisor = new anchor_1.BN(10).pow(new anchor_1.BN(decimals));
    const whole = amount.div(divisor);
    const fraction = amount.mod(divisor);
    return `${whole}.${fraction.toString().padStart(decimals, "0")}`;
}
/**
 * Parse human-readable amount to BN
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
 * SSS-3 Feature flags
 */
exports.FEATURE_CONFIDENTIAL_TRANSFERS = 16;
exports.FEATURE_AUDITOR = 32;
exports.FEATURE_ALLOWLIST_REQUIRED = 64;
/**
 * Check if stablecoin has SSS-3 features
 */
function isSSS3(features) {
    return (features & exports.FEATURE_CONFIDENTIAL_TRANSFERS) !== 0;
}
