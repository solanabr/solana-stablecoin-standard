import { Presets, type CreateStablecoinParams, type StablecoinConfig, type StablecoinExtensions } from "./types";

export const PRESET_VALUES = Object.values(Presets);

const DEFAULT_EXTENSIONS: StablecoinExtensions = {
  permanentDelegate: false,
  transferHook: false,
  defaultAccountFrozen: false,
  confidentialTransfers: false
};

const PRESET_EXTENSIONS: Record<Presets, StablecoinExtensions> = {
  [Presets.SSS_1]: {
    ...DEFAULT_EXTENSIONS
  },
  [Presets.SSS_2]: {
    permanentDelegate: true,
    transferHook: true,
    defaultAccountFrozen: true,
    confidentialTransfers: false
  },
  [Presets.SSS_3]: {
    permanentDelegate: false,
    transferHook: false,
    defaultAccountFrozen: false,
    confidentialTransfers: true
  }
};

/** Whether the preset enables allowlist mode */
export const PRESET_ALLOWLIST: Record<Presets, boolean> = {
  [Presets.SSS_1]: false,
  [Presets.SSS_2]: false,
  [Presets.SSS_3]: true,
};

export function isPreset(value: string): value is Presets {
  return PRESET_VALUES.includes(value as Presets);
}

export function parsePreset(value?: string): Presets {
  if (!value) {
    return Presets.SSS_1;
  }

  if (isPreset(value)) {
    return value;
  }

  throw new Error(`Unknown preset: ${value}. Expected one of: ${PRESET_VALUES.join(", ")}`);
}

export function buildPresetConfig(params: CreateStablecoinParams): StablecoinConfig {
  const preset = parsePreset(params.preset);
  const presetExtensions = PRESET_EXTENSIONS[preset];

  return {
    name: params.name ?? "My Stablecoin",
    symbol: params.symbol ?? "MYST",
    uri: params.uri ?? "",
    decimals: params.decimals ?? 6,
    preset,
    authority: params.authority,
    extensions: {
      ...presetExtensions,
      ...params.extensions
    }
  };
}
