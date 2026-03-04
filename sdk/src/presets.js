"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Presets = exports.getPresetDescription = exports.mergePresetConfig = exports.validatePresetConfig = exports.getPresetConfig = exports.SSS3_PRESET = exports.SSS2_PRESET = exports.SSS1_PRESET = void 0;
const types_1 = require("./types");
/**
 * SSS-1: Minimal Stablecoin
 *
 * For: Internal tokens, DAO treasuries, ecosystem settlement
 * Features: Mint + Freeze + Metadata
 * Compliance: Reactive (freeze accounts as needed)
 */
exports.SSS1_PRESET = {
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
exports.SSS2_PRESET = {
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
exports.SSS3_PRESET = {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    // Note: Confidential transfers require additional Token-2022 setup
};
/**
 * Get preset configuration by name
 */
function getPresetConfig(preset) {
    switch (preset) {
        case types_1.Preset.SSS_1:
            return exports.SSS1_PRESET;
        case types_1.Preset.SSS_2:
            return exports.SSS2_PRESET;
        case types_1.Preset.SSS_3:
            return exports.SSS3_PRESET;
        default:
            throw new Error(`Unknown preset: ${preset}`);
    }
}
exports.getPresetConfig = getPresetConfig;
/**
 * Validate preset configuration
 */
function validatePresetConfig(preset, config) {
    const presetConfig = getPresetConfig(preset);
    // Ensure required extensions are enabled for the preset
    if (preset === types_1.Preset.SSS_2) {
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
exports.validatePresetConfig = validatePresetConfig;
/**
 * Merge preset with custom configuration
 */
function mergePresetConfig(preset, customConfig) {
    const presetConfig = getPresetConfig(preset);
    const merged = {
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
exports.mergePresetConfig = mergePresetConfig;
/**
 * Get preset description
 */
function getPresetDescription(preset) {
    switch (preset) {
        case types_1.Preset.SSS_1:
            return 'Minimal Stablecoin - Basic features for internal tokens and DAO treasuries';
        case types_1.Preset.SSS_2:
            return 'Compliant Stablecoin - Regulated tokens with on-chain blacklist enforcement';
        case types_1.Preset.SSS_3:
            return 'Private Stablecoin - Privacy-focused with confidential transfers (experimental)';
        default:
            return 'Unknown preset';
    }
}
exports.getPresetDescription = getPresetDescription;
/**
 * Export all presets
 */
exports.Presets = {
    SSS_1: types_1.Preset.SSS_1,
    SSS_2: types_1.Preset.SSS_2,
    SSS_3: types_1.Preset.SSS_3,
};
