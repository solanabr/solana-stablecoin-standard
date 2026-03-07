import { PublicKey } from '@solana/web3.js';

/**
 * Standard preset configurations for stablecoins
 */

export interface StablecoinConfig {
  name: string;
  symbol: string;
  decimals: number;
  extensions: {
    metadata: boolean;
    freezeAuthority: boolean;
    permanentDelegate: boolean;
    transferHook: boolean;
    confidentialTransfers: boolean;
    defaultAccountFrozen: boolean;
  };
  features: {
    blacklist: boolean;
    seizure: boolean;
    pause: boolean;
    roleBasedAccess: boolean;
  };
}

/**
 * SSS-1: Minimal Stablecoin
 * 
 * Perfect for:
 * - Internal company tokens
 * - DAO treasury tokens
 * - Gaming currencies
 * - Test environments
 * 
 * Features:
 * - Mint/Burn
 * - Freeze accounts
 * - Token metadata
 * - Basic role-based access
 */
export const SSS_1: Partial<StablecoinConfig> = {
  extensions: {
    metadata: true,
    freezeAuthority: true,
    permanentDelegate: false,
    transferHook: false,
    confidentialTransfers: false,
    defaultAccountFrozen: false,
  },
  features: {
    blacklist: false,
    seizure: false,
    pause: true,
    roleBasedAccess: true,
  },
};

/**
 * SSS-2: Compliant Stablecoin
 * 
 * Perfect for:
 * - Regulated stablecoins (USDC-class)
 * - Bank-issued digital currencies
 * - Payment processors
 * - Institutional DeFi
 * 
 * Features:
 * - All SSS-1 features
 * - Blacklist management
 * - Token seizure
 * - Transfer hooks for compliance
 * - Permanent delegate for emergency actions
 */
export const SSS_2: Partial<StablecoinConfig> = {
  extensions: {
    metadata: true,
    freezeAuthority: true,
    permanentDelegate: true,
    transferHook: true,
    confidentialTransfers: false,
    defaultAccountFrozen: false,
  },
  features: {
    blacklist: true,
    seizure: true,
    pause: true,
    roleBasedAccess: true,
  },
};

/**
 * SSS-3: Private Stablecoin (Experimental)
 * 
 * Perfect for:
 * - Privacy-focused payments
 * - Corporate treasury (confidential balances)
 * - High-net-worth individuals
 * - Experimental use cases
 * 
 * Features:
 * - All SSS-1 features
 * - Confidential transfers (encrypted amounts)
 * - Encrypted balances
 * - Optional auditor keys for compliance
 * 
 * ⚠️ Experimental: Confidential transfers are still maturing
 */
export const SSS_3: Partial<StablecoinConfig> = {
  extensions: {
    metadata: true,
    freezeAuthority: true,
    permanentDelegate: false,
    transferHook: false,
    confidentialTransfers: true,
    defaultAccountFrozen: false,
  },
  features: {
    blacklist: false,
    seizure: false,
    pause: true,
    roleBasedAccess: true,
  },
};

/**
 * Preset enum for easy reference
 */
export enum Presets {
  SSS_1 = 'sss-1',
  SSS_2 = 'sss-2',
  SSS_3 = 'sss-3',
}

/**
 * Get preset configuration by name
 */
export function getPreset(preset: Presets | string): Partial<StablecoinConfig> {
  switch (preset) {
    case Presets.SSS_1:
    case 'sss-1':
      return SSS_1;
    case Presets.SSS_2:
    case 'sss-2':
      return SSS_2;
    case Presets.SSS_3:
    case 'sss-3':
      return SSS_3;
    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}

/**
 * Merge preset with custom configuration
 */
export function mergeConfig(
  preset: Partial<StablecoinConfig>,
  custom: Partial<StablecoinConfig>
): StablecoinConfig {
  return {
    name: custom.name || preset.name || 'Stablecoin',
    symbol: custom.symbol || preset.symbol || 'USD',
    decimals: custom.decimals ?? preset.decimals ?? 6,
    extensions: {
      ...preset.extensions,
      ...custom.extensions,
    },
    features: {
      ...preset.features,
      ...custom.features,
    },
  } as StablecoinConfig;
}

/**
 * Validate preset configuration
 */
export function validateConfig(config: StablecoinConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate name
  if (!config.name || config.name.length === 0) {
    errors.push('Token name is required');
  }
  if (config.name && config.name.length > 32) {
    errors.push('Token name must be 32 characters or less');
  }

  // Validate symbol
  if (!config.symbol || config.symbol.length === 0) {
    errors.push('Token symbol is required');
  }
  if (config.symbol && config.symbol.length > 10) {
    errors.push('Token symbol must be 10 characters or less');
  }

  // Validate decimals
  if (config.decimals < 0 || config.decimals > 9) {
    errors.push('Decimals must be between 0 and 9');
  }

  // Validate extension combinations
  if (config.extensions.confidentialTransfers && config.extensions.transferHook) {
    errors.push('Confidential transfers and transfer hooks cannot be used together');
  }

  if (config.extensions.confidentialTransfers && config.extensions.permanentDelegate) {
    errors.push('Confidential transfers and permanent delegate cannot be used together');
  }

  // Validate feature dependencies
  if (config.features.blacklist && !config.extensions.transferHook) {
    errors.push('Blacklist feature requires transfer hook extension');
  }

  if (config.features.seizure && !config.extensions.permanentDelegate) {
    errors.push('Seizure feature requires permanent delegate extension');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get preset description
 */
export function getPresetDescription(preset: Presets | string): string {
  switch (preset) {
    case Presets.SSS_1:
    case 'sss-1':
      return 'Minimal stablecoin with basic features (mint, burn, freeze)';
    case Presets.SSS_2:
    case 'sss-2':
      return 'Compliant stablecoin with blacklist and compliance features';
    case Presets.SSS_3:
    case 'sss-3':
      return 'Private stablecoin with confidential transfers (experimental)';
    default:
      return 'Unknown preset';
  }
}

/**
 * Compare two presets
 */
export function comparePresets(preset1: string, preset2: string): {
  common: string[];
  unique1: string[];
  unique2: string[];
} {
  const config1 = getPreset(preset1);
  const config2 = getPreset(preset2);

  const features1 = Object.entries(config1.extensions || {})
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);

  const features2 = Object.entries(config2.extensions || {})
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);

  const common = features1.filter(f => features2.includes(f));
  const unique1 = features1.filter(f => !features2.includes(f));
  const unique2 = features2.filter(f => !features1.includes(f));

  return { common, unique1, unique2 };
}

export default {
  SSS_1,
  SSS_2,
  SSS_3,
  Presets,
  getPreset,
  mergeConfig,
  validateConfig,
  getPresetDescription,
  comparePresets,
};
