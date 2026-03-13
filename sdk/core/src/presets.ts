import { Preset } from "./types";

export interface PresetConfig {
  name: string;
  description: string;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

const PRESETS: Record<Preset, PresetConfig> = {
  [Preset.SSS_1]: {
    name: "SSS-1: Minimal Stablecoin",
    description:
      "Mint authority + freeze authority + metadata. " +
      "For simple stablecoins — internal tokens, DAO treasuries, ecosystem settlement. " +
      "Compliance is reactive (freeze accounts as needed).",
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  },
  [Preset.SSS_2]: {
    name: "SSS-2: Compliant Stablecoin",
    description:
      "SSS-1 + permanent delegate + transfer hook + blacklist enforcement. " +
      "For regulated stablecoins (USDC/USDT-class) where regulators expect " +
      "on-chain blacklist enforcement and token seizure capabilities.",
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
  },
};

export function getPresetConfig(preset: Preset): PresetConfig {
  return PRESETS[preset];
}

export function resolveConfig(params: {
  preset?: Preset;
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
}): {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
} {
  if (params.preset) {
    const config = getPresetConfig(params.preset);
    return {
      enablePermanentDelegate: config.enablePermanentDelegate,
      enableTransferHook: config.enableTransferHook,
      defaultAccountFrozen: config.defaultAccountFrozen,
    };
  }

  return {
    enablePermanentDelegate: params.extensions?.permanentDelegate ?? false,
    enableTransferHook: params.extensions?.transferHook ?? false,
    defaultAccountFrozen: params.extensions?.defaultAccountFrozen ?? false,
  };
}

export { Preset } from "./types";
