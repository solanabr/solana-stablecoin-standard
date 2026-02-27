import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  Transaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// ============================================
// PROGRAM IDS - Updated!
// ============================================

/**
 * SSS Token program ID
 * @default "b3AxhgSuNvjsv2F4XmuXYJbBCRcTT1XPXQvRe77NbrK"
 */
export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "b3AxhgSuNvjsv2F4XmuXYJbBCRcTT1XPXQvRe77NbrK"
);

/**
 * SSS Transfer Hook program ID
 * @default "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx"
 */
export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx"
);

// ============================================
// ROLE CONSTANTS
// ============================================

/** Full control - can do everything */
export const ROLE_MASTER = 1;

/** Can mint tokens */
export const ROLE_MINTER = 2;

/** Can burn tokens */
export const ROLE_BURNER = 4;

/** Can freeze/thaw accounts and pause contract */
export const ROLE_PAUSER = 8;

/** Can add/remove from blacklist (SSS-2) */
export const ROLE_BLACKLISTER = 16;

/** Can seize tokens (SSS-2) */
export const ROLE_SEIZER = 32;

/** Human-readable role names */
export const ROLE_NAMES: Record<number, string> = {
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
export const FEATURE_TRANSFER_HOOK = 1;

/** Permanent delegate enabled (bit 1) */
export const FEATURE_PERMANENT_DELEGATE = 2;

/** Mint close authority enabled (bit 2) */
export const FEATURE_MINT_CLOSE_AUTHORITY = 4;

/** Default account state enabled (bit 3) */
export const FEATURE_DEFAULT_ACCOUNT_STATE = 8;

// ============================================
// STATE TYPES
// ============================================

/** Stablecoin state account structure */
export interface StablecoinState {
  /** Master authority */
  authority: PublicKey;

  /** Token mint address */
  mint: PublicKey;

  /** Token name (max 32 chars) */
  name: string;

  /** Token symbol (max 10 chars) */
  symbol: string;

  /** Token decimals (0-9) */
  decimals: number;

  /** Current total supply */
  totalSupply: BN;

  /** Emergency pause state */
  isPaused: boolean;

  /** Feature flags bitmask */
  features: number;

  /** Maximum supply (0 = unlimited) */
  supplyCap: BN;

  /** Per-epoch mint limit (0 = unlimited) */
  epochQuota: BN;

  /** Amount minted this epoch */
  currentEpochMinted: BN;

  /** Epoch start timestamp */
  currentEpochStart: BN;

  /** PDA bump */
  bump: number;
}

/** Role account structure */
export interface RoleAccount {
  /** Role holder address */
  owner: PublicKey;

  /** Bitmask of assigned roles */
  roles: number;

  /** Associated stablecoin */
  stablecoin: PublicKey;

  /** PDA bump */
  bump: number;
}

/** Minter quota tracking */
export interface MinterInfo {
  /** Minter address */
  minter: PublicKey;

  /** Max mint amount allowed */
  quota: BN;

  /** Already minted amount */
  minted: BN;

  /** Associated stablecoin */
  stablecoin: PublicKey;

  /** PDA bump */
  bump: number;
}

/** Multisig configuration */
export interface MultisigConfig {
  /** Associated stablecoin */
  stablecoin: PublicKey;

  /** Required approvals */
  threshold: number;

  /** Authorized signers */
  signers: PublicKey[];

  /** PDA bump */
  bump: number;
}

/** Multisig proposal */
export interface MultisigProposal {
  /** Associated config PDA */
  config: PublicKey;

  /** Proposal creator */
  proposer: PublicKey;

  /** Serialized instruction data */
  instructionData: Buffer;

  /** Approvals so far */
  approvals: PublicKey[];

  /** Whether executed */
  executed: boolean;

  /** Creation timestamp */
  createdAt: BN;

  /** Expiration timestamp */
  expiresAt: BN;

  /** PDA bump */
  bump: number;
}

// ============================================
// SDK RESULT TYPE
// ============================================

/** Standard SDK result wrapper */
export interface SDKResult<T = any> {
  /** Operation success */
  success: boolean;

  /** Transaction signature (if applicable) */
  signature?: string;

  /** Returned data */
  data?: T;

  /** Error message (if failed) */
  error?: string;
}

// ============================================
// EVENT TYPES
// ============================================

/** Emitted when stablecoin initialized */
export interface StablecoinInitialized {
  mint: PublicKey;
  authority: PublicKey;
  name: string;
  symbol: string;
  timestamp: BN;
}

/** Emitted when tokens minted */
export interface TokensMinted {
  minter: PublicKey;
  recipient: PublicKey;
  amount: BN;
  timestamp: BN;
}

/** Emitted when tokens burned */
export interface TokensBurned {
  burner: PublicKey;
  owner: PublicKey;
  amount: BN;
  timestamp: BN;
}

/** Emitted when account frozen */
export interface AccountFrozen {
  pauser: PublicKey;
  account: PublicKey;
  timestamp: BN;
}

/** Emitted when account thawed */
export interface AccountThawed {
  pauser: PublicKey;
  account: PublicKey;
  timestamp: BN;
}

/** Emitted when contract paused */
export interface StablecoinPaused {
  pauser: PublicKey;
  timestamp: BN;
}

/** Emitted when contract unpaused */
export interface StablecoinUnpaused {
  pauser: PublicKey;
  timestamp: BN;
}

/** Emitted when roles updated */
export interface RolesUpdated {
  authority: PublicKey;
  target: PublicKey;
  newRoles: number;
  timestamp: BN;
}

/** Emitted when minter quota updated */
export interface MinterQuotaUpdated {
  authority: PublicKey;
  minter: PublicKey;
  newQuota: BN;
  timestamp: BN;
}

/** Emitted when authority transferred */
export interface AuthorityTransferred {
  previousAuthority: PublicKey;
  newAuthority: PublicKey;
  timestamp: BN;
}

/** Batch mint event */
export interface BatchMinted {
  minter: PublicKey;
  recipients: number;
  totalAmount: BN;
  timestamp: BN;
}

/** Multisig proposal created */
export interface MultisigProposalCreated {
  proposal: PublicKey;
  proposer: PublicKey;
  timestamp: BN;
}

/** Multisig proposal approved */
export interface MultisigProposalApproved {
  proposal: PublicKey;
  approver: PublicKey;
  approvals: number;
  threshold: number;
  timestamp: BN;
}

/** Multisig proposal executed */
export interface MultisigProposalExecuted {
  proposal: PublicKey;
  executor: PublicKey;
  timestamp: BN;
}

// ============================================
// SSS-1 TYPES (MINIMAL)
// ============================================

/** Basic stablecoin info */
export interface StablecoinInfo {
  mint: PublicKey;
  authority: PublicKey;
  totalSupply: BN;
  isPaused: boolean;
  decimals: number;
  name: string;
  symbol: string;
  nameLength: number;
  symbolLength: number;
}

/** SSS-1 initialization params */
export interface SSS1InitializeParams {
  name: string;
  symbol: string;
  decimals: number;
}

// ============================================
// SSS-2 TYPES (COMPLIANT)
// ============================================

/** SSS-2 hook configuration */
export interface SSS2HookConfig {
  stablecoin: PublicKey;
  authority: PublicKey;
  transferFeeBasisPoints: number;
  maxTransferFee: BN;
  minTransferAmount: BN;
  totalFeesCollected: BN;
  isPaused: boolean;
  blacklistEnabled: boolean;
  permanentDelegate: PublicKey | null;
  bump: number;
}

/** Blacklist entry */
export interface BlacklistEntry {
  address: PublicKey;
  reason: string;
  blacklistedBy: PublicKey;
  createdAt: BN;
  isActive: boolean;
  bump: number;
}

/** Whitelist entry */
export interface WhitelistEntry {
  address: PublicKey;
  whitelistType: WhitelistType;
  addedBy: PublicKey;
  createdAt: BN;
  bump: number;
}

/** Whitelist type */
export enum WhitelistType {
  FeeExempt = "fee_exempt",
  FullBypass = "full_bypass",
}

/** Fee calculation result */
export interface FeeCalculation {
  fee: BN;
  netAmount: BN;
  rateBps: number;
}

/** Transfer execution event (SSS-2) */
export interface TransferExecuted {
  source: PublicKey;
  destination: PublicKey;
  amount: BN;
  fee: BN;
  netAmount: BN;
  isWhitelisted: boolean;
  isDelegate: boolean;
  timestamp: BN;
}

/** Tokens seized event */
export interface TokensSeized {
  from: PublicKey;
  to: PublicKey;
  amount: BN;
  seizedBy: PublicKey;
  reason: string;
  timestamp: BN;
}

/** Blacklist added/removed event */
export interface BlacklistAdded {
  address: PublicKey;
  reason: string;
  blacklistedBy: PublicKey;
  timestamp: BN;
}

export interface BlacklistRemoved {
  address: PublicKey;
  removedBy: PublicKey;
  timestamp: BN;
}

/** Config updated event */
export interface ConfigUpdated {
  authority: PublicKey;
  field: string;
  value: string;
  timestamp: BN;
}

/** Batch blacklist event */
export interface BatchBlacklistAdded {
  authority: PublicKey;
  count: number;
  timestamp: BN;
}

/** SSS-2 initialization params */
export interface SSS2InitializeParams {
  name: string;
  symbol: string;
  decimals: number;
  enableTransferHook: boolean;
  enablePermanentDelegate: boolean;
}

// ============================================
// ERROR CODES (for SDK error handling)
// ============================================

/** Error codes from SSS Token program */
export enum StablecoinError {
  Unauthorized = 6000,
  ContractPaused = 6001,
  InvalidAmount = 6002,
  QuotaExceeded = 6003,
  RoleAlreadyAssigned = 6004,
  MathOverflow = 6005,
  InvalidAuthority = 6006,
  ComplianceNotEnabled = 6007,
  AlreadyInitialized = 6008,
  InsufficientBalance = 6009,
  SupplyCapExceeded = 6010,
  EpochQuotaExceeded = 6011,
}

/** Error codes from Transfer Hook program */
export enum TransferHookError {
  HookPaused = 8000,
  SourceBlacklisted = 8001,
  DestinationBlacklisted = 8002,
  AmountTooLow = 8003,
  InvalidAuthority = 8004,
  AlreadyBlacklisted = 8005,
  BlacklistNotFound = 8006,
  AlreadyWhitelisted = 8007,
  ComplianceNotEnabled = 8008,
  InvalidInstruction = 8009,
  MathOverflow = 8010,
  SelfSeizure = 8011,
}

/** Decode error code to message */
export function decodeError(code: number): string {
  const errors: Record<number, string> = {
    [StablecoinError.Unauthorized]:
      "Unauthorized: Insufficient role permissions",
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
    [TransferHookError.DestinationBlacklisted]:
      "Destination address blacklisted",
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
export function calculateFee(
  amount: BN,
  feeBps: number,
  maxFee: BN,
  minAmount: BN
): FeeCalculation {
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
export function hasRole(roles: number, role: number): boolean {
  return (roles & role) !== 0;
}

/**
 * Get feature string representation
 */
export function getFeatureString(feature: number): string {
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
export function formatAmount(amount: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = amount.div(divisor);
  const fraction = amount.mod(divisor);
  return `${whole}.${fraction.toString().padStart(decimals, "0")}`;
}

/**
 * Parse human-readable amount to BN
 */
export function parseAmount(amount: string, decimals: number): BN {
  const [whole, frac = ""] = amount.split(".");
  const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
  const wholeBN = new BN(whole || "0");
  const fractionBN = new BN(fraction);
  const divisor = new BN(10).pow(new BN(decimals));
  return wholeBN.mul(divisor).add(fractionBN);
}

// ============================================
// SSS-3 CONFIDENTIAL TRANSFER TYPES
// ============================================

/**
 * Confidential account state
 * Stores encrypted balances using ElGamal encryption
 */
export interface ConfidentialAccount {
  owner: PublicKey;
  mint: PublicKey;
  pendingBalance: Buffer; // Encrypted
  availableBalance: Buffer; // Encrypted
  allowTimestamps: BN;
  bump: number;
}

/**
 * Allowlist entry for confidential transfers
 */
export interface AllowlistEntry {
  address: PublicKey;
  stablecoin: PublicKey;
  reason: string;
  isActive: boolean;
  createdAt: number;
  expiry?: BN;
}

/**
 * Range proof for zero-knowledge verification
 * Uses Bulletproofs (672 bytes standard)
 */
export interface RangeProof {
  proof: Buffer; // 672 bytes
  commitment: Buffer; // 32 bytes
}

/**
 * ElGamal public key for encryption
 */
export interface ElGamalPubkey {
  publicKey: Buffer; // 32 bytes
  commitment: Buffer; // 32 bytes
}

/**
 * Confidential transfer configuration
 */
export interface ConfidentialityConfig {
  stablecoin: PublicKey;
  enabled: boolean;
  requireAllowlist: boolean;
  maxBalance: BN;
  auditor: PublicKey | null;
  verifier: PublicKey;
}

/**
 * ElGamal registry entry
 */
export interface ElGamalRegistry {
  owner: PublicKey;
  mint: PublicKey;
  publicKey: Buffer;
  bump: number;
}

/**
 * SSS-3 Feature flags
 */
export const FEATURE_CONFIDENTIAL_TRANSFERS = 16;
export const FEATURE_AUDITOR = 32;
export const FEATURE_ALLOWLIST_REQUIRED = 64;

/**
 * Check if stablecoin has SSS-3 features
 */
export function isSSS3(features: number): boolean {
  return (features & FEATURE_CONFIDENTIAL_TRANSFERS) !== 0;
}
