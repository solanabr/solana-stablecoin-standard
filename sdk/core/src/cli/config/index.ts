import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export interface CliConfig {
  rpcUrl: string;
  keypairPath: string;
  programId: string;
  mint?: string;
}

const DEFAULT_CONFIG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".config",
  "sss-token",
  "config.json"
);

export function loadConfig(configPath?: string): CliConfig {
  const p = configPath || DEFAULT_CONFIG_PATH;
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  }
  return {
    rpcUrl: "https://api.devnet.solana.com",
    keypairPath: path.join(
      process.env.HOME || process.env.USERPROFILE || ".",
      ".config",
      "solana",
      "id.json"
    ),
    programId: "SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz",
  };
}

export function saveConfig(config: CliConfig, configPath?: string): void {
  const p = configPath || DEFAULT_CONFIG_PATH;
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(config, null, 2));
}

export function loadKeypair(keypairPath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

export function getConnection(config: CliConfig): Connection {
  return new Connection(config.rpcUrl, "confirmed");
}

export function getProgramId(config: CliConfig): PublicKey {
  return new PublicKey(config.programId);
}
