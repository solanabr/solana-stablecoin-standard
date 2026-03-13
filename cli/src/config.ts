import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  assertValidMetadata,
  DEFAULT_DECIMALS,
  DEFAULT_STANDARD_VERSION,
  extensionsForPreset,
  type RegistryMetadata
} from "@stbr/sss-token";

type CliPreset = "sss-1" | "sss-2" | "sss-3";

export type CliConfigReference = CliPreset | string;

export interface CliStablecoinConfig {
  preset?: CliPreset;
  extends?: CliConfigReference | CliConfigReference[];
  name?: string;
  symbol?: string;
  uri?: string;
  decimals?: number;
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  defaultAccountFrozen?: boolean;
  enableConfidentialTransfers?: boolean;
  enableZkComplianceProofs?: boolean;
  enableCompressedComplianceState?: boolean;
  transferHookProgramId?: string;
  proofVerifierProgramId?: string;
  compressedComplianceRoot?: string;
  complianceCircuit?: string;
  standardVersion?: string;
  registryMetadata?: RegistryMetadata;
}

export interface NormalizedCliStablecoinConfig {
  preset: CliPreset;
  extends: CliConfigReference[];
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  enableZkComplianceProofs: boolean;
  enableCompressedComplianceState: boolean;
  transferHookProgramId: string;
  proofVerifierProgramId: string;
  compressedComplianceRoot: string;
  complianceCircuit: string;
  standardVersion: string;
  registryMetadata: Required<RegistryMetadata>;
}

function isCliPreset(value: string): value is CliPreset {
  return value === "sss-1" || value === "sss-2" || value === "sss-3";
}

function toReferenceList(value: CliStablecoinConfig["extends"]): CliConfigReference[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function normalizeExtendsValue(value: unknown): CliConfigReference[] | undefined {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const references = value
    .filter((candidate): candidate is string => typeof candidate === "string")
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  return references.length > 0 ? references : undefined;
}

function splitTomlArray(rawValue: string): string[] {
  const items: string[] = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < rawValue.length; index += 1) {
    const char = rawValue[index];
    if (char === "\"" && rawValue[index - 1] !== "\\") {
      inString = !inString;
      current += char;
      continue;
    }

    if (char === "," && !inString) {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function parseTomlScalar(rawValue: string): boolean | number | string {
  if (/^"(.*)"$/.test(rawValue)) {
    return rawValue.replace(/^"(.*)"$/, "$1");
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }

  const numeric = Number(rawValue.replaceAll("_", ""));
  if (!Number.isNaN(numeric) && rawValue !== "") {
    return numeric;
  }

  return rawValue;
}

function parseTomlValue(rawValue: string): boolean | number | string | Array<boolean | number | string> {
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    return splitTomlArray(rawValue.slice(1, -1))
      .filter(Boolean)
      .map((item) => parseTomlScalar(item));
  }

  return parseTomlScalar(rawValue);
}

function setRegistryMetadataField(config: CliStablecoinConfig, key: keyof RegistryMetadata, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }

  config.registryMetadata = {
    ...config.registryMetadata,
    [key]: value
  };
}

function applyTomlField(config: CliStablecoinConfig, section: string | null, key: string, value: unknown): void {
  const normalizedKey = key.replaceAll("-", "_");

  if (section === "preset" && normalizedKey === "extends") {
    const references = normalizeExtendsValue(value);
    if (references) {
      config.extends = references.length === 1 ? references[0] : references;
    }
    return;
  }

  const targetKey = section === "overrides" || section === null ? normalizedKey : `${section}.${normalizedKey}`;
  switch (targetKey) {
    case "preset":
      if (typeof value === "string" && isCliPreset(value)) {
        config.preset = value;
      }
      break;
    case "extends": {
      const references = normalizeExtendsValue(value);
      if (references) {
        config.extends = references.length === 1 ? references[0] : references;
      }
      break;
    }
    case "name":
      if (typeof value === "string") {
        config.name = value;
      }
      break;
    case "symbol":
      if (typeof value === "string") {
        config.symbol = value;
      }
      break;
    case "uri":
      if (typeof value === "string") {
        config.uri = value;
      }
      break;
    case "decimals":
      if (typeof value === "number") {
        config.decimals = value;
      }
      break;
    case "default_account_frozen":
      if (typeof value === "boolean") {
        config.defaultAccountFrozen = value;
      }
      break;
    case "enable_permanent_delegate":
    case "permanent_delegate":
      if (typeof value === "boolean") {
        config.enablePermanentDelegate = value;
      }
      break;
    case "enable_transfer_hook":
    case "transfer_hook":
      if (typeof value === "boolean") {
        config.enableTransferHook = value;
      }
      break;
    case "enable_confidential_transfers":
    case "confidential_transfers":
      if (typeof value === "boolean") {
        config.enableConfidentialTransfers = value;
      }
      break;
    case "enable_zk_compliance_proofs":
    case "zk_compliance_proofs":
      if (typeof value === "boolean") {
        config.enableZkComplianceProofs = value;
      }
      break;
    case "enable_compressed_compliance_state":
    case "compressed_compliance_state":
      if (typeof value === "boolean") {
        config.enableCompressedComplianceState = value;
      }
      break;
    case "transfer_hook_program_id":
      if (typeof value === "string") {
        config.transferHookProgramId = value;
      }
      break;
    case "proof_verifier_program_id":
      if (typeof value === "string") {
        config.proofVerifierProgramId = value;
      }
      break;
    case "compressed_compliance_root":
      if (typeof value === "string") {
        config.compressedComplianceRoot = value;
      }
      break;
    case "compliance_circuit":
      if (typeof value === "string") {
        config.complianceCircuit = value;
      }
      break;
    case "standard_version":
      if (typeof value === "string") {
        config.standardVersion = value;
      }
      break;
    case "registry.homepage":
      setRegistryMetadataField(config, "homepage", value);
      break;
    case "registry.jurisdiction":
      setRegistryMetadataField(config, "jurisdiction", value);
      break;
    default:
      break;
  }
}

function parseTomlLike(input: string): CliStablecoinConfig {
  const config: CliStablecoinConfig = {};
  let currentSection: string | null = null;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim();
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    applyTomlField(config, currentSection, key, parseTomlValue(rawValue));
  }

  return config;
}

function coerceCliConfig(rawConfig: unknown): CliStablecoinConfig {
  const source =
    rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? (rawConfig as Record<string, unknown>)
      : {};
  const config: CliStablecoinConfig = {};

  if (typeof source.preset === "string" && isCliPreset(source.preset)) {
    config.preset = source.preset;
  }

  const references = normalizeExtendsValue(source.extends);
  if (references) {
    config.extends = references.length === 1 ? references[0] : references;
  }

  if (typeof source.name === "string") {
    config.name = source.name;
  }
  if (typeof source.symbol === "string") {
    config.symbol = source.symbol;
  }
  if (typeof source.uri === "string") {
    config.uri = source.uri;
  }
  if (typeof source.decimals === "number") {
    config.decimals = source.decimals;
  }
  if (typeof source.enablePermanentDelegate === "boolean") {
    config.enablePermanentDelegate = source.enablePermanentDelegate;
  } else if (typeof source.enable_permanent_delegate === "boolean") {
    config.enablePermanentDelegate = source.enable_permanent_delegate;
  } else if (typeof source.permanent_delegate === "boolean") {
    config.enablePermanentDelegate = source.permanent_delegate;
  }
  if (typeof source.enableTransferHook === "boolean") {
    config.enableTransferHook = source.enableTransferHook;
  } else if (typeof source.enable_transfer_hook === "boolean") {
    config.enableTransferHook = source.enable_transfer_hook;
  } else if (typeof source.transfer_hook === "boolean") {
    config.enableTransferHook = source.transfer_hook;
  }
  if (typeof source.enableConfidentialTransfers === "boolean") {
    config.enableConfidentialTransfers = source.enableConfidentialTransfers;
  } else if (typeof source.enable_confidential_transfers === "boolean") {
    config.enableConfidentialTransfers = source.enable_confidential_transfers;
  } else if (typeof source.confidential_transfers === "boolean") {
    config.enableConfidentialTransfers = source.confidential_transfers;
  }
  if (typeof source.enableZkComplianceProofs === "boolean") {
    config.enableZkComplianceProofs = source.enableZkComplianceProofs;
  } else if (typeof source.enable_zk_compliance_proofs === "boolean") {
    config.enableZkComplianceProofs = source.enable_zk_compliance_proofs;
  } else if (typeof source.zk_compliance_proofs === "boolean") {
    config.enableZkComplianceProofs = source.zk_compliance_proofs;
  }
  if (typeof source.enableCompressedComplianceState === "boolean") {
    config.enableCompressedComplianceState = source.enableCompressedComplianceState;
  } else if (typeof source.enable_compressed_compliance_state === "boolean") {
    config.enableCompressedComplianceState = source.enable_compressed_compliance_state;
  } else if (typeof source.compressed_compliance_state === "boolean") {
    config.enableCompressedComplianceState = source.compressed_compliance_state;
  }
  if (typeof source.defaultAccountFrozen === "boolean") {
    config.defaultAccountFrozen = source.defaultAccountFrozen;
  } else if (typeof source.default_account_frozen === "boolean") {
    config.defaultAccountFrozen = source.default_account_frozen;
  }
  if (typeof source.transferHookProgramId === "string") {
    config.transferHookProgramId = source.transferHookProgramId;
  } else if (typeof source.transfer_hook_program_id === "string") {
    config.transferHookProgramId = source.transfer_hook_program_id;
  }
  if (typeof source.proofVerifierProgramId === "string") {
    config.proofVerifierProgramId = source.proofVerifierProgramId;
  } else if (typeof source.proof_verifier_program_id === "string") {
    config.proofVerifierProgramId = source.proof_verifier_program_id;
  }
  if (typeof source.compressedComplianceRoot === "string") {
    config.compressedComplianceRoot = source.compressedComplianceRoot;
  } else if (typeof source.compressed_compliance_root === "string") {
    config.compressedComplianceRoot = source.compressed_compliance_root;
  }
  if (typeof source.complianceCircuit === "string") {
    config.complianceCircuit = source.complianceCircuit;
  } else if (typeof source.compliance_circuit === "string") {
    config.complianceCircuit = source.compliance_circuit;
  }
  if (typeof source.standardVersion === "string") {
    config.standardVersion = source.standardVersion;
  } else if (typeof source.standard_version === "string") {
    config.standardVersion = source.standard_version;
  }

  const registrySource = source.registryMetadata ?? source.registry;
  if (registrySource && typeof registrySource === "object" && !Array.isArray(registrySource)) {
    const typedRegistry = registrySource as Record<string, unknown>;
    config.registryMetadata = {
      ...(typeof typedRegistry.homepage === "string" ? { homepage: typedRegistry.homepage } : {}),
      ...(typeof typedRegistry.jurisdiction === "string"
        ? { jurisdiction: typedRegistry.jurisdiction }
        : {})
    };
  }

  return config;
}

function mergeCliConfigs(base: CliStablecoinConfig, override: CliStablecoinConfig): CliStablecoinConfig {
  const mergedRegistryMetadata =
    base.registryMetadata || override.registryMetadata
      ? {
          ...base.registryMetadata,
          ...override.registryMetadata
        }
      : undefined;

  return {
    ...base,
    ...override,
    ...(mergedRegistryMetadata ? { registryMetadata: mergedRegistryMetadata } : {})
  };
}

async function loadCliConfigReference(
  reference: CliConfigReference,
  parentPath: string,
  seen: Set<string>
): Promise<CliStablecoinConfig> {
  if (isCliPreset(reference)) {
    return { preset: reference };
  }

  const resolvedPath = isAbsolute(reference) ? reference : resolve(dirname(parentPath), reference);
  return loadCliConfigInternal(resolvedPath, seen);
}

async function loadCliConfigInternal(path: string, seen: Set<string>): Promise<CliStablecoinConfig> {
  const resolvedPath = resolve(path);
  if (seen.has(resolvedPath)) {
    throw new Error(`CircularConfigExtends:${resolvedPath}`);
  }

  seen.add(resolvedPath);
  try {
    const file = await readFile(resolvedPath, "utf8");
    const parsed = resolvedPath.endsWith(".json")
      ? coerceCliConfig(JSON.parse(file))
      : parseTomlLike(file);

    let merged: CliStablecoinConfig = {};
    for (const reference of toReferenceList(parsed.extends)) {
      const inherited = await loadCliConfigReference(reference, resolvedPath, seen);
      merged = mergeCliConfigs(merged, inherited);
    }

    return mergeCliConfigs(merged, parsed);
  } finally {
    seen.delete(resolvedPath);
  }
}

export async function loadCliConfig(path: string): Promise<CliStablecoinConfig> {
  return loadCliConfigInternal(path, new Set<string>());
}

export function normalizeCliConfig(config: CliStablecoinConfig): NormalizedCliStablecoinConfig {
  const extendReferences = toReferenceList(config.extends);
  const inheritedPreset = extendReferences.find(isCliPreset);
  const preset = config.preset ?? inheritedPreset ?? "sss-1";
  const presetFlags = extensionsForPreset(preset);

  const normalized = {
    preset,
    extends: extendReferences.length > 0 ? extendReferences : [preset],
    name: config.name ?? "Stablecoin",
    symbol: config.symbol ?? "STBL",
    uri: config.uri ?? "",
    decimals: config.decimals ?? DEFAULT_DECIMALS,
    enablePermanentDelegate: config.enablePermanentDelegate ?? presetFlags.permanentDelegate,
    enableTransferHook: config.enableTransferHook ?? presetFlags.transferHook,
    defaultAccountFrozen: config.defaultAccountFrozen ?? presetFlags.defaultAccountFrozen,
    enableConfidentialTransfers:
      config.enableConfidentialTransfers ?? presetFlags.confidentialTransfers,
    enableZkComplianceProofs:
      config.enableZkComplianceProofs ?? presetFlags.zkComplianceProofs,
    enableCompressedComplianceState:
      config.enableCompressedComplianceState ?? presetFlags.compressedComplianceState,
    transferHookProgramId: config.transferHookProgramId ?? "",
    proofVerifierProgramId: config.proofVerifierProgramId ?? "",
    compressedComplianceRoot: config.compressedComplianceRoot ?? "",
    complianceCircuit: config.complianceCircuit ?? "",
    standardVersion: config.standardVersion ?? DEFAULT_STANDARD_VERSION,
    registryMetadata: {
      homepage: config.registryMetadata?.homepage ?? "",
      jurisdiction: config.registryMetadata?.jurisdiction ?? ""
    }
  };

  assertValidMetadata(normalized.name, normalized.symbol, normalized.uri, normalized.decimals);
  return normalized;
}
