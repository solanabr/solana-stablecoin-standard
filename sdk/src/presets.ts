import { StablecoinPreset } from "./types";

export interface PresetConfig {
  preset: { [K in StablecoinPreset]?: {} };
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
}

export const PRESET_CONFIGS: Record<StablecoinPreset, PresetConfig> = {
  [StablecoinPreset.SSS1]: {
    preset: { sss1: {} },
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enableConfidentialTransfers: false,
  },
  [StablecoinPreset.SSS2]: {
    preset: { sss2: {} },
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    enableConfidentialTransfers: false,
  },
  [StablecoinPreset.SSS3]: {
    preset: { sss3: {} },
    enablePermanentDelegate: true,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enableConfidentialTransfers: true,
  },
  [StablecoinPreset.Custom]: {
    preset: { custom: {} },
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enableConfidentialTransfers: false,
  },
};

export interface CustomFeatureFlags {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  enableDefaultStateFrozen: boolean;
  enableConfidentialTransfers: boolean;
}

export function buildInitializeParams(
  name: string,
  symbol: string,
  uri: string,
  decimals: number,
  preset: StablecoinPreset,
  customFlags?: CustomFeatureFlags
): import("./types").InitializeParams {
  const presetEnum = PRESET_CONFIGS[preset].preset;
  if (preset === StablecoinPreset.Custom) {
    const flags = customFlags ?? {
      enablePermanentDelegate: false,
      enableTransferHook: false,
      enableDefaultStateFrozen: false,
      enableConfidentialTransfers: false,
    };
    return {
      name, symbol, uri, decimals,
      preset: presetEnum,
      enablePermanentDelegate: flags.enablePermanentDelegate,
      enableTransferHook: flags.enableTransferHook,
      enableDefaultStateFrozen: flags.enableDefaultStateFrozen,
      enableConfidentialTransfers: flags.enableConfidentialTransfers,
    };
  }
  return {
    name, symbol, uri, decimals,
    preset: presetEnum,
    enablePermanentDelegate: null,
    enableTransferHook: null,
    enableDefaultStateFrozen: null,
    enableConfidentialTransfers: null,
  };
}

export function getPresetAnchorEnum(preset: StablecoinPreset): { [key: string]: {} } {
  return PRESET_CONFIGS[preset].preset;
}
