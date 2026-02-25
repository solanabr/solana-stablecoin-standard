import { PublicKey } from "@solana/web3.js";

export function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
