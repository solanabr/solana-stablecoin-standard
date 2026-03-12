/**
 * Preset configurations for the Solana Stablecoin Standard.
 *
 * Each preset maps to a set of Token-2022 extensions that are
 * enabled at initialization time. Feature flags are immutable
 * after creation — you choose your preset once.
 *
 * ## Preset Comparison
 *
 * | Feature               | SSS-1 | SSS-2 | SSS-3 |
 * |-----------------------|-------|-------|-------|
 * | Mint/Burn             | ✅    | ✅    | ✅    |
 * | Freeze/Thaw           | ✅    | ✅    | ✅    |
 * | Metadata              | ✅    | ✅    | ✅    |
 * | Permanent Delegate    | ❌    | ✅    | ❌    |
 * | Transfer Hook         | ❌    | ✅    | ❌    |
 * | Default Frozen        | ❌    | ✅    | ❌    |
 * | Blacklist             | ❌    | ✅    | ❌    |
 * | Seize                 | ❌    | ✅    | ❌    |
 * | Confidential Transfers| ❌    | ❌    | ✅    |
 */
export enum Presets {
  /** Minimal: mint + freeze + metadata. For DAO treasuries, ecosystem settlement. */
  SSS_1 = "SSS_1",
  /** Compliant: SSS-1 + blacklist + seize. For regulated stablecoins (USDC-class). */
  SSS_2 = "SSS_2",
  /** Private: SSS-1 + confidential transfers. Experimental. */
  SSS_3 = "SSS_3",
}

import type { ExtensionConfig } from "./types";

/** Preset extension configurations */
const PRESET_CONFIGS: Record<Presets, ExtensionConfig> = {
  [Presets.SSS_1]: {
    permanentDelegate: false,
    transferHook: false,
    defaultAccountFrozen: false,
    confidentialTransfers: false,
  },
  [Presets.SSS_2]: {
    permanentDelegate: true,
    transferHook: true,
    defaultAccountFrozen: true,
    confidentialTransfers: false,
  },
  [Presets.SSS_3]: {
    permanentDelegate: false,
    transferHook: false,
    defaultAccountFrozen: false,
    confidentialTransfers: true,
  },
};

/**
 * Get the extension configuration for a preset.
 *
 * @example
 * ```typescript
 * const extensions = getPresetConfig(Presets.SSS_2);
 * // { permanentDelegate: true, transferHook: true, defaultAccountFrozen: true, ... }
 * ```
 */
export function getPresetConfig(preset: Presets): ExtensionConfig {
  return PRESET_CONFIGS[preset];
}
