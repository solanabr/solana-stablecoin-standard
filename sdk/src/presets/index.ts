import { PublicKey } from "@solana/web3.js";

export enum Preset {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
  CUSTOM = "custom",
}

export interface StablecoinConfig {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  transferHookProgramId?: PublicKey;
}

export const SSS1_CONFIG: Partial<StablecoinConfig> = {
  decimals: 6,
  enablePermanentDelegate: false,
  enableTransferHook: false,
  defaultAccountFrozen: false,
};

export const SSS2_CONFIG: Partial<StablecoinConfig> = {
  decimals: 6,
  enablePermanentDelegate: true,
  enableTransferHook: true,
  defaultAccountFrozen: false,
};

export function resolvePreset(
  preset: Preset,
  overrides: Partial<StablecoinConfig> = {}
): Partial<StablecoinConfig> {
  switch (preset) {
    case Preset.SSS_1:
      return { ...SSS1_CONFIG, ...overrides };
    case Preset.SSS_2:
      return { ...SSS2_CONFIG, ...overrides };
    case Preset.CUSTOM:
      return overrides;
  }
}

// Alias for ergonomic API
export const Presets = Preset;