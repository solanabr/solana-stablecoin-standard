import fs from "fs";
import os from "os";
import path from "path";
import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";

/** Path to the local project config that stores the active mint address. */
const SSS_CONFIG_FILE = ".sss-config.json";

export interface SssConfig {
  mint?: string;
  cluster?: string;
}

/** Load .sss-config.json from the current working directory, or return {}. */
export function loadSssConfig(): SssConfig {
  try {
    const raw = fs.readFileSync(SSS_CONFIG_FILE, "utf8");
    return JSON.parse(raw) as SssConfig;
  } catch {
    return {};
  }
}

/** Persist values to .sss-config.json (merge with existing). */
export function saveSssConfig(updates: SssConfig): void {
  const existing = loadSssConfig();
  const merged = { ...existing, ...updates };
  fs.writeFileSync(SSS_CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n");
}

/**
 * Load a Solana keypair from a JSON file.
 * Defaults to ~/.config/solana/id.json.
 */
export function loadKeypair(keypairPath?: string): Keypair {
  const filePath =
    keypairPath ?? path.join(os.homedir(), ".config", "solana", "id.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Resolve the cluster RPC URL from a cluster name or direct URL.
 * Supports: mainnet, devnet, testnet, localnet, or any http(s) URL.
 */
export function resolveCluster(cluster: string): string {
  switch (cluster) {
    case "mainnet":
    case "mainnet-beta":
      return clusterApiUrl("mainnet-beta");
    case "devnet":
      return clusterApiUrl("devnet");
    case "testnet":
      return clusterApiUrl("testnet");
    case "localnet":
    case "localhost":
      return "http://127.0.0.1:8899";
    default:
      return cluster; // treat as a direct URL
  }
}

/** Build a Solana Connection from the CLI --cluster option. */
export function makeConnection(cluster: string): Connection {
  return new Connection(resolveCluster(cluster), "confirmed");
}
