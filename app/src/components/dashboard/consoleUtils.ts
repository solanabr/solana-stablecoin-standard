"use client";

import { PublicKey } from "@solana/web3.js";

const DEFAULT_PUBLIC_KEY = "11111111111111111111111111111111";

function toBase58(value: PublicKey | string | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.toBase58();
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

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
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
