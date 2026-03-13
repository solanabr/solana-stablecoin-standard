import { PublicKey, type Connection } from "@solana/web3.js";

import { readU32LE, readU64LE, utf8String } from "./bytes.js";
import { computeStablecoinConfigHash } from "./registry.js";
import type { StablecoinConfigView, StablecoinPreset } from "./types.js";

function readPubkey(data: Uint8Array, offset: number): { value: string; offset: number } {
  return {
    value: new PublicKey(data.subarray(offset, offset + 32)).toBase58(),
    offset: offset + 32
  };
}

function readBool(data: Uint8Array, offset: number): { value: boolean; offset: number } {
  return {
    value: data[offset] === 1,
    offset: offset + 1
  };
}

function readU64(data: Uint8Array, offset: number): { value: bigint; offset: number } {
  return readU64LE(data, offset);
}

function readString(data: Uint8Array, offset: number): { value: string; offset: number } {
  const length = readU32LE(data, offset);
  const start = length.offset;
  const end = start + length.value;
  return {
    value: utf8String(data.subarray(start, end)),
    offset: end
  };
}

function readOptionalPubkey(data: Uint8Array, offset: number): { value: string | null; offset: number } {
  const flag = data[offset];
  if (flag === 0) {
    return { value: null, offset: offset + 1 };
  }
  const start = offset + 1;
  const end = start + 32;
  return {
    value: new PublicKey(data.subarray(start, end)).toBase58(),
    offset: end
  };
}

function readOptionalString(data: Uint8Array, offset: number): { value: string | null; offset: number } {
  const flag = data[offset];
  if (flag === 0) {
    return { value: null, offset: offset + 1 };
  }
  const nested = readString(data, offset + 1);
  return { value: nested.value, offset: nested.offset };
}

function inferPreset(view: {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  enableConfidentialTransfers: boolean;
  enableZkComplianceProofs: boolean;
  enableCompressedComplianceState: boolean;
}): StablecoinPreset {
  if (
    view.enableConfidentialTransfers
    || view.enableZkComplianceProofs
    || view.enableCompressedComplianceState
  ) {
    return "sss-3";
  }
  if (view.enablePermanentDelegate || view.enableTransferHook) {
    return "sss-2";
  }
  return "sss-1";
}

export function decodeStablecoinConfigAccount(data: Uint8Array): StablecoinConfigView {
  let offset = 8;
  const authority = readPubkey(data, offset);
  offset = authority.offset;
  const pendingAuthority = readOptionalPubkey(data, offset);
  offset = pendingAuthority.offset;
  const mint = readPubkey(data, offset);
  offset = mint.offset;
  const name = readString(data, offset);
  offset = name.offset;
  const symbol = readString(data, offset);
  offset = symbol.offset;
  const uri = readString(data, offset);
  offset = uri.offset;
  const decimals = data[offset];
  offset += 1;
  const standardVersion = readString(data, offset);
  offset = standardVersion.offset;
  const isPaused = readBool(data, offset);
  offset = isPaused.offset;
  const totalMinted = readU64(data, offset);
  offset = totalMinted.offset;
  const totalBurned = readU64(data, offset);
  offset = totalBurned.offset;
  const enablePermanentDelegate = readBool(data, offset);
  offset = enablePermanentDelegate.offset;
  const enableTransferHook = readBool(data, offset);
  offset = enableTransferHook.offset;
  const defaultAccountFrozen = readBool(data, offset);
  offset = defaultAccountFrozen.offset;
  const enableConfidentialTransfers = readBool(data, offset);
  offset = enableConfidentialTransfers.offset;
  const enableZkComplianceProofs = readBool(data, offset);
  offset = enableZkComplianceProofs.offset;
  const enableCompressedComplianceState = readBool(data, offset);
  offset = enableCompressedComplianceState.offset;
  const transferHookProgramId = readOptionalPubkey(data, offset);
  offset = transferHookProgramId.offset;
  const proofVerifierProgramId = readOptionalPubkey(data, offset);
  offset = proofVerifierProgramId.offset;
  const compressedComplianceRoot = readOptionalString(data, offset);
  offset = compressedComplianceRoot.offset;
  const complianceCircuit = readOptionalString(data, offset);

  const viewWithoutPreset = {
    name: name.value,
    symbol: symbol.value,
    uri: uri.value,
    decimals,
    enablePermanentDelegate: enablePermanentDelegate.value,
    enableTransferHook: enableTransferHook.value,
    defaultAccountFrozen: defaultAccountFrozen.value,
    enableConfidentialTransfers: enableConfidentialTransfers.value,
    enableZkComplianceProofs: enableZkComplianceProofs.value,
    enableCompressedComplianceState: enableCompressedComplianceState.value,
    transferHookProgramId: transferHookProgramId.value,
    proofVerifierProgramId: proofVerifierProgramId.value,
    compressedComplianceRoot: compressedComplianceRoot.value,
    complianceCircuit: complianceCircuit.value,
    standardVersion: standardVersion.value
  };
  const preset = inferPreset(viewWithoutPreset);

  return {
    authority: authority.value,
    preset,
    ...viewWithoutPreset,
    configHash: computeStablecoinConfigHash({
      preset,
      ...viewWithoutPreset
    }),
    isPaused: isPaused.value
  };
}

export async function fetchStablecoinConfig(
  connection: Connection,
  configAddress: PublicKey
): Promise<StablecoinConfigView> {
  const account = await connection.getAccountInfo(configAddress, "confirmed");
  if (!account) {
    throw new Error(`MissingStablecoinConfig:${configAddress.toBase58()}`);
  }
  return decodeStablecoinConfigAccount(account.data);
}
