import type { PublicKey, Keypair } from "@solana/web3.js";
import type { Preset } from "./presets";

export interface ExtensionConfig {
  permanentDelegate?: boolean;
  transferHook?: boolean;
  defaultAccountFrozen?: boolean;
}

/**
 * Params for creating a stablecoin using a preset.
 * Name, symbol, decimals, and uri default to the preset values but can be overridden.
 */
export interface PresetCreateParams {
  preset: Preset;
  name?: string;
  symbol?: string;
  decimals?: number;
  uri?: string;
  /** The admin / authority keypair (payer, master, initial minter). Defaults to provider wallet. */
  authority: Keypair;
  /** Override the initial minter pubkey. Defaults to authority. */
  minter?: PublicKey;
  /** Initial minting allowance in base units. Default: 1_000_000_000_000. */
  initialAllowance?: bigint;
  /** Provide a specific mint keypair for deterministic addresses. Defaults to a new random keypair. */
  mintKeypair?: Keypair;
}

/**
 * Params for creating a fully custom stablecoin without a preset.
 */
export interface CustomCreateParams {
  preset?: undefined;
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  extensions?: ExtensionConfig;
  authority: Keypair;
  minter?: PublicKey;
  initialAllowance?: bigint;
  mintKeypair?: Keypair;
}

export type CreateParams = PresetCreateParams | CustomCreateParams;

export interface MintParams {
  recipient: PublicKey;
  amount: bigint | number;
  /** The minter keypair that has a MinterAccount PDA. Defaults to the provider wallet. */
  minter?: Keypair;
}

export interface BurnParams {
  from: PublicKey;
  amount: bigint | number;
  /** The burner keypair that has a burner RoleAccount PDA. Defaults to the provider wallet. */
  burner?: Keypair;
}

export interface UpdateMinterParams {
  operation: "add" | "remove";
  minter: PublicKey;
  /** Required when adding. */
  allowance?: bigint | number;
  /** The master keypair. Defaults to the provider wallet. */
  master?: Keypair;
}

export interface UpdateRoleEntry {
  role: "master" | "minter" | "burner" | "pauser" | "blacklister" | "seizer";
  oldKey?: PublicKey;
  newKey: PublicKey;
  allowance?: bigint | number;
}

export interface StablecoinConfigData {
  bump: number;
  standard: { sss1: Record<string, never> } | { sss2: Record<string, never> };
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}
