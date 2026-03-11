import { Presets } from "./types";

export interface PresetConfig {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  enableConfidentialTransfers: boolean;
  defaultAccountFrozen: boolean;
  requiresBlacklister: boolean;
  requiresTransferHookProgram: boolean;
}

export const PRESET_CONFIGS: Record<Presets, PresetConfig> = {
  [Presets.SSS_1]: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    enableConfidentialTransfers: false,
    defaultAccountFrozen: false,
    requiresBlacklister: false,
    requiresTransferHookProgram: false,
  },
  [Presets.SSS_2]: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    enableConfidentialTransfers: false,
    defaultAccountFrozen: false,
    requiresBlacklister: true,
    requiresTransferHookProgram: true,
  },
  [Presets.SSS_3]: {
    enablePermanentDelegate: true,
    enableTransferHook: false,
    enableConfidentialTransfers: true,
    defaultAccountFrozen: false,
    requiresBlacklister: false,
    requiresTransferHookProgram: false,
  },
  [Presets.Custom]: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    enableConfidentialTransfers: false,
    defaultAccountFrozen: false,
    requiresBlacklister: false,
    requiresTransferHookProgram: false,
  },
};

export function getPresetAnchorEnum(preset: Presets): Record<string, Record<string, never>> {
  switch (preset) {
    case Presets.SSS_1:
      return { sss1: {} };
    case Presets.SSS_2:
      return { sss2: {} };
    case Presets.SSS_3:
      return { sss3: {} };
    case Presets.Custom:
      return { custom: {} };
  }
}
