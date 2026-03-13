import { PublicKey } from "@solana/web3.js";

/** Branded type for stablecoin token amounts (smallest unit, e.g. 6 decimals). Use for mint/burn/transfer. */
export type StablecoinAmount = bigint;

/** Coerce a bigint to StablecoinAmount (for explicit amount typing at API boundaries). */
export function toStablecoinAmount(n: bigint): StablecoinAmount {
  return n;
}

/** Role names aligned with program RBAC. */
export type RoleName =
  | "minter"
  | "burner"
  | "pauser"
  | "freezer"
  | "blacklister"
  | "seizer";

export interface StablecoinExtensions {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

export const Presets = {
  SSS_1: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  } as StablecoinExtensions,

  SSS_2: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
  } as StablecoinExtensions,
} as const;

export type PresetName = keyof typeof Presets;

/** Preset config: name + extensions. Use for preset vs custom in type system. */
export interface PresetConfig {
  name: PresetName;
  extensions: StablecoinExtensions;
}

export const PRESET_CONFIGS: Record<PresetName, PresetConfig> = {
  SSS_1: { name: "SSS_1", extensions: Presets.SSS_1 },
  SSS_2: { name: "SSS_2", extensions: Presets.SSS_2 },
} as const;

export interface CreateStablecoinParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset?: PresetName;
  extensions?: Partial<StablecoinExtensions>;
}

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enable_permanent_delegate: boolean;
  enable_transfer_hook: boolean;
  default_account_frozen: boolean;
}

export interface RoleFlags {
  isMinter: boolean;
  isBurner: boolean;
  isPauser: boolean;
  isFreezer: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
}

export interface StablecoinStateType {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enable_permanent_delegate: boolean;
  enable_transfer_hook: boolean;
  default_account_frozen: boolean;
  paused: boolean;
  total_minted: bigint;
  total_burned: bigint;
  bump: number;
}

export interface RoleAccount {
  stablecoin: PublicKey;
  holder: PublicKey;
  roles: RoleFlags;
  bump: number;
}

export interface MinterInfo {
  stablecoin: PublicKey;
  minter: PublicKey;
  quota: bigint;
  minted_amount: bigint;
  bump: number;
}

export interface MintParams {
  recipient: PublicKey;
  amount: StablecoinAmount;
  minter: PublicKey;
}

export interface BurnParams {
  amount: StablecoinAmount;
}

export interface UpdateRolesParams {
  holder: PublicKey;
  roles: RoleFlags;
}

export interface UpdateMinterParams {
  minter: PublicKey;
  quota: bigint;
}

export function normalizeInitializeParams(
  params: CreateStablecoinParams
): InitializeParams {
  let ext: StablecoinExtensions;
  if (params.preset === "SSS_1" || params.preset === "SSS_2") {
    ext = Presets[params.preset];
  } else if (params.extensions) {
    ext = {
      enablePermanentDelegate: params.extensions.enablePermanentDelegate ?? false,
      enableTransferHook: params.extensions.enableTransferHook ?? false,
      defaultAccountFrozen: params.extensions.defaultAccountFrozen ?? false,
    };
  } else {
    ext = Presets.SSS_1;
  }
  return {
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    decimals: params.decimals,
    enable_permanent_delegate: ext.enablePermanentDelegate,
    enable_transfer_hook: ext.enableTransferHook,
    default_account_frozen: ext.defaultAccountFrozen,
  };
}
