import { Buffer } from "buffer";

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type AccountMeta
} from "@solana/web3.js";

import { concatBytes, encodeString, encodeU32LE, utf8Bytes } from "./bytes.js";
import {
  FALLBACK_REGISTRY_PROGRAM_ID,
  SSS_REGISTRY_CONFIG_SEED,
  SSS_RELEASE_SEED,
  SSS_STABLECOIN_REGISTRATION_SEED
} from "./constants.js";
import { anchorDiscriminator } from "./hash.js";
import type { RegistryRelease, StablecoinPreset, StablecoinRegistryEntry } from "./types.js";

export interface RegisterReleaseParams {
  authority: PublicKey;
  standardVersion: string;
  preset: StablecoinPreset;
  schemaHash: string;
  notesUri: string;
  replacementVersion?: string | null;
  deprecated?: boolean;
}

export interface RegisterStablecoinParams {
  stablecoinProgramId: PublicKey;
  entry: StablecoinRegistryEntry;
}

function encodeBool(value: boolean): Uint8Array {
  return Uint8Array.of(value ? 1 : 0);
}

function encodeOptionalString(value: string | null | undefined): Uint8Array {
  if (!value) {
    return Uint8Array.of(0);
  }
  return concatBytes([Uint8Array.of(1), encodeString(value)]);
}

function encodePubkey(value: PublicKey): Uint8Array {
  return value.toBytes();
}

function presetToByte(preset: StablecoinPreset): number {
  switch (preset) {
    case "sss-1":
      return 1;
    case "sss-2":
      return 2;
    case "sss-3":
      return 3;
    default:
      throw new Error(`Unsupported preset: ${String(preset)}`);
  }
}

function readonly(pubkey: PublicKey, isSigner = false): AccountMeta {
  return { pubkey, isSigner, isWritable: false };
}

function writable(pubkey: PublicKey, isSigner = false): AccountMeta {
  return { pubkey, isSigner, isWritable: true };
}

function buildInstruction(
  programId: PublicKey,
  name: string,
  data: Uint8Array,
  keys: AccountMeta[]
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from(concatBytes([anchorDiscriminator(name), data]))
  });
}

export function findRegistryConfigPda(
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8Bytes(SSS_REGISTRY_CONFIG_SEED)],
    programId
  )[0];
}

export function findRegistryReleasePda(
  standardVersion: string,
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8Bytes(SSS_RELEASE_SEED), utf8Bytes(standardVersion)],
    programId
  )[0];
}

export function findStablecoinRegistrationPda(
  mint: PublicKey,
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utf8Bytes(SSS_STABLECOIN_REGISTRATION_SEED), mint.toBytes()],
    programId
  )[0];
}

export function buildInitializeRegistryInstruction(
  authority: PublicKey,
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): TransactionInstruction {
  return buildInstruction(programId, "initialize_registry", new Uint8Array(), [
    writable(authority, true),
    writable(findRegistryConfigPda(programId)),
    readonly(SystemProgram.programId)
  ]);
}

export function buildRegisterReleaseInstruction(
  params: RegisterReleaseParams,
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): TransactionInstruction {
  const data = concatBytes([
    encodeString(params.standardVersion),
    Uint8Array.of(presetToByte(params.preset)),
    encodeString(params.schemaHash),
    encodeString(params.notesUri),
    encodeBool(Boolean(params.deprecated)),
    encodeOptionalString(params.replacementVersion)
  ]);
  return buildInstruction(programId, "register_release", data, [
    writable(params.authority, true),
    writable(findRegistryConfigPda(programId)),
    writable(findRegistryReleasePda(params.standardVersion, programId)),
    readonly(SystemProgram.programId)
  ]);
}

export function buildDeprecateReleaseInstruction(
  authority: PublicKey,
  standardVersion: string,
  replacementVersion?: string | null,
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): TransactionInstruction {
  const data = encodeOptionalString(replacementVersion);
  return buildInstruction(programId, "deprecate_release", data, [
    writable(authority, true),
    writable(findRegistryConfigPda(programId)),
    writable(findRegistryReleasePda(standardVersion, programId))
  ]);
}

export function buildRegisterStablecoinInstruction(
  params: RegisterStablecoinParams,
  programId = FALLBACK_REGISTRY_PROGRAM_ID
): TransactionInstruction {
  const mint = new PublicKey(params.entry.mint);
  const config = new PublicKey(params.entry.config);
  const stablecoinAuthority = new PublicKey(params.entry.authority);
  const data = concatBytes([
    encodePubkey(mint),
    encodePubkey(config),
    encodePubkey(params.stablecoinProgramId),
    encodeString(params.entry.standardVersion),
    Uint8Array.of(presetToByte(params.entry.preset)),
    encodeString(params.entry.configHash),
    encodeBool(params.entry.enablePermanentDelegate),
    encodeBool(params.entry.enableTransferHook),
    encodeBool(params.entry.defaultAccountFrozen),
    encodeBool(params.entry.enableConfidentialTransfers),
    encodeBool(params.entry.enableZkComplianceProofs),
    encodeBool(params.entry.enableCompressedComplianceState),
    Uint8Array.of(params.entry.decimals),
    encodeOptionalString(params.entry.transferHookProgramId),
    encodeOptionalString(params.entry.proofVerifierProgramId),
    encodeOptionalString(params.entry.compressedComplianceRoot),
    encodeOptionalString(params.entry.complianceCircuit),
    encodeString(params.entry.name),
    encodeString(params.entry.symbol),
    encodeString(params.entry.uri),
    encodeString(params.entry.metadata.homepage ?? ""),
    encodeString(params.entry.metadata.jurisdiction ?? "")
  ]);

  return buildInstruction(programId, "register_stablecoin", data, [
    writable(stablecoinAuthority, true),
    readonly(findRegistryConfigPda(programId)),
    writable(findStablecoinRegistrationPda(mint, programId)),
    readonly(mint),
    readonly(config),
    readonly(SystemProgram.programId)
  ]);
}

export function buildRegistryTransaction(
  instruction: TransactionInstruction
): Transaction {
  return new Transaction().add(instruction);
}

export function toRegistryReleaseSummary(release: RegisterReleaseParams): RegistryRelease {
  return {
    standardVersion: release.standardVersion,
    preset: release.preset,
    schemaHash: release.schemaHash,
    deprecated: Boolean(release.deprecated),
    replacementVersion: release.replacementVersion ?? null,
    notesUri: release.notesUri
  };
}
