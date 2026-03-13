import { Buffer } from "buffer";

import {
  Transaction,
  TransactionInstruction,
  type AccountMeta,
  type PublicKey,
  PublicKey as SolanaPublicKey
} from "@solana/web3.js";

import { concatBytes, encodeString as encodeUtf8String, encodeU32LE, encodeU64LE } from "./bytes.js";
import { anchorDiscriminator } from "./hash.js";
import type { RoleType, StablecoinPreset } from "./types.js";

export interface InitializeInstructionPayload {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  standardVersion: string;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  enableZkComplianceProofs: boolean;
  enableCompressedComplianceState: boolean;
  transferHookProgramId: PublicKey | null;
  proofVerifierProgramId: PublicKey | null;
  compressedComplianceRoot: string | null;
  complianceCircuit: string | null;
}

export interface SubmitProofReceiptInstructionPayload {
  subject: PublicKey;
  commitment: Uint8Array;
  proofCommitment: Uint8Array;
  response: Uint8Array;
  merkleSiblings: Uint8Array[];
  merkleDirections: number[];
  circuit: string;
  expiresAtSlot: bigint;
}

function encodeU64(value: bigint): Uint8Array {
  return encodeU64LE(value);
}

function encodeString(value: string): Uint8Array {
  return encodeUtf8String(value);
}

function encodeBytes(value: Uint8Array, length?: number): Uint8Array {
  if (length !== undefined && value.length !== length) {
    throw new Error(`InvalidByteLength:${value.length}:${length}`);
  }
  return Uint8Array.from(value);
}

function encodeVec<T>(values: T[], encodeValue: (value: T) => Uint8Array): Uint8Array {
  return concatBytes([encodeU32LE(values.length), ...values.map((value) => encodeValue(value))]);
}

function encodeBool(value: boolean): Uint8Array {
  return Uint8Array.of(value ? 1 : 0);
}

function encodePubkey(value: PublicKey): Uint8Array {
  return value.toBytes();
}

function encodeOptionalPubkey(value: PublicKey | null): Uint8Array {
  if (value === null) {
    return Uint8Array.of(0);
  }
  return concatBytes([Uint8Array.of(1), encodePubkey(value)]);
}

function encodeOptionalString(value: string | null): Uint8Array {
  if (value === null) {
    return Uint8Array.of(0);
  }
  return concatBytes([Uint8Array.of(1), encodeString(value)]);
}

function encodeOptionalU64(value: bigint | null | undefined): Uint8Array {
  if (value === null || value === undefined) {
    return Uint8Array.of(0);
  }
  return concatBytes([Uint8Array.of(1), encodeU64(value)]);
}

function encodeRole(value: RoleType): Uint8Array {
  switch (value) {
    case "minter":
      return Uint8Array.of(0);
    case "burner":
      return Uint8Array.of(1);
    case "blacklister":
      return Uint8Array.of(2);
    case "pauser":
      return Uint8Array.of(3);
    case "seizer":
      return Uint8Array.of(4);
    default:
      throw new Error(`Unsupported role encoder: ${String(value)}`);
  }
}

function encodeInitializeArgs(payload: InitializeInstructionPayload): Uint8Array {
  return concatBytes([
    encodeString(payload.name),
    encodeString(payload.symbol),
    encodeString(payload.uri),
    Uint8Array.of(payload.decimals),
    encodeString(payload.standardVersion),
    encodeBool(payload.enablePermanentDelegate),
    encodeBool(payload.enableTransferHook),
    encodeBool(payload.defaultAccountFrozen),
    encodeOptionalPubkey(payload.transferHookProgramId),
    encodeBool(payload.enableConfidentialTransfers),
    encodeBool(payload.enableZkComplianceProofs),
    encodeBool(payload.enableCompressedComplianceState),
    encodeOptionalPubkey(payload.proofVerifierProgramId),
    encodeOptionalString(payload.compressedComplianceRoot),
    encodeOptionalString(payload.complianceCircuit)
  ]);
}

function encodeSubmitProofReceiptArgs(payload: SubmitProofReceiptInstructionPayload): Uint8Array {
  return concatBytes([
    encodePubkey(payload.subject),
    encodeBytes(payload.commitment, 32),
    encodeBytes(payload.proofCommitment, 32),
    encodeBytes(payload.response, 32),
    encodeVec(payload.merkleSiblings, (value) => encodeBytes(value, 32)),
    encodeVec(payload.merkleDirections, (value) => Uint8Array.of(value)),
    encodeString(payload.circuit),
    encodeU64(payload.expiresAtSlot)
  ]);
}

function encodePublicKeyArg(address: PublicKey): Uint8Array {
  return encodePubkey(address);
}

function encodeUpdateRoleArgs(payload: {
  holder: PublicKey;
  role: RoleType;
  isActive: boolean;
  mintQuota?: bigint | null;
}): Uint8Array {
  return concatBytes([
    encodePubkey(payload.holder),
    encodeRole(payload.role),
    encodeBool(payload.isActive),
    encodeOptionalU64(payload.mintQuota)
  ]);
}

function encodeNoArgs(): Uint8Array {
  return new Uint8Array();
}

export function encodeStablecoinInstruction(
  name: string,
  payload:
    | InitializeInstructionPayload
    | SubmitProofReceiptInstructionPayload
    | { amount: bigint }
    | { root: string }
    | { pending: PublicKey }
    | { holder: PublicKey; role: RoleType; isActive: boolean; mintQuota?: bigint | null }
    | { address: PublicKey; reason: string }
    | { address: PublicKey }
    | Record<string, never>
): Uint8Array {
  let args: Uint8Array;

  switch (name) {
    case "initialize":
      args = encodeInitializeArgs(payload as InitializeInstructionPayload);
      break;
    case "mint":
    case "burn":
      args = encodeU64((payload as { amount: bigint }).amount);
      break;
    case "update_compliance_root":
      args = encodeString((payload as { root: string }).root);
      break;
    case "submit_proof_receipt":
      args = encodeSubmitProofReceiptArgs(payload as SubmitProofReceiptInstructionPayload);
      break;
    case "propose_authority":
      args = encodePubkey((payload as { pending: PublicKey }).pending);
      break;
    case "update_roles":
      args = encodeUpdateRoleArgs(
        payload as { holder: PublicKey; role: RoleType; isActive: boolean; mintQuota?: bigint | null }
      );
      break;
    case "add_to_blacklist": {
      const value = payload as { address: PublicKey; reason: string };
      args = concatBytes([encodePublicKeyArg(value.address), encodeString(value.reason)]);
      break;
    }
    case "freeze_account":
    case "thaw_account": {
      const value = payload as { address: PublicKey };
      args = encodePublicKeyArg(value.address);
      break;
    }
    case "pause":
    case "unpause":
    case "accept_authority":
    case "remove_from_blacklist":
    case "revoke_proof_receipt":
    case "seize":
      args = encodeNoArgs();
      break;
    default:
      throw new Error(`Unsupported instruction encoder: ${name}`);
  }

  return concatBytes([anchorDiscriminator(name), args]);
}

export function buildInstruction(
  programId: PublicKey,
  name: string,
  data: Uint8Array,
  keys: AccountMeta[]
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from(data)
  });
}

export function buildTransaction(instruction: TransactionInstruction): Transaction {
  return new Transaction().add(instruction);
}

export function readonly(pubkey: PublicKey, isSigner = false): AccountMeta {
  return { pubkey, isSigner, isWritable: false };
}

export function writable(pubkey: PublicKey, isSigner = false): AccountMeta {
  return { pubkey, isSigner, isWritable: true };
}

export function presetToFlags(preset: StablecoinPreset): Pick<
  InitializeInstructionPayload,
  | "enablePermanentDelegate"
  | "enableTransferHook"
  | "defaultAccountFrozen"
  | "enableConfidentialTransfers"
  | "enableZkComplianceProofs"
  | "enableCompressedComplianceState"
> {
  if (preset === "sss-3") {
    return {
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: true,
      enableConfidentialTransfers: true,
      enableZkComplianceProofs: true,
      enableCompressedComplianceState: true
    };
  }

  if (preset === "sss-2") {
    return {
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: true,
      enableConfidentialTransfers: false,
      enableZkComplianceProofs: false,
      enableCompressedComplianceState: false
    };
  }

  return {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    enableConfidentialTransfers: false,
    enableZkComplianceProofs: false,
    enableCompressedComplianceState: false
  };
}

export function coerceOptionalPubkey(value: PublicKey | string | null | undefined): PublicKey | null {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? new SolanaPublicKey(value) : value;
}
