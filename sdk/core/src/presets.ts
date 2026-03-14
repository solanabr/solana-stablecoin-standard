export enum Presets {
  SSS_1 = 'sss-1',
  SSS_2 = 'sss-2',
}

export interface PresetDefinition {
  enableCompliance: boolean;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
}

export const PRESET_DEFINITIONS: Record<Presets, PresetDefinition> = {
  [Presets.SSS_1]: {
    enableCompliance: false,
    enablePermanentDelegate: false,
    enableTransferHook: false,
  },
  [Presets.SSS_2]: {
    enableCompliance: true,
    enablePermanentDelegate: true,
    enableTransferHook: true,
  },
};
