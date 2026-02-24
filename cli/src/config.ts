import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as toml from "toml";
import dotenv from "dotenv";
import chalk from "chalk";

dotenv.config();

export interface CliConfig {
  connection: Connection;
  keypair: Keypair;
  mint?: PublicKey;
  cluster: string;
}

const DEFAULT_CONFIG_PATH = path.join(
  process.env.HOME || "~",
  ".config",
  "sss-token",
  "config.toml"
);

export function loadConfig(overrides: {
  keypair?: string;
  url?: string;
  mint?: string;
} = {}): CliConfig {
  // Load config file if it exists
  let fileConfig: Record<string, any> = {};
  const configPath = process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH;
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = toml.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (_) {
      // ignore parse errors — env/flags take priority
    }
  }

  // Resolve cluster/RPC URL (priority: flag > env > config file > default devnet)
  const clusterUrl =
    overrides.url ||
    process.env.SSS_RPC_URL ||
    fileConfig.rpc_url ||
    "https://api.devnet.solana.com";

  const cluster = clusterUrl.includes("mainnet")
    ? "mainnet-beta"
    : clusterUrl.includes("devnet")
    ? "devnet"
    : "localnet";

  const connection = new Connection(clusterUrl, "confirmed");

  // Resolve keypair (priority: flag > env > config file > default Solana CLI keypair)
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

  // Resolve mint
  const mintStr =
    overrides.mint || process.env.SSS_MINT || fileConfig.mint;
  const mint = mintStr ? new PublicKey(mintStr) : undefined;

  return { connection, keypair, mint, cluster };
}

export function requireMint(config: CliConfig): PublicKey {
  if (!config.mint) {
    console.error(
      chalk.red("No mint address configured.")
    );
    console.error(
      chalk.yellow(
        "Set SSS_MINT env var, or add 'mint' to your config file, or pass --mint flag"
      )
    );
    process.exit(1);
  }
  return config.mint;
}

export function saveMintToConfig(mint: PublicKey): void {
  const configDir = path.dirname(
    process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH
  );
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configPath = process.env.SSS_CONFIG || DEFAULT_CONFIG_PATH;
  let existing: Record<string, any> = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = toml.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (_) {}
  }
  existing.mint = mint.toBase58();
  // Write as key=value TOML
  const content = Object.entries(existing)
    .map(([k, v]) => `${k} = "${v}"`)
    .join("\n");
  fs.writeFileSync(configPath, content + "\n");
}