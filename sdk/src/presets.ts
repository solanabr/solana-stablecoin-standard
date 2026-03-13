import type { ExtensionConfig, StablecoinPreset } from "./types.js";

export const Presets = {
  SSS_1: "sss-1",
  SSS_2: "sss-2",
  SSS_3: "sss-3"
} as const;

export function extensionsForPreset(preset: StablecoinPreset): Required<ExtensionConfig> {
  if (preset === "sss-3") {
    return {
      permanentDelegate: true,
      transferHook: true,
      defaultAccountFrozen: true,
      confidentialTransfers: true,
      zkComplianceProofs: true,
      compressedComplianceState: true
    };
  }

  if (preset === "sss-2") {
    return {
      permanentDelegate: true,
      transferHook: true,
      defaultAccountFrozen: true,
      confidentialTransfers: false,
      zkComplianceProofs: false,
      compressedComplianceState: false
    };
  }

  return {
    permanentDelegate: false,
    transferHook: false,
    defaultAccountFrozen: false,
    confidentialTransfers: false,
    zkComplianceProofs: false,
    compressedComplianceState: false
  };
}
