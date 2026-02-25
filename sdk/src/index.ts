/**
 * @stbr/sss-sdk — TypeScript SDK for the Solana Stablecoin Standard
 *
 * Entry point re-exports everything a consumer needs.
 */

// Main class
export { SolanaStablecoin } from "./stablecoin.js";

// Compliance module (SSS-2 only)
export { ComplianceModule } from "./compliance.js";

// TypeScript interfaces
export type { CreateConfig, StablecoinInfo, MintParams, BurnParams, MinterInfoEntry } from "./types.js";

// Preset configurations
export { SSS_1, SSS_2, SSS_TOKEN_PROGRAM_ID, HOOK_PROGRAM_ID } from "./presets.js";

// PDA derivation helpers
export {
  deriveStablecoinConfig,
  deriveRoleManager,
  deriveMinterInfo,
  deriveBlacklistEntry,
  deriveExtraAccountMetaList,
} from "./pda.js";
