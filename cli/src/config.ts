import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const CONFIG_DIR = path.join(os.homedir(), ".config", "sss-token");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface CliConfig {
  rpcUrl: string;
  keypairPath: string;
  vaults: Record<string, VaultAlias>;
}

export interface VaultAlias {
  mint: string;
  preset: string;
}

const DEFAULTS: CliConfig = {
  rpcUrl: "https://api.devnet.solana.com",
  keypairPath: path.join(os.homedir(), ".config", "solana", "id.json"),
  vaults: {},
};

export function loadConfig(): CliConfig {
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

export function saveConfig(cfg: CliConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function initConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    console.log("Config already exists at", CONFIG_FILE);
    return;
  }
  saveConfig({ ...DEFAULTS });
  console.log("Config initialized at", CONFIG_FILE);
}
