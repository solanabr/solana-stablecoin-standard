/**
 * @module @stbr/sss-token
 *
 * TypeScript SDK for the Solana Stablecoin Standard.
 *
 * @example
 * ```typescript
 * import {
 *   SolanaStablecoin,
 *   Presets,
 *   deriveConfigPda,
 *   SssError,
 * } from "@stbr/sss-token";
 *
 * // Create a new SSS-2 compliant stablecoin
 * const client = await SolanaStablecoin.create(connection, wallet, {
 *   preset: "SSS_2",
 *   name: "BRL Stable",
 *   symbol: "BRLs",
 *   decimals: 6,
 * });
 *
 * // Mint tokens
 * await client.mint({
 *   recipient: userPubkey,
 *   amount: BigInt(1_000_000), // 1 BRLs
 * });
 *
 * // Check config
 * const config = await client.getConfig();
 * console.log(config.enablePermanentDelegate); // true (SSS-2)
 * ```
 */

// Client
export { SolanaStablecoin } from "./client";

// Types (all interfaces and enums)
export type {
  StablecoinConfig,
  RoleManager,
  MinterEntry,
  BlacklistEntry,
  CreateParams,
  MintParams,
  BurnParams,
  FreezeParams,
  ThawParams,
  UpdateMinterParams,
  UpdateRolesParams,
  BlacklistAddParams,
  ExtensionConfig,
  InitialRoles,
  ComplianceModule,
} from "./types";

// Presets
export { Presets, getPresetConfig } from "./presets";

// Constants & PDA helpers
export {
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  ORACLE_MODULE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  CONFIG_SEED,
  ROLES_SEED,
  BLACKLIST_SEED,
  deriveConfigPda,
  deriveRolesPda,
  deriveBlacklistPda,
  deriveAllPdas,
} from "./constants";

// Error utilities
export { SssError, SssErrorCode } from "./utils";
