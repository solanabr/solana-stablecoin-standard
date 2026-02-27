/**
 * SDK Utilities for SSS Token
 *
 * Helper functions for common operations
 */
import { PublicKey, Connection } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { FeeCalculation } from "./types";
/**
 * Get stablecoin PDA (state account)
 */
export declare function getStablecoinPDA(mint: PublicKey): PublicKey;
/**
 * Get mint PDA
 */
export declare function getMintPDA(stablecoin: PublicKey): PublicKey;
/**
 * Get role PDA
 */
export declare function getRolePDA(owner: PublicKey, mint: PublicKey): PublicKey;
/**
 * Get minter info PDA
 */
export declare function getMinterPDA(minter: PublicKey, mint: PublicKey): PublicKey;
/**
 * Get multisig config PDA
 */
export declare function getMultisigConfigPDA(stablecoin: PublicKey): PublicKey;
/**
 * Get proposal PDA
 */
export declare function getProposalPDA(multisigConfig: PublicKey, proposer: PublicKey, timestamp: BN): PublicKey;
/**
 * Get mint authority PDA
 */
export declare function getMintAuthorityPDA(stablecoin: PublicKey): PublicKey;
/**
 * Get burn authority PDA
 */
export declare function getBurnAuthorityPDA(stablecoin: PublicKey): PublicKey;
/**
 * Get freeze authority PDA
 */
export declare function getFreezeAuthorityPDA(stablecoin: PublicKey): PublicKey;
/**
 * Get hook config PDA
 */
export declare function getHookConfigPDA(mint: PublicKey): PublicKey;
/**
 * Get blacklist entry PDA
 */
export declare function getBlacklistPDA(config: PublicKey, address: PublicKey): PublicKey;
/**
 * Get whitelist entry PDA
 */
export declare function getWhitelistPDA(config: PublicKey, address: PublicKey): PublicKey;
/**
 * Validate token name
 * @returns true if valid
 */
export declare function validateName(name: string): {
    valid: boolean;
    error?: string;
};
/**
 * Validate token symbol
 */
export declare function validateSymbol(symbol: string): {
    valid: boolean;
    error?: string;
};
/**
 * Validate decimals
 */
export declare function validateDecimals(decimals: number): {
    valid: boolean;
    error?: string;
};
/**
 * Validate batch parameters
 */
export declare function validateBatch(recipients: PublicKey[], amounts: BN[]): {
    valid: boolean;
    error?: string;
};
/**
 * Check if roles bitmask includes specific role
 */
export declare function hasRole(roles: number, role: number): boolean;
/**
 * Decode roles bitmask to human-readable names
 */
export declare function decodeRoles(roles: number): string[];
/**
 * Encode role names to bitmask
 */
export declare function encodeRoles(roleNames: string[]): number;
/**
 * Check if feature is enabled
 */
export declare function hasFeature(features: number, feature: number): boolean;
/**
 * Decode features bitmask
 */
export declare function decodeFeatures(features: number): string[];
/**
 * Check if stablecoin is SSS-2 (has compliance features)
 */
export declare function isSSS2(features: number): boolean;
/**
 * Calculate transfer fee
 */
export declare function calculateFee(amount: BN, feeBps: number, maxFee: BN, minAmount: BN): FeeCalculation;
/**
 * Check if mint amount would exceed quota
 */
export declare function wouldExceedQuota(current: BN, quota: BN, amount: BN): boolean;
/**
 * Check if mint amount would exceed supply cap
 */
export declare function wouldExceedCap(currentSupply: BN, cap: BN, amount: BN): boolean;
/**
 * Format amount with decimals for display
 * @example formatAmount(new BN(1000000), 6) // "1.000000"
 */
export declare function formatAmount(amount: BN, decimals: number): string;
/**
 * Parse human-readable amount to BN
 * @example parseAmount("1.5", 6) // BN(1500000)
 */
export declare function parseAmount(amount: string, decimals: number): BN;
/**
 * Format amount with symbol
 * @example formatWithSymbol(new BN(1000000), 6, 'USDC') // "1.00 USDC"
 */
export declare function formatWithSymbol(amount: BN, decimals: number, symbol: string, precision?: number): string;
/**
 * Get token account balance
 */
export declare function getTokenBalance(connection: Connection, tokenAccount: PublicKey): Promise<BN>;
/**
 * Check if account exists
 */
export declare function accountExists(connection: Connection, account: PublicKey): Promise<boolean>;
/**
 * Get account owner
 */
export declare function getAccountOwner(connection: Connection, tokenAccount: PublicKey): Promise<PublicKey | null>;
/**
 * Extract error message from transaction result
 */
export declare function extractError(error: any): string;
/**
 * Check if error is a specific Anchor error
 */
export declare function isAnchorError(error: any, errorCode: number): boolean;
/**
 * Check if transaction failed due to insufficient funds
 */
export declare function isInsufficientFunds(error: any): boolean;
/**
 * Check if transaction failed due to slippage (for swaps)
 */
export declare function isSlippageError(error: any): boolean;
/**
 * Sleep for milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Retry a function with exponential backoff
 */
export declare function withRetry<T>(fn: () => Promise<T>, retries?: number, delay?: number): Promise<T>;
/**
 * Format timestamp to readable string
 */
export declare function formatTimestamp(timestamp: BN): string;
/**
 * Get current timestamp as BN
 */
export declare function now(): BN;
/**
 * Calculate time until epoch reset
 */
export declare function timeUntilEpochReset(epochStart: BN, epochDurationSeconds?: number): number;
declare const _default: {
    getStablecoinPDA: typeof getStablecoinPDA;
    getMintPDA: typeof getMintPDA;
    getRolePDA: typeof getRolePDA;
    getMinterPDA: typeof getMinterPDA;
    getMultisigConfigPDA: typeof getMultisigConfigPDA;
    getProposalPDA: typeof getProposalPDA;
    getMintAuthorityPDA: typeof getMintAuthorityPDA;
    getBurnAuthorityPDA: typeof getBurnAuthorityPDA;
    getFreezeAuthorityPDA: typeof getFreezeAuthorityPDA;
    getHookConfigPDA: typeof getHookConfigPDA;
    getBlacklistPDA: typeof getBlacklistPDA;
    getWhitelistPDA: typeof getWhitelistPDA;
    validateName: typeof validateName;
    validateSymbol: typeof validateSymbol;
    validateDecimals: typeof validateDecimals;
    validateBatch: typeof validateBatch;
    hasRole: typeof hasRole;
    decodeRoles: typeof decodeRoles;
    encodeRoles: typeof encodeRoles;
    hasFeature: typeof hasFeature;
    decodeFeatures: typeof decodeFeatures;
    isSSS2: typeof isSSS2;
    calculateFee: typeof calculateFee;
    wouldExceedQuota: typeof wouldExceedQuota;
    wouldExceedCap: typeof wouldExceedCap;
    formatAmount: typeof formatAmount;
    parseAmount: typeof parseAmount;
    formatWithSymbol: typeof formatWithSymbol;
    getTokenBalance: typeof getTokenBalance;
    accountExists: typeof accountExists;
    getAccountOwner: typeof getAccountOwner;
    extractError: typeof extractError;
    isAnchorError: typeof isAnchorError;
    isInsufficientFunds: typeof isInsufficientFunds;
    isSlippageError: typeof isSlippageError;
    sleep: typeof sleep;
    withRetry: typeof withRetry;
    formatTimestamp: typeof formatTimestamp;
    now: typeof now;
    timeUntilEpochReset: typeof timeUntilEpochReset;
};
export default _default;
//# sourceMappingURL=utils.d.ts.map