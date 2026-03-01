import { StablecoinConfig } from "./types";

/** Preset configurations for standard stablecoin types. */
export interface PresetConfig {
  name: string;
  symbol: string;
  decimals?: number;
  uri?: string;
}

/** Standard presets. */
export const Presets = {
  /**
   * SSS-1: Minimal Stablecoin
   * - Mint authority + freeze authority + metadata
   * - For simple stablecoins, DAO treasuries
   */
  SSS1: (config: PresetConfig): StablecoinConfig => ({
    name: config.name,
    symbol: config.symbol,
    uri: config.uri ?? "",
    decimals: config.decimals ?? 6,
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  }),

  /**
   * SSS-2: Compliant Stablecoin
   * - SSS-1 + permanent delegate + transfer hook + blacklist enforcement
   * - For regulated stablecoins (USDC/USDT-class)
   */
  SSS2: (config: PresetConfig): StablecoinConfig => ({
    name: config.name,
    symbol: config.symbol,
    uri: config.uri ?? "",
    decimals: config.decimals ?? 6,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
  }),

  /**
   * Custom: Build your own configuration.
   */
  Custom: (config: StablecoinConfig): StablecoinConfig => config,
} as const;
