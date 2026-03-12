import type { ExtensionConfig } from "./types";

/** Available stablecoin preset configurations */
export enum Presets {
  /** Minimal stablecoin: mint + freeze + metadata */
  SSS_1 = "SSS_1",
  /** Compliant stablecoin: SSS-1 + permanent delegate + transfer hook + blacklist */
  SSS_2 = "SSS_2",
  /** Private stablecoin: SSS-1 + confidential transfers (experimental) */
  SSS_3 = "SSS_3",
}

/** SSS-1: Minimal Stablecoin configuration */
export const SSS_1_CONFIG: ExtensionConfig = {
  permanentDelegate: false,
  transferHook: false,
  defaultAccountFrozen: false,
  confidentialTransfers: false,
};

/** SSS-2: Compliant Stablecoin configuration */
export const SSS_2_CONFIG: ExtensionConfig = {
  permanentDelegate: true,
  transferHook: true,
  defaultAccountFrozen: true,
  confidentialTransfers: false,
};

/** SSS-3: Private Stablecoin configuration (experimental) */
export const SSS_3_CONFIG: ExtensionConfig = {
  permanentDelegate: false,
  transferHook: false,
  defaultAccountFrozen: false,
  confidentialTransfers: true,
};

/** Get the extension config for a preset */
export function getPresetConfig(preset: Presets): ExtensionConfig {
  switch (preset) {
    case Presets.SSS_1:
      return { ...SSS_1_CONFIG };
    case Presets.SSS_2:
      return { ...SSS_2_CONFIG };
    case Presets.SSS_3:
      return { ...SSS_3_CONFIG };
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}
