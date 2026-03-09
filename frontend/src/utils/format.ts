import BN from "bn.js";

// ── Address formatting ──────────────────────────────────────────────────────

/**
 * Truncate a base58 public-key string for display.
 * e.g. "GmG49Q2d..." → "GmG4...Zi4"
 */
export function truncateAddress(
  address: string,
  startChars = 4,
  endChars = 4
): string {
  if (!address || address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

// ── Number formatting ───────────────────────────────────────────────────────

/**
 * Format a BN token amount with the given number of decimals.
 * Handles values up to 2^53 safely for display purposes.
 */
export function formatTokenAmount(amount: BN, decimals: number): string {
  if (amount.isZero()) return "0";

  const amountStr = amount.toString(10);
  const divisorStr = "1" + "0".repeat(decimals);
  const divisor = new BN(divisorStr);

  const wholePart = amount.div(divisor).toString(10);
  const remainder = amount.mod(divisor);

  if (remainder.isZero()) {
    return formatNumber(Number(wholePart));
  }

  // Pad remainder to `decimals` digits
  const remStr = remainder.toString(10).padStart(decimals, "0");
  // Trim trailing zeros and limit to 6 significant decimal places
  const trimmed = remStr.replace(/0+$/, "").slice(0, 6);

  const full = Number(`${wholePart}.${trimmed}`);
  return formatNumber(full, trimmed.length);
}

/**
 * Format a plain JS number with locale-aware thousands separators.
 */
export function formatNumber(n: number, decimals?: number): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals !== undefined ? decimals : 0,
    maximumFractionDigits: decimals !== undefined ? decimals : 2,
  });
}

/**
 * Compact-format large numbers (K, M, B).
 * e.g. 1_500_000 → "1.5M"
 */
export function formatCompact(n: number): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return formatNumber(n);
}

/**
 * Format a BN token amount compactly (for stat cards).
 */
export function formatTokenCompact(amount: BN, decimals: number): string {
  const divisorStr = "1" + "0".repeat(decimals);
  const divisor = new BN(divisorStr);
  const whole = amount.div(divisor).toNumber();
  const rem = amount.mod(divisor);
  const fracPart = rem.toNumber() / Math.pow(10, decimals);
  return formatCompact(whole + fracPart);
}

// ── Transaction link ────────────────────────────────────────────────────────

export function explorerTxUrl(signature: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function explorerAddressUrl(address: string, cluster = "devnet"): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

// ── Preset labels ───────────────────────────────────────────────────────────

export function presetLabel(preset: number): string {
  switch (preset) {
    case 0:  return "SSS-1 (Basic)";
    case 1:  return "SSS-2 (Compliance)";
    case 2:  return "SSS-3 (Full)";
    default: return `Preset ${preset}`;
  }
}

export function roleLabel(role: number): string {
  switch (role) {
    case 0:  return "Minter";
    case 1:  return "Burner";
    case 2:  return "Seizer";
    case 3:  return "Pauser";
    case 4:  return "Compliance Officer";
    default: return `Role ${role}`;
  }
}

// ── Date / time ─────────────────────────────────────────────────────────────

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year:   "numeric",
    month:  "short",
    day:    "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
  });
}
