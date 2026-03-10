import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";

// ---------------------------------------------------------------------------
// Keypair helpers
// ---------------------------------------------------------------------------

/**
 * Load a Solana keypair from a JSON file.
 * The file must contain the secret key as a byte array (standard Solana CLI format).
 */
export function loadKeypair(keypairPath: string): Keypair {
  const expanded = keypairPath.startsWith("~")
    ? path.join(os.homedir(), keypairPath.slice(1))
    : keypairPath;

  if (!fs.existsSync(expanded)) {
    throw new Error(`Keypair file not found: ${expanded}`);
  }

  const raw = fs.readFileSync(expanded, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse keypair file as JSON: ${expanded}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Keypair file must contain a JSON array of bytes: ${expanded}`
    );
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/**
 * Create an AnchorProvider and NodeWallet from a URL and keypair path.
 */
export function getProvider(
  url: string,
  keypairPath: string
): { provider: AnchorProvider; wallet: Wallet } {
  const keypair = loadKeypair(keypairPath);
  const connection = new Connection(url, "confirmed");

  // AnchorProvider expects a Wallet-shaped object with publicKey + signTransaction/signAllTransactions
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(tx: T): Promise<T> => {
      if ("version" in tx) {
        (tx as import("@solana/web3.js").VersionedTransaction).sign([keypair]);
      } else {
        (tx as import("@solana/web3.js").Transaction).partialSign(keypair);
      }
      return tx;
    },
    signAllTransactions: async <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return txs.map((tx) => {
        if ("version" in tx) {
          (tx as import("@solana/web3.js").VersionedTransaction).sign([keypair]);
        } else {
          (tx as import("@solana/web3.js").Transaction).partialSign(keypair);
        }
        return tx;
      });
    },
  } as Wallet;

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  return { provider, wallet };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * Format a data value as table, json, or csv string.
 *
 * For table format the data may be a single object or an array of objects.
 * For csv format, column order is determined by the first row's keys.
 */
export function formatOutput(data: unknown, format: string): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, jsonReplacer, 2);

    case "csv": {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) return "";
      const headers = Object.keys(rows[0] as Row);
      const lines = [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const val = csvCell((row as Row)[h]);
              return val;
            })
            .join(",")
        ),
      ];
      return lines.join("\n");
    }

    case "table":
    default: {
      const rows = Array.isArray(data) ? data : [data];
      if (rows.length === 0) return "(no data)";
      const headers = Object.keys(rows[0] as Row);
      // Compute column widths
      const widths: number[] = headers.map((h) => h.length);
      const stringRows = rows.map((row) =>
        headers.map((h, i) => {
          const cell = stringify((row as Row)[h]);
          if (cell.length > widths[i]) widths[i] = cell.length;
          return cell;
        })
      );
      const separator = widths.map((w) => "-".repeat(w)).join("-+-");
      const header = headers
        .map((h, i) => h.padEnd(widths[i]))
        .join(" | ");
      const lines = [
        header,
        separator,
        ...stringRows.map((cells) =>
          cells.map((c, i) => c.padEnd(widths[i])).join(" | ")
        ),
      ];
      return lines.join("\n");
    }
  }
}

/** JSON.stringify replacer to handle BigInt, BN, and PublicKey values. */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  // BN objects have a .toString() and a words array
  if (
    value !== null &&
    typeof value === "object" &&
    "words" in value &&
    "length" in value
  ) {
    return (value as { toString(): string }).toString();
  }
  // PublicKey
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toBase58?: unknown }).toBase58 === "function"
  ) {
    return (value as { toBase58(): string }).toBase58();
  }
  return value;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  // BN
  if (
    typeof value === "object" &&
    "words" in (value as object) &&
    "length" in (value as object)
  ) {
    return (value as { toString(): string }).toString();
  }
  // PublicKey
  if (
    typeof value === "object" &&
    typeof (value as { toBase58?: unknown }).toBase58 === "function"
  ) {
    return (value as { toBase58(): string }).toBase58();
  }
  return String(value);
}

function csvCell(value: unknown): string {
  const s = stringify(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------

/**
 * Ask the user to confirm an action in the terminal.
 * Returns true immediately when skipConfirm is true.
 */
export async function confirmAction(
  message: string,
  skipConfirm: boolean
): Promise<boolean> {
  if (skipConfirm) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ---------------------------------------------------------------------------
// Colored log helpers
// ---------------------------------------------------------------------------

/** Print a green success message to stdout. */
export function logSuccess(msg: string): void {
  // Use ANSI codes so we have no extra runtime dependency beyond what's built-in.
  process.stdout.write(`\x1b[32m✓ ${msg}\x1b[0m\n`);
}

/** Print a red error message to stderr. */
export function logError(msg: string): void {
  process.stderr.write(`\x1b[31m✗ ${msg}\x1b[0m\n`);
}

/** Print a yellow warning message to stderr. */
export function logWarning(msg: string): void {
  process.stderr.write(`\x1b[33m⚠ ${msg}\x1b[0m\n`);
}

// ---------------------------------------------------------------------------
// PublicKey parsing helper
// ---------------------------------------------------------------------------

/**
 * Parse a string into a PublicKey; throws a user-friendly error on failure.
 */
export function parsePublicKey(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid public key for ${label}: "${value}"`);
  }
}
