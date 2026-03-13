"use client";

import { PublicKey } from "@solana/web3.js";

export const DEFAULT_PUBLIC_KEY = "11111111111111111111111111111111";

function toBase58(value: PublicKey | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toBase58();
}

function addThousandsSeparators(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function normalizeAddress(value: string): string {
  return new PublicKey(value).toBase58();
}

export function isValidPublicKey(value: string): boolean {
  try {
    normalizeAddress(value);
    return true;
  } catch {
    return false;
  }
}

export function isDefaultPublicKey(
  value: PublicKey | string | null | undefined
): boolean {
  const address = toBase58(value);
  return !address || address === DEFAULT_PUBLIC_KEY;
}

export function shortAddress(
  value: PublicKey | string | null | undefined,
  start = 6,
  end = 4
): string {
  const address = toBase58(value);
  if (!address || address === DEFAULT_PUBLIC_KEY) return "(not set)";
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function parseTokenAmountInput(
  value: string,
  decimals: number
): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const [, whole = "0", fraction = ""] = match;
  if (fraction.length > decimals) return null;

  const digits = `${whole}${fraction.padEnd(decimals, "0")}`.replace(
    /^0+(?=\d)/,
    ""
  );

  return BigInt(digits || "0");
}

export function formatTokenAmount(
  value:
    | { toString(): string }
    | bigint
    | number
    | string
    | null
    | undefined,
  decimals: number,
  maxFractionDigits = Math.min(decimals, 6)
): string {
  if (value === null || value === undefined) return "--";

  const raw =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number"
        ? Math.trunc(value).toString()
        : value.toString();

  if (!/^-?\d+$/.test(raw)) return "--";

  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = decimals > 0 ? padded.slice(0, -decimals) : padded;
  const fraction = decimals > 0 ? padded.slice(-decimals) : "";
  const trimmedFraction = fraction
    .slice(0, Math.max(0, maxFractionDigits))
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${addThousandsSeparators(whole)}${
    trimmedFraction ? `.${trimmedFraction}` : ""
  }`;
}

function getExplorerClusterSuffix(): string {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim();
  if (network) {
    if (network === "mainnet-beta") return "";
    if (network === "devnet" || network === "testnet") return `?cluster=${network}`;
    return `?cluster=custom&customUrl=${encodeURIComponent(network)}`;
  }

  const rpc = process.env.NEXT_PUBLIC_RPC_URL?.trim();
  if (rpc) {
    if (rpc.includes("mainnet")) return "";
    if (rpc.includes("devnet")) return "?cluster=devnet";
    if (rpc.includes("testnet")) return "?cluster=testnet";
    return `?cluster=custom&customUrl=${encodeURIComponent(rpc)}`;
  }

  return "?cluster=devnet";
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${getExplorerClusterSuffix()}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}${getExplorerClusterSuffix()}`;
}

export function formatTimestamp(
  value: number | string | Date | null | undefined
): string {
  if (value === null || value === undefined || value === "") return "--";

  const date =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(value < 1_000_000_000_000 ? value * 1000 : value)
        : new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(
  unixSeconds: number | null | undefined
): string {
  if (!unixSeconds) return "--";

  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return formatTimestamp(unixSeconds);
}
