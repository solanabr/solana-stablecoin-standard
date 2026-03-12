import { Preset, type StablecoinConfig } from "./types";
import { DEFAULT_DECIMALS } from "./constants";

/**
 * SSS-1: Minimal stablecoin.
 * Mint authority + freeze authority + Token-2022 embedded metadata.
 * Compliance is reactive (freeze accounts as needed).
 */
export function sss1Preset(
  name: string,
  symbol: string,
  options: Partial<StablecoinConfig> = {}
): StablecoinConfig {
  return {
    name,
    symbol,
    uri: options.uri ?? "",
    decimals: options.decimals ?? DEFAULT_DECIMALS,
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  };
}

/**
 * SSS-2: Compliant stablecoin.
 * SSS-1 + permanent delegate + transfer hook + default frozen accounts.
 * Suitable for regulated issuers (USDC/USDT-class).
 */
export function sss2Preset(
  name: string,
  symbol: string,
  options: Partial<StablecoinConfig> = {}
): StablecoinConfig {
  return {
    name,
    symbol,
    uri: options.uri ?? "",
    decimals: options.decimals ?? DEFAULT_DECIMALS,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
  };
}

/**
 * Build a config from a preset enum + overrides.
 */
export function buildConfig(
  preset: Preset,
  name: string,
  symbol: string,
  options: Partial<StablecoinConfig> = {}
): StablecoinConfig {
  switch (preset) {
    case Preset.SSS_1:
      return sss1Preset(name, symbol, options);
    case Preset.SSS_2:
      return sss2Preset(name, symbol, options);
  }
}
