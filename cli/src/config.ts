import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as toml from "toml";
import dotenv from "dotenv";
import chalk from "chalk";

dotenv.config();

export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

export interface CliConfig {
  connection: Connection;
  keypair: Keypair;
  currentMint?: PublicKey;
  mints: Map<string, string>; // alias -> mint address
  cluster: string;
  rpcUrl: string;
}

const DEFAULT_CONFIG_PATH = path.join(
  process.env.HOME || "~",
  ".config",
  "sss-token",
  "config.toml"
);

interface ConfigFile {
  rpc_url?: string;
  keypair?: string;
  default_mint?: string;
  mints?: Record<string, string>; // alias -> mint address
}

export function getConfigPath(): string {
  return process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH;
}

function readConfigFileUnsafe(configPath: string): ConfigFile {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    return toml.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfigFile(configPath: string, existing: ConfigFile): void {
  const content: string[] = [];

  content.push(`rpc_url = "${existing.rpc_url || DEFAULT_RPC_URL}"`);
  if (existing.keypair) content.push(`keypair = "${existing.keypair}"`);
  if (existing.default_mint) content.push(`default_mint = "${existing.default_mint}"`);

  content.push("\n[mints]");
  Object.entries(existing.mints || {}).forEach(([alias, address]) => {
    content.push(`${alias} = "${address}"`);
  });

  fs.writeFileSync(configPath, content.join("\n") + "\n");
}

export function ensureConfigFile(): string {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const existing = readConfigFileUnsafe(configPath);
  const needsWrite =
    !fs.existsSync(configPath) ||
    !existing.rpc_url ||
    existing.mints === undefined;

  if (needsWrite) {
    writeConfigFile(configPath, {
      ...existing,
      rpc_url: existing.rpc_url || DEFAULT_RPC_URL,
      mints: existing.mints || {},
    });
  }

  return configPath;
}

export function getStoredConfig(): { rpcUrl: string; defaultMint?: string } {
  const configPath = ensureConfigFile();
  const existing = readConfigFileUnsafe(configPath);

  return {
    rpcUrl: existing.rpc_url || DEFAULT_RPC_URL,
    defaultMint: existing.default_mint,
  };
}

export function setRpcUrl(rpcUrl: string): void {
  try {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("RPC URL must start with http:// or https://");
    }
  } catch {
    console.error(chalk.red(`Invalid RPC URL: ${rpcUrl}`));
    process.exit(1);
  }

  const configPath = ensureConfigFile();
  const existing = readConfigFileUnsafe(configPath);
  writeConfigFile(configPath, {
    ...existing,
    rpc_url: rpcUrl,
    mints: existing.mints || {},
  });
}

export function loadConfig(overrides: {
  keypair?: string;
  url?: string;
  mint?: string;
} = {}): CliConfig {
  const configPath = ensureConfigFile();
  const fileConfig = readConfigFileUnsafe(configPath);

  const rpcUrl =
    overrides.url ||
    process.env.SSS_RPC_URL ||
    fileConfig.rpc_url ||
    DEFAULT_RPC_URL;

  const cluster = rpcUrl.includes("mainnet")
    ? "mainnet-beta"
    : rpcUrl.includes("devnet")
    ? "devnet"
    : "localnet";

  const connection = new Connection(rpcUrl, "confirmed");

  // Resolve keypair
  const keypairPath =
    overrides.keypair ||
    process.env.SSS_KEYPAIR ||
    fileConfig.keypair ||
    path.join(process.env.HOME || "~", ".config", "solana", "id.json");

  if (!fs.existsSync(keypairPath)) {
    console.error(chalk.red(`Keypair not found: ${keypairPath}`));
    console.error(
      chalk.yellow("Set SSS_KEYPAIR env var or pass --keypair flag")
    );
    process.exit(1);
  }

  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(keypairPath, "utf-8"))
  );
  const keypair = Keypair.fromSecretKey(secretKey);

  // Build mints map
  const mints = new Map<string, string>();
  if (fileConfig.mints) {
    Object.entries(fileConfig.mints).forEach(([alias, address]) => {
      mints.set(alias, address);
    });
  }

  // Resolve current mint (priority: flag > env > config default)
  const mintStr =
    overrides.mint || process.env.SSS_MINT || fileConfig.default_mint;
  const currentMint = mintStr ? new PublicKey(mintStr) : undefined;

  return { connection, keypair, currentMint, mints, cluster, rpcUrl };
}

export function requireMint(config: CliConfig, mintArg?: string): PublicKey {
  // If mint arg provided, use it directly
  if (mintArg) {
    try {
      return new PublicKey(mintArg);
    } catch {
      // If it's not a valid pubkey, try as alias
      const aliasMint = config.mints.get(mintArg);
      if (aliasMint) {
        return new PublicKey(aliasMint);
      }
      console.error(chalk.red(`Invalid mint address or alias: ${mintArg}`));
      process.exit(1);
    }
  }

  // Fall back to current mint
  if (!config.currentMint) {
    console.error(
      chalk.red("No mint address configured.")
    );
    console.error(
      chalk.yellow(
        "Options:\n" +
        "  1. Set SSS_MINT env var\n" +
        "  2. Add 'default_mint' to your config file\n" +
        "  3. Pass --mint flag with address or alias\n" +
        "  4. Use 'sss-token use <alias>' to set default"
      )
    );
    process.exit(1);
  }
  return config.currentMint;
}

export function saveMintToConfig(mint: PublicKey, alias?: string): void {
  const configPath = ensureConfigFile();
  const existing = readConfigFileUnsafe(configPath);

  if (!existing.mints) {
    existing.mints = {};
  }

  const mintAlias = alias || `token${Object.keys(existing.mints).length + 1}`;
  existing.mints[mintAlias] = mint.toBase58();

  if (!existing.default_mint) {
    existing.default_mint = mint.toBase58();
  }

  writeConfigFile(configPath, {
    ...existing,
    rpc_url: existing.rpc_url || DEFAULT_RPC_URL,
    mints: existing.mints,
  });

  console.log(chalk.green(`✓ Saved mint ${mintAlias} (${mint.toBase58()}) to config`));
}

export function setDefaultMint(aliasOrAddress: string): void {
  const configPath = ensureConfigFile();
  const existing = readConfigFileUnsafe(configPath);
  
  // Check if it's an alias
  if (existing.mints && existing.mints[aliasOrAddress]) {
    existing.default_mint = existing.mints[aliasOrAddress];
    console.log(chalk.green(`✓ Default mint set to ${aliasOrAddress} (${existing.mints[aliasOrAddress]})`));
  } else {
    // Try as direct address
    try {
      new PublicKey(aliasOrAddress);
      existing.default_mint = aliasOrAddress;
      console.log(chalk.green(`✓ Default mint set to ${aliasOrAddress}`));
    } catch {
      console.error(chalk.red(`No mint found with alias or address: ${aliasOrAddress}`));
      process.exit(1);
    }
  }

  writeConfigFile(configPath, {
    ...existing,
    rpc_url: existing.rpc_url || DEFAULT_RPC_URL,
    mints: existing.mints || {},
  });
}