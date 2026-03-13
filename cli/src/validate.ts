import { PublicKey } from "@solana/web3.js";

export function requirePositional(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing${label}`);
  }
  return value;
}

export function parseRequiredPublicKey(value: string | undefined, label: string): PublicKey {
  return new PublicKey(requirePositional(value, label));
}

export function parseRequiredBigInt(value: string | undefined, label: string): bigint {
  const parsed = BigInt(requirePositional(value, label));
  if (parsed <= 0n) {
    throw new Error(`Invalid${label}`);
  }
  return parsed;
}
