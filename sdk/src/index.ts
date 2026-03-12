// High-level facade (bounty-specified API)
export { SolanaStablecoin, Presets, ComplianceModule } from "./stablecoin";
export type { CreateStablecoinOptions } from "./stablecoin";

// Clients
export { StablecoinClient } from "./client";
export { ComplianceClient } from "./compliance";

// Transaction builder
export { TransactionBuilder } from "./builder";

// Constants
export {
  CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  MINTER_SEED,
  HOOK_CONFIG_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  PRESET_MINIMAL,
  PRESET_COMPLIANT,
  PRESET_CONFIDENTIAL,
  ALLOWLIST_SEED,
  TOKEN_2022_PROGRAM_ID,
} from "./constants";

// PDA helpers
export {
  findConfigPda,
  findMintAuthorityPda,
  findMinterStatePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
  findAllowlistEntryPda,
} from "./pda";

// Types and interfaces
export type {
  StablecoinConfig,
  MinterState,
  HookConfig,
  BlacklistEntry,
  AllowlistEntry,
  InitializeParams,
  InitializeResult,
} from "./types";

export { RoleType } from "./types";

// Validation (Zod schemas + helpers)
export {
  CreateStablecoinOptionsSchema,
  InitializeParamsSchema,
  validateCreateOptions,
  validateInitializeParams,
} from "./validation";
