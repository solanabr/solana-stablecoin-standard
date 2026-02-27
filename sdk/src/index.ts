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

// Core SDK
export { SolanaStablecoin } from "./SolanaStablecoin";

// SSS-3 Privacy Module
export { PrivacyModule, generateElGamalKeypair } from "./PrivacyModule";

// SSS-3 Presets
export {
  SSS3_PRESET,
  SSS3_HIGH_PRIVACY_PRESET,
  SSS3_COMPLIANT_PRESET,
  createSSS3Params,
  isSSS3,
  encodeSSS3Features,
  decodeSSS3Features,
  SSS3_FEATURE_DESCRIPTIONS,
  validateSSS3Params,
  SSS3_INIT_STEPS,
} from "./sss3";

// Oracle Module (Pyth Integration)
export {
  parsePythPrice,
  fetchPythPrice,
  usdToTokenAmount,
  tokenAmountToUsd,
  buildOracleRemainingAccount,
  validatePrice,
  createOracleConfig,
  PYTH_FEEDS,
  PriceStatus,
} from "./oracle";
export type { PythPrice, OracleConfig } from "./oracle";

// Types
export {
  // Program IDs
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,

  // Roles
  ROLE_MASTER,
  ROLE_MINTER,
  ROLE_BURNER,
  ROLE_PAUSER,
  ROLE_BLACKLISTER,
  ROLE_SEIZER,
  ROLE_NAMES,

  // Features
  FEATURE_TRANSFER_HOOK,
  FEATURE_PERMANENT_DELEGATE,
  FEATURE_MINT_CLOSE_AUTHORITY,
  FEATURE_DEFAULT_ACCOUNT_STATE,
  FEATURE_CONFIDENTIAL_TRANSFERS,
  FEATURE_AUDITOR,
  FEATURE_ALLOWLIST_REQUIRED,

  // State types
  StablecoinState,
  RoleAccount,
  MinterInfo,
  MultisigConfig,
  MultisigProposal,

  // SDK result
  SDKResult,

  // Events
  StablecoinInitialized,
  TokensMinted,
  TokensBurned,
  AccountFrozen,
  AccountThawed,
  StablecoinPaused,
  StablecoinUnpaused,
  RolesUpdated,
  MinterQuotaUpdated,
  AuthorityTransferred,
  BatchMinted,
  MultisigProposalCreated,
  MultisigProposalApproved,
  MultisigProposalExecuted,

  // SSS-2 Types
  SSS2HookConfig,
  BlacklistEntry,
  WhitelistEntry,
  WhitelistType,
  FeeCalculation,
  TransferExecuted,
  TokensSeized,
  BlacklistAdded,
  BlacklistRemoved,
  ConfigUpdated,
  BatchBlacklistAdded,

  // SSS-3 Types
  ConfidentialAccount,
  AllowlistEntry,
  RangeProof,
  ElGamalPubkey,
  ConfidentialityConfig,
  ElGamalRegistry,

  // Errors
  StablecoinError,
  TransferHookError,
  decodeError,

  // Helpers
  calculateFee,
  hasRole,
  getFeatureString,
  formatAmount,
  parseAmount,
  isSSS3 as checkSSS3,
} from "./types";

// Utils
export {
  // PDA helpers
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

  // Role helpers
  hasRole as checkRole,
  decodeRoles,
  encodeRoles,

  // Feature helpers
  hasFeature,
  decodeFeatures,
  isSSS2,

  // Calculations
  calculateFee as computeFee,
  wouldExceedQuota,
  wouldExceedCap,

  // Formatting
  formatAmount as formatTokenAmount,
  parseAmount as parseTokenAmount,
  formatWithSymbol,

  // RPC helpers
  getTokenBalance,
  accountExists,
  getAccountOwner,

  // Error handling
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
} from "./utils";

// ============================================
// CONSTANTS
// ============================================

/** SDK Version */
export const VERSION = "0.2.0";

/** SDK Build Date */
export const BUILD_DATE = new Date("2025-02-25");

/** Default RPC Endpoint */
export const DEFAULT_RPC_ENDPOINT = "https://api.devnet.solana.com";

/** Default Commitment Level */
export const DEFAULT_COMMITMENT = "confirmed";

/** Default Max Batch Size */
export const MAX_BATCH_SIZE = 10;

/** Default Transaction Timeout (ms) */
export const TX_TIMEOUT = 30000;

/** Default Retry Count */
export const DEFAULT_RETRIES = 3;

/** Default Retry Delay (ms) */
export const DEFAULT_RETRY_DELAY = 1000;

// ============================================
// PRESETS
// ============================================

/** SSS-1 Minimal preset configuration */
export const SSS1_PRESET = {
  enableTransferHook: false,
  enablePermanentDelegate: false,
};

/** SSS-2 Compliant preset configuration */
export const SSS2_PRESET = {
  enableTransferHook: true,
  enablePermanentDelegate: true,
  transferFeeBasisPoints: 100, // 1%
  maxTransferFee: 100000, // 0.1 token
  minTransferAmount: 1000, // 0.001 token
};

/** SSS-2 High Compliance preset (stricter settings) */
export const SSS2_HIGH_COMPLIANCE_PRESET = {
  enableTransferHook: true,
  enablePermanentDelegate: true,
  transferFeeBasisPoints: 200, // 2%
  maxTransferFee: 500000, // 0.5 token
  minTransferAmount: 10000, // 0.01 token
};

/** SSS-3 Private preset (confidential transfers) */
export const SSS3_PRIVATE_PRESET = {
  ...SSS2_PRESET,
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
export function quickStart(connection: any, wallet: any) {
  const sdk = require("./SolanaStablecoin");
  const privacyMod = require("./PrivacyModule");
  const sss3 = require("./sss3");

  const sdkInstance = new sdk.SolanaStablecoin(connection, wallet);
  const privacyInstance = new privacyMod.PrivacyModule(connection, wallet);

  return {
    sdk: sdkInstance,
    privacy: privacyInstance,

    /** Initialize SSS-1 stablecoin */
    initSSS1: async (name: string, symbol: string, decimals: number = 6) => {
      return await sdkInstance.initialize({
        name,
        symbol,
        decimals,
        authority: (wallet as any).payer,
        ...SSS1_PRESET,
      });
    },

    /** Initialize SSS-2 stablecoin */
    initSSS2: async (name: string, symbol: string, decimals: number = 6) => {
      return await sdkInstance.initialize({
        name,
        symbol,
        decimals,
        authority: (wallet as any).payer,
        ...SSS2_PRESET,
      });
    },

    /** Initialize SSS-3 private stablecoin */
    initSSS3: async (name: string, symbol: string, decimals: number = 6) => {
      return await sdkInstance.initialize({
        name,
        symbol,
        decimals,
        authority: (wallet as any).payer,
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
    createConfidentialAccount:
      privacyInstance.createConfidentialAccount.bind(privacyInstance),

    /** Confidential transfer */
    confidentialTransfer:
      privacyInstance.confidentialTransfer.bind(privacyInstance),

    /** Deposit to confidential */
    depositToConfidential:
      privacyInstance.depositToConfidential.bind(privacyInstance),

    /** Withdraw from confidential */
    withdrawFromConfidential:
      privacyInstance.withdrawFromConfidential.bind(privacyInstance),
  };
}

// ============================================
// SUPPORTED NETWORKS
// ============================================

export const NETWORKS = {
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

export const EXPLORERS = {
  /** SolanaFM */
  SOLANAFM: {
    devnet: (address: string) =>
      `https://solana.fm/address/${address}?cluster=devnet-solana`,
    mainnet: (address: string) => `https://solana.fm/address/${address}`,
  },

  /** Solscan */
  SOLSCAN: {
    devnet: (address: string) =>
      `https://solscan.io/account/${address}?cluster=devnet`,
    mainnet: (address: string) => `https://solscan.io/account/${address}`,
  },

  /** Explorer.solana.com */
  EXPLORER: {
    devnet: (address: string) =>
      `https://explorer.solana.com/address/${address}?cluster=devnet`,
    mainnet: (address: string) =>
      `https://explorer.solana.com/address/${address}`,
  },
};

// ============================================
// MIGRATION
// ============================================

/**
 * Check if SDK needs to migrate from older version
 */
export function needsMigration(version: string): boolean {
  // For now, no migrations needed
  return false;
}

/**
 * Get migration guide URL
 */
export function getMigrationGuide(): string {
  return "https://github.com/solanabr/solana-stablecoin-standard/blob/main/SDK_MIGRATION.md";
}
