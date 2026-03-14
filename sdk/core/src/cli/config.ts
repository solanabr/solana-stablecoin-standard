import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { PublicKey } from "@solana/web3.js";

export type CliOutputFormat = "text" | "json";
export type CliCluster = "localnet" | "devnet" | "mainnet-beta";

export interface CliPersistentConfig {
  rpcUrl: string;
  keypairPath: string;
  cluster: CliCluster;
  output: CliOutputFormat;
  mintAddress?: string;
  programId?: string;
}

export type CliConfigKey = keyof CliPersistentConfig;

export interface LoadedCliConfig extends CliPersistentConfig {
  configDir: string;
  configFile: string;
}

const DATA_DIR = path.join(os.homedir(), ".sss-token");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const CLUSTERS: CliCluster[] = ["localnet", "devnet", "mainnet-beta"];
const OUTPUT_FORMATS: CliOutputFormat[] = ["text", "json"];

export const CLI_CONFIG_KEYS: CliConfigKey[] = [
  "rpcUrl",
  "keypairPath",
  "cluster",
  "output",
  "mintAddress",
  "programId"
];

const DEFAULT_CONFIG: CliPersistentConfig = {
  rpcUrl: "http://127.0.0.1:8899",
  keypairPath: "~/.config/solana/id.json",
  cluster: "localnet",
  output: "text"
};

function ensureConfigDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStoredConfig(): Partial<CliPersistentConfig> {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<CliPersistentConfig>;
  } catch {
    return {};
  }
}

function writeStoredConfig(config: CliPersistentConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function validatePublicKey(value: string, key: "mintAddress" | "programId"): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`Invalid ${key}: ${value}`);
  }
}

export function isCliConfigKey(value: string): value is CliConfigKey {
  return CLI_CONFIG_KEYS.includes(value as CliConfigKey);
}

export function coerceCliConfigValue<K extends CliConfigKey>(key: K, value: string): CliPersistentConfig[K] {
  switch (key) {
    case "rpcUrl":
      return value as CliPersistentConfig[K];
    case "keypairPath":
      return value as CliPersistentConfig[K];
    case "cluster":
      if (!CLUSTERS.includes(value as CliCluster)) {
        throw new Error(`Invalid cluster: ${value}. Expected one of: ${CLUSTERS.join(", ")}`);
      }
      return value as CliPersistentConfig[K];
    case "output":
      if (!OUTPUT_FORMATS.includes(value as CliOutputFormat)) {
        throw new Error(`Invalid output format: ${value}. Expected one of: ${OUTPUT_FORMATS.join(", ")}`);
      }
      return value as CliPersistentConfig[K];
    case "mintAddress":
      return (value ? validatePublicKey(value, "mintAddress") : undefined) as CliPersistentConfig[K];
    case "programId":
      return (value ? validatePublicKey(value, "programId") : undefined) as CliPersistentConfig[K];
    default:
      throw new Error(`Unsupported config key: ${String(key)}`);
  }
}

export function normalizeCliConfig(input: Partial<CliPersistentConfig>): CliPersistentConfig {
  const normalized: CliPersistentConfig = { ...DEFAULT_CONFIG };

  for (const key of CLI_CONFIG_KEYS) {
    const next = input[key];
    if (typeof next !== "string" || next.length === 0) {
      continue;
    }
    normalized[key] = coerceCliConfigValue(key, next) as never;
  }

  return normalized;
}

export function loadCliConfig(): LoadedCliConfig {
  const stored = normalizeCliConfig(readStoredConfig());
  const envOverrides: Partial<CliPersistentConfig> = {
    rpcUrl: process.env.SSS_RPC_URL,
    keypairPath: process.env.SSS_KEYPAIR,
    cluster: process.env.SSS_CLUSTER as CliCluster | undefined,
    output: process.env.SSS_OUTPUT as CliOutputFormat | undefined,
    mintAddress: process.env.SSS_MINT_ADDRESS,
    programId: process.env.SSS_PROGRAM_ID
  };

  return {
    ...normalizeCliConfig({ ...stored, ...envOverrides }),
    configDir: DATA_DIR,
    configFile: CONFIG_FILE
  };
}

export function initializeCliConfigFile(): LoadedCliConfig {
  const config = loadCliConfig();
  writeStoredConfig({
    rpcUrl: config.rpcUrl,
    keypairPath: config.keypairPath,
    cluster: config.cluster,
    output: config.output,
    mintAddress: config.mintAddress,
    programId: config.programId
  });
  return config;
}

export function setCliConfigValue(key: string, value: string): LoadedCliConfig {
  if (!isCliConfigKey(key)) {
    throw new Error(`Unknown config key: ${key}. Expected one of: ${CLI_CONFIG_KEYS.join(", ")}`);
  }

  const current = loadCliConfig();
  const next: CliPersistentConfig = {
    rpcUrl: current.rpcUrl,
    keypairPath: current.keypairPath,
    cluster: current.cluster,
    output: current.output,
    mintAddress: current.mintAddress,
    programId: current.programId
  };

  next[key] = coerceCliConfigValue(key, value) as never;
  writeStoredConfig(next);

  return loadCliConfig();
}

export function getCliConfigPath(): string {
  return CONFIG_FILE;
}

export function showCliConfig(config = loadCliConfig()): Record<string, string> {
  return {
    rpcUrl: config.rpcUrl,
    keypairPath: config.keypairPath,
    cluster: config.cluster,
    output: config.output,
    mintAddress: config.mintAddress ?? "(not set)",
    programId: config.programId ?? "(not set)",
    configFile: config.configFile
  };
}

