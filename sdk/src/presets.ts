import type { ExtensionConfig } from "./types";

export interface PresetConfig {
  standard: "sss1" | "sss2";
  name: string;
  symbol: string;
  decimals: number;
  uri: string;
  extensions: Required<ExtensionConfig>;
}

/**
 * Preset identifier enum.
 * Pass to CreateParams.preset to use a preset configuration.
 */
export enum Preset {
  SSS_1 = "SSS_1",
  SSS_2 = "SSS_2",
}

/** Preset configurations keyed by Preset enum value. */
export const PRESET_CONFIGS: Record<Preset, PresetConfig> = {
  [Preset.SSS_1]: {
    standard: "sss1",
    name: "SSS-1 Stablecoin",
    symbol: "SSS1",
    decimals: 6,
    uri: "https://example.com/metadata.json",
    extensions: {
      permanentDelegate: false,
      transferHook: false,
      defaultAccountFrozen: false,
    },
  },
  [Preset.SSS_2]: {
    standard: "sss2",
    name: "SSS-2 Stablecoin",
    symbol: "SSS2",
    decimals: 6,
    uri: "https://example.com/metadata.json",
    extensions: {
      permanentDelegate: true,
      transferHook: true,
      defaultAccountFrozen: true,
    },
  },
};

/**
 * Namespace re-export for ergonomic usage: `Presets.SSS_2`
 */
export const Presets = Preset;
