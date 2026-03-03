import { BN } from "@coral-xyz/anchor";

const BASE58_CHARS = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Returns true if the string looks like a valid Solana base58 public key
 * (32–44 characters, base58 alphabet only).
 */
export function isValidPublicKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 44 &&
    BASE58_CHARS.test(value)
  );
}

/**
 * Returns true if the string represents a positive integer (no decimals,
 * no sign prefix, no leading zeros beyond "0" itself).
 */
export function isValidAmount(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]*$/.test(value)
  );
}

/**
 * Computes circulating supply as totalMinted - totalBurned.
 */
export function circulatingSupply(totalMinted: BN, totalBurned: BN): BN {
  return totalMinted.sub(totalBurned);
}
