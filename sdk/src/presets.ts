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

export function getPresetAnchorEnum(preset: StablecoinPreset): { [key: string]: {} } {
  return PRESET_CONFIGS[preset].preset;
}
