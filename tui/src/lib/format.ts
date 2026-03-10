import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Truncate a base58 address to first 4 + last 4 characters.
 */
export function truncateAddress(address: PublicKey | string): string {
  const str = typeof address === "string" ? address : address.toBase58();
  if (str.length <= 10) return str;
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

/**
 * Format a raw token amount with decimals and thousand separators.
 */
export function formatAmount(amount: BN | number | bigint, decimals: number = 6): string {
  let raw: bigint;
  if (BN.isBN(amount)) {
    raw = BigInt(amount.toString());
  } else {
    raw = BigInt(amount);
  }

  const divisor = BigInt(10 ** decimals);
  const intPart = raw / divisor;
  const fracPart = raw % divisor;

  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (decimals === 0) return intStr;

  const fracStr = fracPart.toString().padStart(decimals, "0");
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = fracStr.replace(/0+$/, "").padEnd(Math.min(2, decimals), "0");

  return trimmed.length > 0 ? `${intStr}.${trimmed}` : intStr;
}

/**
 * Format a timestamp to HH:MM:SS.
 */
export function formatTimestamp(date?: Date): string {
  const d = date || new Date();
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Get a human-readable preset name.
 */
export function presetName(preset: number): string {
  switch (preset) {
    case 1:
      return "SSS-1 (Minimal)";
    case 2:
      return "SSS-2 (Compliant)";
    default:
      return `Unknown (${preset})`;
  }
}

/**
 * Get the network name from an RPC URL.
 */
export function networkName(rpcUrl: string): string {
  if (rpcUrl.includes("devnet")) return "devnet";
  if (rpcUrl.includes("testnet")) return "testnet";
  if (rpcUrl.includes("mainnet") || rpcUrl.includes("api.mainnet")) return "mainnet-beta";
  if (rpcUrl.includes("localhost") || rpcUrl.includes("127.0.0.1")) return "localnet";
  return "custom";
}

/**
 * Calculate percentage used.
 */
export function percentUsed(minted: BN, quota: BN): number {
  if (quota.isZero()) return 0;
  return Math.min(100, minted.muln(100).div(quota).toNumber());
}
