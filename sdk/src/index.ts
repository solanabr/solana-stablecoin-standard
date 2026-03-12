/**
 * @stbr/sss-token — Solana Stablecoin Standard SDK
 *
 * A modular SDK for creating and managing stablecoins on Solana
 * using the Token-2022 program with standardized presets.
 *
 * @example
 * ```typescript
 * import { SolanaStablecoin, Presets } from "@stbr/sss-token";
 *
 * const stable = await SolanaStablecoin.create(connection, {
 *   preset: Presets.SSS_2,
 *   name: "My Stablecoin",
 *   symbol: "MYUSD",
 *   decimals: 6,
 *   authority: adminKeypair,
 * });
 *
 * await stable.mint({ recipient, amount: 1_000_000n, minter });
 * ```
 *
 * @packageDocumentation
 */

export { SolanaStablecoin } from "./client";
export { Presets, SSS_1_CONFIG, SSS_2_CONFIG, SSS_3_CONFIG } from "./presets";
export type {
  StablecoinConfig,
  RoleManager,
  MinterEntry,
  BlacklistEntry,
  CreateParams,
  MintParams,
  BurnParams,
  ComplianceModule,
} from "./types";
export { SssError } from "./utils";
