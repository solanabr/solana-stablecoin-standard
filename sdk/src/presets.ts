import { PresetConfig, PresetType } from './types';

export const PRESETS: Record<PresetType, PresetConfig> = {
  SSS_1: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enablePrivacy: false,
  },
  SSS_2: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    enablePrivacy: false,
  },
  SSS_3: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enablePrivacy: true,
  },
  custom: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enablePrivacy: false,
  },
};

export function getPreset(presetType: PresetType): PresetConfig {
  return PRESETS[presetType];
}

export function isValidPreset(presetType: string): presetType is PresetType {
  return presetType in PRESETS;
}
