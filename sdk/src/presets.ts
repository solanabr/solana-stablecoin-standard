import { StablecoinConfig, Preset } from './types';

/**
 * SSS-1: Minimal Stablecoin
 * 
 * For: Internal tokens, DAO treasuries, ecosystem settlement
 * Features: Mint + Freeze + Metadata
 * Compliance: Reactive (freeze accounts as needed)
 */
export const SSS1_PRESET: Partial<StablecoinConfig> = {
  enablePermanentDelegate: false,
  enableTransferHook: false,
  defaultAccountFrozen: false,
};

/**
 * SSS-2: Compliant Stablecoin
 * 
 * For: Regulated stablecoins (USDC/USDT-class)
 * Features: SSS-1 + Permanent Delegate + Transfer Hook + Blacklist
 * Compliance: Proactive (on-chain blacklist enforcement)
 */
export const SSS2_PRESET: Partial<StablecoinConfig> = {
  enablePermanentDelegate: true,
  enableTransferHook: true,
  defaultAccountFrozen: false,
};

/**
 * SSS-3: Private Stablecoin (Experimental)
 * 
 * For: Privacy-focused payments, confidential balances
 * Features: SSS-1 + Confidential Transfers
 * Note: Requires additional setup for confidential transfers
 */
export const SSS3_PRESET: Partial<StablecoinConfig> = {
  enablePermanentDelegate: false,
  enableTransferHook: false,
  defaultAccountFrozen: false,
  // Note: Confidential transfers require additional Token-2022 setup
};

/**
 * Get preset configuration by name
 */
export function getPresetConfig(preset: Preset): Partial<StablecoinConfig> {
  switch (preset) {
    case Preset.SSS_1:
      return SSS1_PRESET;
    case Preset.SSS_2:
      return SSS2_PRESET;
    case Preset.SSS_3:
      return SSS3_PRESET;
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}

/**
 * Validate preset configuration
 */
export function validatePresetConfig(
  preset: Preset,
  config: Partial<StablecoinConfig>
): void {
  const presetConfig = getPresetConfig(preset);
  
  // Ensure required extensions are enabled for the preset
  if (preset === Preset.SSS_2) {
    if (!config.enablePermanentDelegate) {
      throw new Error('SSS-2 requires permanent delegate to be enabled');
    }
    if (!config.enableTransferHook) {
      throw new Error('SSS-2 requires transfer hook to be enabled');
    }
  }
  
  // Validate name and symbol
  if (!config.name || config.name.length > 32) {
    throw new Error('Name must be 1-32 characters');
  }
  if (!config.symbol || config.symbol.length > 10) {
    throw new Error('Symbol must be 1-10 characters');
  }
  if (config.uri && config.uri.length > 200) {
    throw new Error('URI must be max 200 characters');
  }
  if (config.decimals === undefined || config.decimals < 0 || config.decimals > 9) {
    throw new Error('Decimals must be 0-9');
  }
}

/**
 * Merge preset with custom configuration
 */
export function mergePresetConfig(
  preset: Preset,
  customConfig: Partial<StablecoinConfig>
): StablecoinConfig {
  const presetConfig = getPresetConfig(preset);
  
  const merged: StablecoinConfig = {
    name: customConfig.name || '',
    symbol: customConfig.symbol || '',
    uri: customConfig.uri || '',
    decimals: customConfig.decimals ?? 6,
    enablePermanentDelegate: customConfig.enablePermanentDelegate ?? presetConfig.enablePermanentDelegate ?? false,
    enableTransferHook: customConfig.enableTransferHook ?? presetConfig.enableTransferHook ?? false,
    defaultAccountFrozen: customConfig.defaultAccountFrozen ?? presetConfig.defaultAccountFrozen ?? false,
  };
  
  validatePresetConfig(preset, merged);
  
  return merged;
}

/**
 * Get preset description
 */
export function getPresetDescription(preset: Preset): string {
  switch (preset) {
    case Preset.SSS_1:
      return 'Minimal Stablecoin - Basic features for internal tokens and DAO treasuries';
    case Preset.SSS_2:
      return 'Compliant Stablecoin - Regulated tokens with on-chain blacklist enforcement';
    case Preset.SSS_3:
      return 'Private Stablecoin - Privacy-focused with confidential transfers (experimental)';
    default:
      return 'Unknown preset';
  }
}

/**
 * Export all presets
 */
export const Presets = {
  SSS_1: Preset.SSS_1,
  SSS_2: Preset.SSS_2,
  SSS_3: Preset.SSS_3,
};
