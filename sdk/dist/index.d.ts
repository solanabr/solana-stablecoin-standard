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
export { SolanaStablecoin } from "./SolanaStablecoin";
export { PrivacyModule, generateElGamalKeypair } from "./PrivacyModule";
export { SSS3_PRESET, SSS3_HIGH_PRIVACY_PRESET, SSS3_COMPLIANT_PRESET, createSSS3Params, isSSS3, encodeSSS3Features, decodeSSS3Features, SSS3_FEATURE_DESCRIPTIONS, validateSSS3Params, SSS3_INIT_STEPS, } from "./sss3";
export { parsePythPrice, fetchPythPrice, usdToTokenAmount, tokenAmountToUsd, buildOracleRemainingAccount, validatePrice, createOracleConfig, PYTH_FEEDS, PriceStatus, } from "./oracle";
export type { PythPrice, OracleConfig } from "./oracle";
export { SSS_TOKEN_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID, ROLE_MASTER, ROLE_MINTER, ROLE_BURNER, ROLE_PAUSER, ROLE_BLACKLISTER, ROLE_SEIZER, ROLE_NAMES, FEATURE_TRANSFER_HOOK, FEATURE_PERMANENT_DELEGATE, FEATURE_MINT_CLOSE_AUTHORITY, FEATURE_DEFAULT_ACCOUNT_STATE, FEATURE_CONFIDENTIAL_TRANSFERS, FEATURE_AUDITOR, FEATURE_ALLOWLIST_REQUIRED, StablecoinState, RoleAccount, MinterInfo, MultisigConfig, MultisigProposal, SDKResult, StablecoinInitialized, TokensMinted, TokensBurned, AccountFrozen, AccountThawed, StablecoinPaused, StablecoinUnpaused, RolesUpdated, MinterQuotaUpdated, AuthorityTransferred, BatchMinted, MultisigProposalCreated, MultisigProposalApproved, MultisigProposalExecuted, SSS2HookConfig, BlacklistEntry, WhitelistEntry, WhitelistType, FeeCalculation, TransferExecuted, TokensSeized, BlacklistAdded, BlacklistRemoved, ConfigUpdated, BatchBlacklistAdded, ConfidentialAccount, AllowlistEntry, RangeProof, ElGamalPubkey, ConfidentialityConfig, ElGamalRegistry, StablecoinError, TransferHookError, decodeError, calculateFee, hasRole, getFeatureString, formatAmount, parseAmount, isSSS3 as checkSSS3, } from "./types";
export { getStablecoinPDA, getMintPDA, getRolePDA, getMinterPDA, getMultisigConfigPDA, getProposalPDA, getMintAuthorityPDA, getBurnAuthorityPDA, getFreezeAuthorityPDA, getHookConfigPDA, getBlacklistPDA, getWhitelistPDA, validateName, validateSymbol, validateDecimals, validateBatch, hasRole as checkRole, decodeRoles, encodeRoles, hasFeature, decodeFeatures, isSSS2, calculateFee as computeFee, wouldExceedQuota, wouldExceedCap, formatAmount as formatTokenAmount, parseAmount as parseTokenAmount, formatWithSymbol, getTokenBalance, accountExists, getAccountOwner, extractError, isAnchorError, isInsufficientFunds, isSlippageError, sleep, withRetry, formatTimestamp, now, timeUntilEpochReset, } from "./utils";
/** SDK Version */
export declare const VERSION = "0.2.0";
/** SDK Build Date */
export declare const BUILD_DATE: Date;
/** Default RPC Endpoint */
export declare const DEFAULT_RPC_ENDPOINT = "https://api.devnet.solana.com";
/** Default Commitment Level */
export declare const DEFAULT_COMMITMENT = "confirmed";
/** Default Max Batch Size */
export declare const MAX_BATCH_SIZE = 10;
/** Default Transaction Timeout (ms) */
export declare const TX_TIMEOUT = 30000;
/** Default Retry Count */
export declare const DEFAULT_RETRIES = 3;
/** Default Retry Delay (ms) */
export declare const DEFAULT_RETRY_DELAY = 1000;
/** SSS-1 Minimal preset configuration */
export declare const SSS1_PRESET: {
    enableTransferHook: boolean;
    enablePermanentDelegate: boolean;
};
/** SSS-2 Compliant preset configuration */
export declare const SSS2_PRESET: {
    enableTransferHook: boolean;
    enablePermanentDelegate: boolean;
    transferFeeBasisPoints: number;
    maxTransferFee: number;
    minTransferAmount: number;
};
/** SSS-2 High Compliance preset (stricter settings) */
export declare const SSS2_HIGH_COMPLIANCE_PRESET: {
    enableTransferHook: boolean;
    enablePermanentDelegate: boolean;
    transferFeeBasisPoints: number;
    maxTransferFee: number;
    minTransferAmount: number;
};
/** SSS-3 Private preset (confidential transfers) */
export declare const SSS3_PRIVATE_PRESET: {
    enableConfidentialTransfers: boolean;
    requireAllowlist: boolean;
    maxConfidentialBalance: number;
    enableTransferHook: boolean;
    enablePermanentDelegate: boolean;
    transferFeeBasisPoints: number;
    maxTransferFee: number;
    minTransferAmount: number;
};
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
export declare function quickStart(connection: any, wallet: any): {
    sdk: any;
    privacy: any;
    /** Initialize SSS-1 stablecoin */
    initSSS1: (name: string, symbol: string, decimals?: number) => Promise<any>;
    /** Initialize SSS-2 stablecoin */
    initSSS2: (name: string, symbol: string, decimals?: number) => Promise<any>;
    /** Initialize SSS-3 private stablecoin */
    initSSS3: (name: string, symbol: string, decimals?: number) => Promise<any>;
    /** Mint tokens */
    mint: any;
    /** Burn tokens */
    burn: any;
    /** Freeze account */
    freeze: any;
    /** Thaw account */
    thaw: any;
    /** Pause contract */
    pause: any;
    /** Unpause contract */
    unpause: any;
    /** Get state */
    getState: any;
    /** Get role */
    getRole: any;
    /** Create confidential account */
    createConfidentialAccount: any;
    /** Confidential transfer */
    confidentialTransfer: any;
    /** Deposit to confidential */
    depositToConfidential: any;
    /** Withdraw from confidential */
    withdrawFromConfidential: any;
};
export declare const NETWORKS: {
    /** Local validator */
    LOCALNET: string;
    /** Solana Devnet */
    DEVNET: string;
    /** Solana Mainnet */
    MAINNET: string;
    /** QuickNode Devnet (example) */
    QUICKNODE_DEVNET: string;
    /** Helius Devnet */
    HELIUS_DEVNET: string;
    /** Helius Mainnet */
    HELIUS_MAINNET: string;
};
export declare const EXPLORERS: {
    /** SolanaFM */
    SOLANAFM: {
        devnet: (address: string) => string;
        mainnet: (address: string) => string;
    };
    /** Solscan */
    SOLSCAN: {
        devnet: (address: string) => string;
        mainnet: (address: string) => string;
    };
    /** Explorer.solana.com */
    EXPLORER: {
        devnet: (address: string) => string;
        mainnet: (address: string) => string;
    };
};
/**
 * Check if SDK needs to migrate from older version
 */
export declare function needsMigration(version: string): boolean;
/**
 * Get migration guide URL
 */
export declare function getMigrationGuide(): string;
//# sourceMappingURL=index.d.ts.map