/**
 * CLI shared helpers — connection, wallet, formatting utilities.
 * @internal
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Connection ─────────────────────────────────────────────────────────

/**
 * Resolve the RPC URL from --url flag, ANCHOR_PROVIDER_URL, or Solana CLI config.
 */
export function resolveRpcUrl(urlFlag?: string): string {
  if (urlFlag) return urlFlag;

  // Check Anchor env
  if (process.env.ANCHOR_PROVIDER_URL) return process.env.ANCHOR_PROVIDER_URL;

  // Try Solana CLI config
  const configPath = path.join(os.homedir(), ".config", "solana", "cli", "config.yml");
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, "utf8");
    const match = content.match(/json_rpc_url:\s*"?([^\s"]+)"?/);
    if (match) return match[1];
  }

  return clusterApiUrl("devnet");
}

/**
 * Create a Connection from a resolved RPC URL.
 */
export function getConnection(urlFlag?: string): Connection {
  const url = resolveRpcUrl(urlFlag);
  return new Connection(url, "confirmed");
}

// ── Wallet ─────────────────────────────────────────────────────────────

/**
 * Load a keypair from file path or default Solana CLI keypair.
 */
export function loadKeypair(keypairPath?: string): Keypair {
  const resolvedPath = keypairPath ??
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config", "solana", "id.json");

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Keypair file not found: ${resolvedPath}\nRun 'solana-keygen new' to create one.`);
  }

  const raw = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * Create an Anchor Wallet from a keypair.
 */
export function getWallet(keypairPath?: string): Wallet {
  return new Wallet(loadKeypair(keypairPath));
}

// ── TOML Config ────────────────────────────────────────────────────────

export interface TomlConfig {
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  preset?: string;
  extensions?: {
    permanent_delegate?: boolean;
    transfer_hook?: boolean;
    default_account_frozen?: boolean;
    confidential_transfers?: boolean;
  };
  roles?: {
    pauser?: string;
    blacklister?: string;
    seizer?: string;
  };
}

/**
 * Load a stablecoin config from a TOML file.
 */
export function loadTomlConfig(configPath: string): TomlConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const content = fs.readFileSync(configPath, "utf8");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const toml = require("@iarna/toml");
  return toml.parse(content) as unknown as TomlConfig;
}

// ── Formatting ─────────────────────────────────────────────────────────

/**
 * Shorten a public key for display.
 */
export function shortKey(key: PublicKey | string): string {
  const str = typeof key === "string" ? key : key.toBase58();
  return `${str.slice(0, 4)}..${str.slice(-4)}`;
}

/**
 * Format a token amount with decimals.
 */
export function formatAmount(amount: bigint | number, decimals: number): string {
  const num = typeof amount === "bigint" ? Number(amount) : amount;
  return (num / 10 ** decimals).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

/**
 * Safe console output with color.
 */
export const log = {
  success: (msg: string) => console.log(`✅ ${msg}`),
  error: (msg: string) => console.error(`❌ ${msg}`),
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  tx: (sig: string, url?: string) => {
    const explorer = url ?? resolveRpcUrl();
    const isDevnet = explorer.includes("devnet");
    const isLocal = explorer.includes("localhost") || explorer.includes("127.0.0.1");
    const cluster = isLocal ? "custom" : isDevnet ? "devnet" : "mainnet-beta";
    console.log(`🔗 https://explorer.solana.com/tx/${sig}?cluster=${cluster}`);
  },
};
