/**
 * @module @stbr/sss-token
 *
 * TypeScript SDK for the Solana Stablecoin Standard.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { SolanaStablecoin, Presets } from "@stbr/sss-token";
 *
 * // Create a new SSS-2 compliant stablecoin
 * const stable = await SolanaStablecoin.create(connection, wallet, {
 *   preset: Presets.SSS_2,
 *   name: "BRL Stable",
 *   symbol: "BRLs",
 *   decimals: 6,
 * });
 *
 * // Mint tokens
 * await stable.mint({ recipient: userPubkey, amount: BigInt(1_000_000) });
 *
 * // Compliance (SSS-2)
 * await stable.compliance.blacklistAdd(suspectAddress, "Sanctions match");
 * await stable.compliance.seize(frozenAccount, treasury);
 *
 * // Query
 * const config = await stable.getConfig();
 * const supply = await stable.getTotalSupply();
 * ```
 *
 * ## Architecture
 *
 * The SDK provides three levels of abstraction:
 * 1. **Client class** (`SolanaStablecoin`) — high-level, auto-sends transactions
 * 2. **Account fetchers** (`fetchStablecoinConfig`, `fetchRoleManager`) — standalone queries
 * 3. **Constants & PDA helpers** (`deriveConfigPda`, `deriveBlacklistPda`) — pure functions
 */

// ── Client ────────────────────────────────────────────────────────────
export { SolanaStablecoin } from "./client";

// ── Compliance Module ─────────────────────────────────────────────────
export { ComplianceManager } from "./compliance";

// ── Account Fetchers ──────────────────────────────────────────────────
export {
  fetchStablecoinConfig,
  fetchRoleManager,
  fetchBlacklistEntry,
  deserializeStablecoinConfig,
  deserializeRoleManager,
  deserializeBlacklistEntry,
} from "./accounts";

// ── Types ─────────────────────────────────────────────────────────────
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

// ── Presets ───────────────────────────────────────────────────────────
export { Presets, getPresetConfig } from "./presets";

// ── Constants & PDA Helpers ───────────────────────────────────────────
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

// ── Error Utilities ───────────────────────────────────────────────────
export { SssError, SssErrorCode } from "./utils";
