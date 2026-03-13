import type { PublicKey } from "@solana/web3.js";

import { sha256Hex } from "./hash.js";
import type {
  RegistryMetadata,
  StablecoinConfigView,
  StablecoinRegistryEntry
} from "./types.js";

interface HashableStablecoinConfig {
  preset: StablecoinConfigView["preset"];
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
}

export interface StablecoinRegistryEntryInput {
  mint: PublicKey;
  config: PublicKey;
  authority: PublicKey;
  view: StablecoinConfigView;
  metadata?: RegistryMetadata;
}

export function normalizeRegistryMetadata(metadata?: RegistryMetadata): Required<RegistryMetadata> {
  return {
    homepage: metadata?.homepage ?? "",
    jurisdiction: metadata?.jurisdiction ?? ""
  };
}

export function computeStablecoinConfigHash(config: HashableStablecoinConfig): string {
  const payload = JSON.stringify({
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
    standardVersion: config.standardVersion
  });

  return sha256Hex(payload);
}

export function buildStablecoinRegistryEntry(
  input: StablecoinRegistryEntryInput
): StablecoinRegistryEntry {
  return {
    mint: input.mint.toBase58(),
    config: input.config.toBase58(),
    authority: input.authority.toBase58(),
    preset: input.view.preset,
    standardVersion: input.view.standardVersion,
    configHash: input.view.configHash,
    name: input.view.name,
    symbol: input.view.symbol,
    uri: input.view.uri,
    decimals: input.view.decimals,
    enablePermanentDelegate: input.view.enablePermanentDelegate,
    enableTransferHook: input.view.enableTransferHook,
    defaultAccountFrozen: input.view.defaultAccountFrozen,
    enableConfidentialTransfers: input.view.enableConfidentialTransfers,
    enableZkComplianceProofs: input.view.enableZkComplianceProofs,
    enableCompressedComplianceState: input.view.enableCompressedComplianceState,
    transferHookProgramId: input.view.transferHookProgramId,
    proofVerifierProgramId: input.view.proofVerifierProgramId,
    compressedComplianceRoot: input.view.compressedComplianceRoot,
    complianceCircuit: input.view.complianceCircuit,
    metadata: normalizeRegistryMetadata(input.metadata)
  };
}
