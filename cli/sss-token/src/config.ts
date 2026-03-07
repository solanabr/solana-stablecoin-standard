import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import toml from "toml";

const DEFAULT_CONFIG_PATH = path.join(
  os.homedir(),
  ".config",
  "sss-token",
  "config.toml"
);

const DEFAULT_SOLANA_KEYPAIR = path.join(
  os.homedir(),
  ".config",
  "solana",
  "id.json"
);

export interface CliConfig {
  rpc_url: string;
  keypair_path: string;
  program_id: string;
  hook_program_id: string;
  mint?: string;
}

const DEFAULTS: CliConfig = {
  rpc_url: "http://localhost:8899",
  keypair_path: DEFAULT_SOLANA_KEYPAIR,
  program_id: "AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm",
  hook_program_id: "9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7",
};

export function loadConfig(configPath?: string): CliConfig {
  const cfgPath = configPath ?? DEFAULT_CONFIG_PATH;
  let fileConfig: Partial<CliConfig> = {};

  if (fs.existsSync(cfgPath)) {
    const raw = fs.readFileSync(cfgPath, "utf8");
    fileConfig = toml.parse(raw) as Partial<CliConfig>;
  }

  return { ...DEFAULTS, ...fileConfig };
}

export function getConnection(cfg: CliConfig): Connection {
  return new Connection(cfg.rpc_url, "confirmed");
}

export function loadKeypair(cfg: CliConfig): Keypair {
  const kpPath = cfg.keypair_path;
  if (!fs.existsSync(kpPath)) {
    throw new Error(`Keypair file not found: ${kpPath}`);
  }
  const secret = JSON.parse(fs.readFileSync(kpPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export function resolveMint(cfg: CliConfig, mintFlag?: string): PublicKey {
  const mintStr = mintFlag ?? cfg.mint;
  if (!mintStr) {
    throw new Error(
      "No mint address. Use --mint <pubkey> or set mint in config.toml"
    );
  }
  return new PublicKey(mintStr);
}
