import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { EXPLORER_URL } from "./constants";

/**
 * Merge class names, filtering out falsy values.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Truncate a Solana address for display.
 */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format a raw token amount (BN or number) to a human-readable string.
 * Assumes 6 decimals by default (standard for stablecoins).
 */
export function formatAmount(
  amount: BN | number | string,
  decimals = 6
): string {
  const raw =
    typeof amount === "string"
      ? BigInt(amount)
      : typeof amount === "number"
        ? BigInt(amount)
        : BigInt(amount.toString());

  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;

  const fractionStr = remainder.toString().padStart(decimals, "0").slice(0, 2);

  return `${whole.toLocaleString("en-US")}.${fractionStr}`;
}

/**
 * Build a Solana Explorer link for a given tx signature or address.
 */
export function explorerUrl(
  value: string,
  type: "tx" | "address" = "tx",
  cluster = "devnet"
): string {
  return `${EXPLORER_URL}/${type}/${value}?cluster=${cluster}`;
}

/**
 * Check if a string is a valid Solana public key.
 */
export function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a unix timestamp to a human-readable date.
 */
export function formatTimestamp(timestamp: BN | number): string {
  const ts =
    typeof timestamp === "number" ? timestamp : parseInt(timestamp.toString());
  if (ts === 0) return "Never";
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Check if a public key is the default (all zeros).
 */
export function isDefaultKey(key: string): boolean {
  return key === "11111111111111111111111111111111";
}
