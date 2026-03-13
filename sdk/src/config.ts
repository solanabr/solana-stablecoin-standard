import { DEFAULT_DECIMALS, DEFAULT_STANDARD_VERSION } from "./constants.js";
import { extensionsForPreset, Presets } from "./presets.js";
import { computeStablecoinConfigHash, normalizeRegistryMetadata } from "./registry.js";
import type {
  ExperimentalComplianceConfig,
  RegistryMetadata,
  StablecoinConfigView,
  StablecoinCreateParams,
  StablecoinPreset
} from "./types.js";
import { assertValidMetadata } from "./validation.js";
import { resolvePublicKey } from "./wallet.js";

export interface NormalizedStablecoinCreateConfig {
  authority: import("@solana/web3.js").PublicKey;
  preset: StablecoinPreset;
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
  transferHookProgramId: string | null;
  proofVerifierProgramId: string | null;
  compressedComplianceRoot: string | null;
  complianceCircuit: string | null;
  standardVersion: string;
  registryMetadata: RegistryMetadata;
}

interface NormalizedExperimentalComplianceConfig {
  proofVerifierProgramId: string | null;
  compressedComplianceRoot: string | null;
  complianceCircuit: string | null;
}

function normalizeExperimentalCompliance(
  compliance: ExperimentalComplianceConfig | undefined
): NormalizedExperimentalComplianceConfig {
  return {
    proofVerifierProgramId: compliance?.proofVerifierProgramId?.toBase58() ?? null,
    compressedComplianceRoot: compliance?.compressedComplianceRoot ?? null,
    complianceCircuit: compliance?.complianceCircuit ?? null
  };
}

export function normalizeCreateConfig(params: StablecoinCreateParams): NormalizedStablecoinCreateConfig {
  const preset = params.preset ?? Presets.SSS_1;
  const name = params.name;
  const symbol = params.symbol;
  const uri = params.uri ?? "";
  const decimals = params.decimals ?? DEFAULT_DECIMALS;
  const extensions = {
    ...extensionsForPreset(preset),
    ...params.extensions
  };
  const compliance = normalizeExperimentalCompliance(params.compliance);
  assertValidMetadata(name, symbol, uri, decimals);

  return {
    authority: resolvePublicKey(params.authority),
    preset,
    name,
    symbol,
    uri,
    decimals,
    enablePermanentDelegate: Boolean(extensions.permanentDelegate),
    enableTransferHook: Boolean(extensions.transferHook),
    defaultAccountFrozen: Boolean(extensions.defaultAccountFrozen),
    enableConfidentialTransfers: Boolean(extensions.confidentialTransfers),
    enableZkComplianceProofs: Boolean(extensions.zkComplianceProofs),
    enableCompressedComplianceState: Boolean(extensions.compressedComplianceState),
    transferHookProgramId: params.transferHookProgramId?.toBase58() ?? null,
    proofVerifierProgramId: compliance.proofVerifierProgramId,
    compressedComplianceRoot: compliance.compressedComplianceRoot,
    complianceCircuit: compliance.complianceCircuit,
    standardVersion: params.standardVersion ?? DEFAULT_STANDARD_VERSION,
    registryMetadata: normalizeRegistryMetadata(params.registryMetadata)
  };
}

export function toConfigView(config: NormalizedStablecoinCreateConfig): StablecoinConfigView {
  const configHash = computeStablecoinConfigHash(config);
  return {
    authority: config.authority.toBase58(),
    preset: config.preset,
    name: config.name,
    symbol: config.symbol,
    uri: config.uri,
    decimals: config.decimals,
    enablePermanentDelegate: config.enablePermanentDelegate,
    enableTransferHook: config.enableTransferHook,
    defaultAccountFrozen: config.defaultAccountFrozen,
    enableConfidentialTransfers: config.enableConfidentialTransfers,
    enableZkComplianceProofs: config.enableZkComplianceProofs,
    enableCompressedComplianceState: config.enableCompressedComplianceState,
    transferHookProgramId: config.transferHookProgramId,
    proofVerifierProgramId: config.proofVerifierProgramId,
    compressedComplianceRoot: config.compressedComplianceRoot,
    complianceCircuit: config.complianceCircuit,
    standardVersion: config.standardVersion,
    configHash,
    isPaused: false
  };
}
