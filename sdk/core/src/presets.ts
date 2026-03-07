import { PresetConfig, PRESET_SSS1, PRESET_SSS2 } from "./types";

export const Presets = {
  /**
   * SSS-1: Minimal Stablecoin
   * Mint authority + freeze authority + on-chain metadata.
   * Suitable for internal tokens, DAO treasuries, ecosystem settlement.
   * Compliance is reactive (freeze accounts as needed).
   */
  SSS_1: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    preset: PRESET_SSS1,
  } as PresetConfig & { preset: number; defaultAccountFrozen: boolean },

  /**
   * SSS-2: Compliant Stablecoin
   * SSS-1 + permanent delegate + transfer hook + blacklist enforcement.
   * Suitable for regulated stablecoins where regulators expect on-chain
   * blacklist enforcement and token seizure capabilities.
   */
  SSS_2: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    preset: PRESET_SSS2,
  } as PresetConfig & { preset: number; defaultAccountFrozen: boolean },
} as const;

export type PresetName = keyof typeof Presets;
