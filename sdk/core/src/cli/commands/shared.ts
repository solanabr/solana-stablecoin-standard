import type { StablecoinExtensions } from "../../types";

type ExtensionOptionName =
  | "permanentDelegate"
  | "transferHook"
  | "defaultAccountFrozen"
  | "confidentialTransfers";

const EXTENSION_OPTION_NAMES: ExtensionOptionName[] = [
  "permanentDelegate",
  "transferHook",
  "defaultAccountFrozen",
  "confidentialTransfers"
];

export function collectExtensionOverrides(options: Record<string, unknown>): Partial<StablecoinExtensions> {
  const overrides: Partial<StablecoinExtensions> = {};

  for (const key of EXTENSION_OPTION_NAMES) {
    const value = options[key];
    if (typeof value === "boolean") {
      overrides[key] = value;
    }
  }

  return overrides;
}

