/**
 * SDK Utilities for SSS Token
 *
 * Helper functions for common operations
 */

import { PublicKey, Connection, Commitment } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  StablecoinState,
  FeeCalculation,
  ROLE_MASTER,
  ROLE_MINTER,
  ROLE_BURNER,
  ROLE_PAUSER,
  ROLE_BLACKLISTER,
  ROLE_SEIZER,
} from "./types";

// ============================================
// PDA HELPERS
// ============================================

/**
 * Get stablecoin PDA (state account)
 */
export function getStablecoinPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get mint PDA
 */
export function getMintPDA(stablecoin: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint"), stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get role PDA
 */
export function getRolePDA(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), owner.toBuffer(), mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get minter info PDA
 */
export function getMinterPDA(minter: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), minter.toBuffer(), mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get multisig config PDA
 */
export function getMultisigConfigPDA(stablecoin: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("multisig"), stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get proposal PDA
 */
export function getProposalPDA(
  multisigConfig: PublicKey,
  proposer: PublicKey,
  timestamp: BN
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("proposal"),
      multisigConfig.toBuffer(),
      proposer.toBuffer(),
      timestamp.toArrayLike(Buffer, "le", 8),
    ],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get mint authority PDA
 */
export function getMintAuthorityPDA(stablecoin: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get burn authority PDA
 */
export function getBurnAuthorityPDA(stablecoin: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("burn_authority"), stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

/**
 * Get freeze authority PDA
 */
export function getFreezeAuthorityPDA(stablecoin: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("freeze_authority"), stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  )[0];
}

// ============================================
// SSS-2 PDA HELPERS
// ============================================

/**
 * Get hook config PDA
 */
export function getHookConfigPDA(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hook_config"), mint.toBuffer()],
    SSS_TRANSFER_HOOK_PROGRAM_ID
  )[0];
}

/**
 * Get blacklist entry PDA
 */
export function getBlacklistPDA(
  config: PublicKey,
  address: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), config.toBuffer(), address.toBuffer()],
    SSS_TRANSFER_HOOK_PROGRAM_ID
  )[0];
}

/**
 * Get whitelist entry PDA
 */
export function getWhitelistPDA(
  config: PublicKey,
  address: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("whitelist"), config.toBuffer(), address.toBuffer()],
    SSS_TRANSFER_HOOK_PROGRAM_ID
  )[0];
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate token name
 * @returns true if valid
 */
export function validateName(name: string): { valid: boolean; error?: string } {
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
      error:
        "Name can only contain letters, numbers, spaces, hyphens and underscores",
    };
  }
  return { valid: true };
}

/**
 * Validate token symbol
 */
export function validateSymbol(symbol: string): {
  valid: boolean;
  error?: string;
} {
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
export function validateDecimals(decimals: number): {
  valid: boolean;
  error?: string;
} {
  if (decimals < 0 || decimals > 9) {
    return { valid: false, error: "Decimals must be between 0 and 9" };
  }
  return { valid: true };
}

/**
 * Validate batch parameters
 */
export function validateBatch(
  recipients: PublicKey[],
  amounts: BN[]
): { valid: boolean; error?: string } {
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
    if (amounts[i].lte(new BN(0))) {
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
export function hasRole(roles: number, role: number): boolean {
  return (roles & role) !== 0;
}

/**
 * Decode roles bitmask to human-readable names
 */
export function decodeRoles(roles: number): string[] {
  const roleNames: string[] = [];
  if (hasRole(roles, ROLE_MASTER)) roleNames.push("MASTER");
  if (hasRole(roles, ROLE_MINTER)) roleNames.push("MINTER");
  if (hasRole(roles, ROLE_BURNER)) roleNames.push("BURNER");
  if (hasRole(roles, ROLE_PAUSER)) roleNames.push("PAUSER");
  if (hasRole(roles, ROLE_BLACKLISTER)) roleNames.push("BLACKLISTER");
  if (hasRole(roles, ROLE_SEIZER)) roleNames.push("SEIZER");
  return roleNames;
}

/**
 * Encode role names to bitmask
 */
export function encodeRoles(roleNames: string[]): number {
  let roles = 0;
  const roleMap: Record<string, number> = {
    MASTER: ROLE_MASTER,
    MINTER: ROLE_MINTER,
    BURNER: ROLE_BURNER,
    PAUSER: ROLE_PAUSER,
    BLACKLISTER: ROLE_BLACKLISTER,
    SEIZER: ROLE_SEIZER,
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
export function hasFeature(features: number, feature: number): boolean {
  return (features & feature) !== 0;
}

/**
 * Decode features bitmask
 */
export function decodeFeatures(features: number): string[] {
  const featureNames: string[] = [];
  if (hasFeature(features, 1)) featureNames.push("TRANSFER_HOOK");
  if (hasFeature(features, 2)) featureNames.push("PERMANENT_DELEGATE");
  if (hasFeature(features, 4)) featureNames.push("MINT_CLOSE_AUTHORITY");
  if (hasFeature(features, 8)) featureNames.push("DEFAULT_ACCOUNT_STATE");
  return featureNames;
}

/**
 * Check if stablecoin is SSS-2 (has compliance features)
 */
export function isSSS2(features: number): boolean {
  return hasFeature(features, 1) || hasFeature(features, 2);
}

// ============================================
// CALCULATION HELPERS
// ============================================

/**
 * Calculate transfer fee
 */
export function calculateFee(
  amount: BN,
  feeBps: number,
  maxFee: BN,
  minAmount: BN
): FeeCalculation {
  // Check minimum amount
  if (amount.lt(minAmount)) {
    throw new Error(
      `Amount ${amount.toString()} below minimum ${minAmount.toString()}`
    );
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
export function wouldExceedQuota(current: BN, quota: BN, amount: BN): boolean {
  return current.add(amount).gt(quota);
}

/**
 * Check if mint amount would exceed supply cap
 */
export function wouldExceedCap(
  currentSupply: BN,
  cap: BN,
  amount: BN
): boolean {
  if (cap.eq(new BN(0))) return false; // 0 = unlimited
  return currentSupply.add(amount).gt(cap);
}

// ============================================
// AMOUNT FORMATTING
// ============================================

/**
 * Format amount with decimals for display
 * @example formatAmount(new BN(1000000), 6) // "1.000000"
 */
export function formatAmount(amount: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
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
export function parseAmount(amount: string, decimals: number): BN {
  const [whole, frac = ""] = amount.split(".");
  const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
  const wholeBN = new BN(whole || "0");
  const fractionBN = new BN(fraction);
  const divisor = new BN(10).pow(new BN(decimals));
  return wholeBN.mul(divisor).add(fractionBN);
}

/**
 * Format amount with symbol
 * @example formatWithSymbol(new BN(1000000), 6, 'USDC') // "1.00 USDC"
 */
export function formatWithSymbol(
  amount: BN,
  decimals: number,
  symbol: string,
  precision: number = 2
): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = amount.div(divisor);
  const fraction = amount.mod(divisor);

  // Convert fraction to percentage with specified precision
  const precisionMultiplier = new BN(10).pow(new BN(decimals - precision));
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
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<BN> {
  const account = await connection.getTokenAccountBalance(tokenAccount);
  return new BN(account.value.amount);
}

/**
 * Check if account exists
 */
export async function accountExists(
  connection: Connection,
  account: PublicKey
): Promise<boolean> {
  const balance = await connection.getBalance(account);
  return balance > 0;
}

/**
 * Get account owner
 */
export async function getAccountOwner(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<PublicKey | null> {
  try {
    const account = await connection.getParsedAccountInfo(tokenAccount);
    const data = account.value?.data as any;
    return data?.parsed?.info?.owner
      ? new PublicKey(data.parsed.info.owner)
      : null;
  } catch {
    return null;
  }
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Extract error message from transaction result
 */
export function extractError(error: any): string {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  if (error?.toString) return error.toString();
  return "Unknown error";
}

/**
 * Check if error is a specific Anchor error
 */
export function isAnchorError(error: any, errorCode: number): boolean {
  const errorStr = error?.toString() || "";
  return (
    errorStr.includes(`0x${errorCode.toString(16).padStart(4, "0")}`) ||
    errorStr.includes(`custom program error: ${errorCode}`)
  );
}

/**
 * Check if transaction failed due to insufficient funds
 */
export function isInsufficientFunds(error: any): boolean {
  const errorStr = extractError(error).toLowerCase();
  return (
    errorStr.includes("insufficient funds") ||
    errorStr.includes("insufficient lamports")
  );
}

/**
 * Check if transaction failed due to slippage (for swaps)
 */
export function isSlippageError(error: any): boolean {
  const errorStr = extractError(error).toLowerCase();
  return (
    errorStr.includes("slippage") ||
    errorStr.includes("exceeds desired slippage")
  );
}

// ============================================
// SLEEP/RETRY
// ============================================

/**
 * Sleep for milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
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
export function formatTimestamp(timestamp: BN): string {
  return new Date(timestamp.toNumber() * 1000).toISOString();
}

/**
 * Get current timestamp as BN
 */
export function now(): BN {
  return new BN(Math.floor(Date.now() / 1000));
}

/**
 * Calculate time until epoch reset
 */
export function timeUntilEpochReset(
  epochStart: BN,
  epochDurationSeconds: number = 86400
): number {
  const current = now().toNumber();
  const start = epochStart.toNumber();
  const elapsed = current - start;
  const remaining = epochDurationSeconds - elapsed;
  return Math.max(0, remaining);
}

// ============================================
// EXPORTS
// ============================================

export default {
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
