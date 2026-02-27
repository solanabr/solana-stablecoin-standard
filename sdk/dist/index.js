"use strict";
/**
 * Solana Stablecoin Standard (SSS) SDK
 *
 * @module @ssb/sss-sdk
 * @description TypeScript SDK for managing SSS-1 (minimal), SSS-2 (compliant), and SSS-3 (private) stablecoins on Solana
 *
 * @example
 * ```typescript
 * import { SolanaStablecoin, PrivacyModule, SSS3_PRESET } from '@ssb/sss-sdk';
 *
 * const sdk = new SolanaStablecoin(connection, wallet);
 * const privacy = new PrivacyModule(connection);
 *
 * // Initialize SSS-3 private stablecoin
 * const result = await sdk.initialize({
 *   name: 'Private USD',
 *   symbol: 'PUSD',
 *   decimals: 6,
 *   authority: keypair,
 *   ...SSS3_PRESET,
 * });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMintPDA = exports.getStablecoinPDA = exports.checkSSS3 = exports.parseAmount = exports.formatAmount = exports.getFeatureString = exports.hasRole = exports.calculateFee = exports.decodeError = exports.TransferHookError = exports.StablecoinError = exports.WhitelistType = exports.FEATURE_ALLOWLIST_REQUIRED = exports.FEATURE_AUDITOR = exports.FEATURE_CONFIDENTIAL_TRANSFERS = exports.FEATURE_DEFAULT_ACCOUNT_STATE = exports.FEATURE_MINT_CLOSE_AUTHORITY = exports.FEATURE_PERMANENT_DELEGATE = exports.FEATURE_TRANSFER_HOOK = exports.ROLE_NAMES = exports.ROLE_SEIZER = exports.ROLE_BLACKLISTER = exports.ROLE_PAUSER = exports.ROLE_BURNER = exports.ROLE_MINTER = exports.ROLE_MASTER = exports.SSS_TRANSFER_HOOK_PROGRAM_ID = exports.SSS_TOKEN_PROGRAM_ID = exports.PriceStatus = exports.PYTH_FEEDS = exports.createOracleConfig = exports.validatePrice = exports.buildOracleRemainingAccount = exports.tokenAmountToUsd = exports.usdToTokenAmount = exports.fetchPythPrice = exports.parsePythPrice = exports.SSS3_INIT_STEPS = exports.validateSSS3Params = exports.SSS3_FEATURE_DESCRIPTIONS = exports.decodeSSS3Features = exports.encodeSSS3Features = exports.isSSS3 = exports.createSSS3Params = exports.SSS3_COMPLIANT_PRESET = exports.SSS3_HIGH_PRIVACY_PRESET = exports.SSS3_PRESET = exports.generateElGamalKeypair = exports.PrivacyModule = exports.SolanaStablecoin = void 0;
exports.SSS3_PRIVATE_PRESET = exports.SSS2_HIGH_COMPLIANCE_PRESET = exports.SSS2_PRESET = exports.SSS1_PRESET = exports.DEFAULT_RETRY_DELAY = exports.DEFAULT_RETRIES = exports.TX_TIMEOUT = exports.MAX_BATCH_SIZE = exports.DEFAULT_COMMITMENT = exports.DEFAULT_RPC_ENDPOINT = exports.BUILD_DATE = exports.VERSION = exports.timeUntilEpochReset = exports.now = exports.formatTimestamp = exports.withRetry = exports.sleep = exports.isSlippageError = exports.isInsufficientFunds = exports.isAnchorError = exports.extractError = exports.getAccountOwner = exports.accountExists = exports.getTokenBalance = exports.formatWithSymbol = exports.parseTokenAmount = exports.formatTokenAmount = exports.wouldExceedCap = exports.wouldExceedQuota = exports.computeFee = exports.isSSS2 = exports.decodeFeatures = exports.hasFeature = exports.encodeRoles = exports.decodeRoles = exports.checkRole = exports.validateBatch = exports.validateDecimals = exports.validateSymbol = exports.validateName = exports.getWhitelistPDA = exports.getBlacklistPDA = exports.getHookConfigPDA = exports.getFreezeAuthorityPDA = exports.getBurnAuthorityPDA = exports.getMintAuthorityPDA = exports.getProposalPDA = exports.getMultisigConfigPDA = exports.getMinterPDA = exports.getRolePDA = void 0;
exports.EXPLORERS = exports.NETWORKS = void 0;
exports.quickStart = quickStart;
exports.needsMigration = needsMigration;
exports.getMigrationGuide = getMigrationGuide;
// Core SDK
var SolanaStablecoin_1 = require("./SolanaStablecoin");
Object.defineProperty(exports, "SolanaStablecoin", { enumerable: true, get: function () { return SolanaStablecoin_1.SolanaStablecoin; } });
// SSS-3 Privacy Module
var PrivacyModule_1 = require("./PrivacyModule");
Object.defineProperty(exports, "PrivacyModule", { enumerable: true, get: function () { return PrivacyModule_1.PrivacyModule; } });
Object.defineProperty(exports, "generateElGamalKeypair", { enumerable: true, get: function () { return PrivacyModule_1.generateElGamalKeypair; } });
// SSS-3 Presets
var sss3_1 = require("./sss3");
Object.defineProperty(exports, "SSS3_PRESET", { enumerable: true, get: function () { return sss3_1.SSS3_PRESET; } });
Object.defineProperty(exports, "SSS3_HIGH_PRIVACY_PRESET", { enumerable: true, get: function () { return sss3_1.SSS3_HIGH_PRIVACY_PRESET; } });
Object.defineProperty(exports, "SSS3_COMPLIANT_PRESET", { enumerable: true, get: function () { return sss3_1.SSS3_COMPLIANT_PRESET; } });
Object.defineProperty(exports, "createSSS3Params", { enumerable: true, get: function () { return sss3_1.createSSS3Params; } });
Object.defineProperty(exports, "isSSS3", { enumerable: true, get: function () { return sss3_1.isSSS3; } });
Object.defineProperty(exports, "encodeSSS3Features", { enumerable: true, get: function () { return sss3_1.encodeSSS3Features; } });
Object.defineProperty(exports, "decodeSSS3Features", { enumerable: true, get: function () { return sss3_1.decodeSSS3Features; } });
Object.defineProperty(exports, "SSS3_FEATURE_DESCRIPTIONS", { enumerable: true, get: function () { return sss3_1.SSS3_FEATURE_DESCRIPTIONS; } });
Object.defineProperty(exports, "validateSSS3Params", { enumerable: true, get: function () { return sss3_1.validateSSS3Params; } });
Object.defineProperty(exports, "SSS3_INIT_STEPS", { enumerable: true, get: function () { return sss3_1.SSS3_INIT_STEPS; } });
// Oracle Module (Pyth Integration)
var oracle_1 = require("./oracle");
Object.defineProperty(exports, "parsePythPrice", { enumerable: true, get: function () { return oracle_1.parsePythPrice; } });
Object.defineProperty(exports, "fetchPythPrice", { enumerable: true, get: function () { return oracle_1.fetchPythPrice; } });
Object.defineProperty(exports, "usdToTokenAmount", { enumerable: true, get: function () { return oracle_1.usdToTokenAmount; } });
Object.defineProperty(exports, "tokenAmountToUsd", { enumerable: true, get: function () { return oracle_1.tokenAmountToUsd; } });
Object.defineProperty(exports, "buildOracleRemainingAccount", { enumerable: true, get: function () { return oracle_1.buildOracleRemainingAccount; } });
Object.defineProperty(exports, "validatePrice", { enumerable: true, get: function () { return oracle_1.validatePrice; } });
Object.defineProperty(exports, "createOracleConfig", { enumerable: true, get: function () { return oracle_1.createOracleConfig; } });
Object.defineProperty(exports, "PYTH_FEEDS", { enumerable: true, get: function () { return oracle_1.PYTH_FEEDS; } });
Object.defineProperty(exports, "PriceStatus", { enumerable: true, get: function () { return oracle_1.PriceStatus; } });
// Types
var types_1 = require("./types");
// Program IDs
Object.defineProperty(exports, "SSS_TOKEN_PROGRAM_ID", { enumerable: true, get: function () { return types_1.SSS_TOKEN_PROGRAM_ID; } });
Object.defineProperty(exports, "SSS_TRANSFER_HOOK_PROGRAM_ID", { enumerable: true, get: function () { return types_1.SSS_TRANSFER_HOOK_PROGRAM_ID; } });
// Roles
Object.defineProperty(exports, "ROLE_MASTER", { enumerable: true, get: function () { return types_1.ROLE_MASTER; } });
Object.defineProperty(exports, "ROLE_MINTER", { enumerable: true, get: function () { return types_1.ROLE_MINTER; } });
Object.defineProperty(exports, "ROLE_BURNER", { enumerable: true, get: function () { return types_1.ROLE_BURNER; } });
Object.defineProperty(exports, "ROLE_PAUSER", { enumerable: true, get: function () { return types_1.ROLE_PAUSER; } });
Object.defineProperty(exports, "ROLE_BLACKLISTER", { enumerable: true, get: function () { return types_1.ROLE_BLACKLISTER; } });
Object.defineProperty(exports, "ROLE_SEIZER", { enumerable: true, get: function () { return types_1.ROLE_SEIZER; } });
Object.defineProperty(exports, "ROLE_NAMES", { enumerable: true, get: function () { return types_1.ROLE_NAMES; } });
// Features
Object.defineProperty(exports, "FEATURE_TRANSFER_HOOK", { enumerable: true, get: function () { return types_1.FEATURE_TRANSFER_HOOK; } });
Object.defineProperty(exports, "FEATURE_PERMANENT_DELEGATE", { enumerable: true, get: function () { return types_1.FEATURE_PERMANENT_DELEGATE; } });
Object.defineProperty(exports, "FEATURE_MINT_CLOSE_AUTHORITY", { enumerable: true, get: function () { return types_1.FEATURE_MINT_CLOSE_AUTHORITY; } });
Object.defineProperty(exports, "FEATURE_DEFAULT_ACCOUNT_STATE", { enumerable: true, get: function () { return types_1.FEATURE_DEFAULT_ACCOUNT_STATE; } });
Object.defineProperty(exports, "FEATURE_CONFIDENTIAL_TRANSFERS", { enumerable: true, get: function () { return types_1.FEATURE_CONFIDENTIAL_TRANSFERS; } });
Object.defineProperty(exports, "FEATURE_AUDITOR", { enumerable: true, get: function () { return types_1.FEATURE_AUDITOR; } });
Object.defineProperty(exports, "FEATURE_ALLOWLIST_REQUIRED", { enumerable: true, get: function () { return types_1.FEATURE_ALLOWLIST_REQUIRED; } });
Object.defineProperty(exports, "WhitelistType", { enumerable: true, get: function () { return types_1.WhitelistType; } });
// Errors
Object.defineProperty(exports, "StablecoinError", { enumerable: true, get: function () { return types_1.StablecoinError; } });
Object.defineProperty(exports, "TransferHookError", { enumerable: true, get: function () { return types_1.TransferHookError; } });
Object.defineProperty(exports, "decodeError", { enumerable: true, get: function () { return types_1.decodeError; } });
// Helpers
Object.defineProperty(exports, "calculateFee", { enumerable: true, get: function () { return types_1.calculateFee; } });
Object.defineProperty(exports, "hasRole", { enumerable: true, get: function () { return types_1.hasRole; } });
Object.defineProperty(exports, "getFeatureString", { enumerable: true, get: function () { return types_1.getFeatureString; } });
Object.defineProperty(exports, "formatAmount", { enumerable: true, get: function () { return types_1.formatAmount; } });
Object.defineProperty(exports, "parseAmount", { enumerable: true, get: function () { return types_1.parseAmount; } });
Object.defineProperty(exports, "checkSSS3", { enumerable: true, get: function () { return types_1.isSSS3; } });
// Utils
var utils_1 = require("./utils");
// PDA helpers
Object.defineProperty(exports, "getStablecoinPDA", { enumerable: true, get: function () { return utils_1.getStablecoinPDA; } });
Object.defineProperty(exports, "getMintPDA", { enumerable: true, get: function () { return utils_1.getMintPDA; } });
Object.defineProperty(exports, "getRolePDA", { enumerable: true, get: function () { return utils_1.getRolePDA; } });
Object.defineProperty(exports, "getMinterPDA", { enumerable: true, get: function () { return utils_1.getMinterPDA; } });
Object.defineProperty(exports, "getMultisigConfigPDA", { enumerable: true, get: function () { return utils_1.getMultisigConfigPDA; } });
Object.defineProperty(exports, "getProposalPDA", { enumerable: true, get: function () { return utils_1.getProposalPDA; } });
Object.defineProperty(exports, "getMintAuthorityPDA", { enumerable: true, get: function () { return utils_1.getMintAuthorityPDA; } });
Object.defineProperty(exports, "getBurnAuthorityPDA", { enumerable: true, get: function () { return utils_1.getBurnAuthorityPDA; } });
Object.defineProperty(exports, "getFreezeAuthorityPDA", { enumerable: true, get: function () { return utils_1.getFreezeAuthorityPDA; } });
Object.defineProperty(exports, "getHookConfigPDA", { enumerable: true, get: function () { return utils_1.getHookConfigPDA; } });
Object.defineProperty(exports, "getBlacklistPDA", { enumerable: true, get: function () { return utils_1.getBlacklistPDA; } });
Object.defineProperty(exports, "getWhitelistPDA", { enumerable: true, get: function () { return utils_1.getWhitelistPDA; } });
// Validation
Object.defineProperty(exports, "validateName", { enumerable: true, get: function () { return utils_1.validateName; } });
Object.defineProperty(exports, "validateSymbol", { enumerable: true, get: function () { return utils_1.validateSymbol; } });
Object.defineProperty(exports, "validateDecimals", { enumerable: true, get: function () { return utils_1.validateDecimals; } });
Object.defineProperty(exports, "validateBatch", { enumerable: true, get: function () { return utils_1.validateBatch; } });
// Role helpers
Object.defineProperty(exports, "checkRole", { enumerable: true, get: function () { return utils_1.hasRole; } });
Object.defineProperty(exports, "decodeRoles", { enumerable: true, get: function () { return utils_1.decodeRoles; } });
Object.defineProperty(exports, "encodeRoles", { enumerable: true, get: function () { return utils_1.encodeRoles; } });
// Feature helpers
Object.defineProperty(exports, "hasFeature", { enumerable: true, get: function () { return utils_1.hasFeature; } });
Object.defineProperty(exports, "decodeFeatures", { enumerable: true, get: function () { return utils_1.decodeFeatures; } });
Object.defineProperty(exports, "isSSS2", { enumerable: true, get: function () { return utils_1.isSSS2; } });
// Calculations
Object.defineProperty(exports, "computeFee", { enumerable: true, get: function () { return utils_1.calculateFee; } });
Object.defineProperty(exports, "wouldExceedQuota", { enumerable: true, get: function () { return utils_1.wouldExceedQuota; } });
Object.defineProperty(exports, "wouldExceedCap", { enumerable: true, get: function () { return utils_1.wouldExceedCap; } });
// Formatting
Object.defineProperty(exports, "formatTokenAmount", { enumerable: true, get: function () { return utils_1.formatAmount; } });
Object.defineProperty(exports, "parseTokenAmount", { enumerable: true, get: function () { return utils_1.parseAmount; } });
Object.defineProperty(exports, "formatWithSymbol", { enumerable: true, get: function () { return utils_1.formatWithSymbol; } });
// RPC helpers
Object.defineProperty(exports, "getTokenBalance", { enumerable: true, get: function () { return utils_1.getTokenBalance; } });
Object.defineProperty(exports, "accountExists", { enumerable: true, get: function () { return utils_1.accountExists; } });
Object.defineProperty(exports, "getAccountOwner", { enumerable: true, get: function () { return utils_1.getAccountOwner; } });
// Error handling
Object.defineProperty(exports, "extractError", { enumerable: true, get: function () { return utils_1.extractError; } });
Object.defineProperty(exports, "isAnchorError", { enumerable: true, get: function () { return utils_1.isAnchorError; } });
Object.defineProperty(exports, "isInsufficientFunds", { enumerable: true, get: function () { return utils_1.isInsufficientFunds; } });
Object.defineProperty(exports, "isSlippageError", { enumerable: true, get: function () { return utils_1.isSlippageError; } });
// Utils
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return utils_1.sleep; } });
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return utils_1.withRetry; } });
// Time
Object.defineProperty(exports, "formatTimestamp", { enumerable: true, get: function () { return utils_1.formatTimestamp; } });
Object.defineProperty(exports, "now", { enumerable: true, get: function () { return utils_1.now; } });
Object.defineProperty(exports, "timeUntilEpochReset", { enumerable: true, get: function () { return utils_1.timeUntilEpochReset; } });
// ============================================
// CONSTANTS
// ============================================
/** SDK Version */
exports.VERSION = "0.2.0";
/** SDK Build Date */
exports.BUILD_DATE = new Date("2025-02-25");
/** Default RPC Endpoint */
exports.DEFAULT_RPC_ENDPOINT = "https://api.devnet.solana.com";
/** Default Commitment Level */
exports.DEFAULT_COMMITMENT = "confirmed";
/** Default Max Batch Size */
exports.MAX_BATCH_SIZE = 10;
/** Default Transaction Timeout (ms) */
exports.TX_TIMEOUT = 30000;
/** Default Retry Count */
exports.DEFAULT_RETRIES = 3;
/** Default Retry Delay (ms) */
exports.DEFAULT_RETRY_DELAY = 1000;
// ============================================
// PRESETS
// ============================================
/** SSS-1 Minimal preset configuration */
exports.SSS1_PRESET = {
    enableTransferHook: false,
    enablePermanentDelegate: false,
};
/** SSS-2 Compliant preset configuration */
exports.SSS2_PRESET = {
    enableTransferHook: true,
    enablePermanentDelegate: true,
    transferFeeBasisPoints: 100, // 1%
    maxTransferFee: 100000, // 0.1 token
    minTransferAmount: 1000, // 0.001 token
};
/** SSS-2 High Compliance preset (stricter settings) */
exports.SSS2_HIGH_COMPLIANCE_PRESET = {
    enableTransferHook: true,
    enablePermanentDelegate: true,
    transferFeeBasisPoints: 200, // 2%
    maxTransferFee: 500000, // 0.5 token
    minTransferAmount: 10000, // 0.01 token
};
/** SSS-3 Private preset (confidential transfers) */
exports.SSS3_PRIVATE_PRESET = {
    ...exports.SSS2_PRESET,
    enableConfidentialTransfers: true,
    requireAllowlist: false,
    maxConfidentialBalance: 0, // Unlimited
};
// ============================================
// QUICK START
// ============================================
/**
 * Quick start preset for new developers
 *
 * @example
 * ```typescript
 * import { quickStart } from '@ssb/sss-sdk';
 *
 * const { initSSS1, initSSS2, initSSS3, privacy } = quickStart(connection, wallet);
 *
 * // Initialize SSS-3 private stablecoin
 * const result = await initSSS3('Private USD', 'PUSD');
 * ```
 */
function quickStart(connection, wallet) {
    const sdk = require("./SolanaStablecoin");
    const privacyMod = require("./PrivacyModule");
    const sss3 = require("./sss3");
    const sdkInstance = new sdk.SolanaStablecoin(connection, wallet);
    const privacyInstance = new privacyMod.PrivacyModule(connection, wallet);
    return {
        sdk: sdkInstance,
        privacy: privacyInstance,
        /** Initialize SSS-1 stablecoin */
        initSSS1: async (name, symbol, decimals = 6) => {
            return await sdkInstance.initialize({
                name,
                symbol,
                decimals,
                authority: wallet.payer,
                ...exports.SSS1_PRESET,
            });
        },
        /** Initialize SSS-2 stablecoin */
        initSSS2: async (name, symbol, decimals = 6) => {
            return await sdkInstance.initialize({
                name,
                symbol,
                decimals,
                authority: wallet.payer,
                ...exports.SSS2_PRESET,
            });
        },
        /** Initialize SSS-3 private stablecoin */
        initSSS3: async (name, symbol, decimals = 6) => {
            return await sdkInstance.initialize({
                name,
                symbol,
                decimals,
                authority: wallet.payer,
                ...sss3.SSS3_PRESET,
            });
        },
        /** Mint tokens */
        mint: sdkInstance.mint.bind(sdkInstance),
        /** Burn tokens */
        burn: sdkInstance.burn.bind(sdkInstance),
        /** Freeze account */
        freeze: sdkInstance.freeze.bind(sdkInstance),
        /** Thaw account */
        thaw: sdkInstance.thaw.bind(sdkInstance),
        /** Pause contract */
        pause: sdkInstance.pause.bind(sdkInstance),
        /** Unpause contract */
        unpause: sdkInstance.unpause.bind(sdkInstance),
        /** Get state */
        getState: sdkInstance.getState.bind(sdkInstance),
        /** Get role */
        getRole: sdkInstance.getRole.bind(sdkInstance),
        /** Create confidential account */
        createConfidentialAccount: privacyInstance.createConfidentialAccount.bind(privacyInstance),
        /** Confidential transfer */
        confidentialTransfer: privacyInstance.confidentialTransfer.bind(privacyInstance),
        /** Deposit to confidential */
        depositToConfidential: privacyInstance.depositToConfidential.bind(privacyInstance),
        /** Withdraw from confidential */
        withdrawFromConfidential: privacyInstance.withdrawFromConfidential.bind(privacyInstance),
    };
}
// ============================================
// SUPPORTED NETWORKS
// ============================================
exports.NETWORKS = {
    /** Local validator */
    LOCALNET: "http://127.0.0.1:8899",
    /** Solana Devnet */
    DEVNET: "https://api.devnet.solana.com",
    /** Solana Mainnet */
    MAINNET: "https://api.mainnet-beta.solana.com",
    /** QuickNode Devnet (example) */
    QUICKNODE_DEVNET: "https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY",
    /** Helius Devnet */
    HELIUS_DEVNET: "https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY",
    /** Helius Mainnet */
    HELIUS_MAINNET: "https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY",
};
// ============================================
// EXPLORER URLS
// ============================================
exports.EXPLORERS = {
    /** SolanaFM */
    SOLANAFM: {
        devnet: (address) => `https://solana.fm/address/${address}?cluster=devnet-solana`,
        mainnet: (address) => `https://solana.fm/address/${address}`,
    },
    /** Solscan */
    SOLSCAN: {
        devnet: (address) => `https://solscan.io/account/${address}?cluster=devnet`,
        mainnet: (address) => `https://solscan.io/account/${address}`,
    },
    /** Explorer.solana.com */
    EXPLORER: {
        devnet: (address) => `https://explorer.solana.com/address/${address}?cluster=devnet`,
        mainnet: (address) => `https://explorer.solana.com/address/${address}`,
    },
};
// ============================================
// MIGRATION
// ============================================
/**
 * Check if SDK needs to migrate from older version
 */
function needsMigration(version) {
    // For now, no migrations needed
    return false;
}
/**
 * Get migration guide URL
 */
function getMigrationGuide() {
    return "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SDK_MIGRATION.md";
}
//# sourceMappingURL=index.js.map