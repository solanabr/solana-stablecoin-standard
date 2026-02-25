import fs from "fs";
import path from "path";
import { Command } from "commander";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadKeypair, makeConnection, saveSssConfig } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

interface ConfigFile {
  name: string;
  symbol: string;
  decimals?: number;
  uri?: string;
  preset?: "sss-1" | "sss-2";
}

/**
 * Parse a flat TOML file into a ConfigFile.
 * Handles strings (quoted or bare), numbers, and ignores comments / blank lines.
 */
export function parseToml(content: string): ConfigFile {
  const result: Record<string, string | number> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip inline comments (only outside quotes)
    if ((val.startsWith('"') && val.includes('"', 1)) || (val.startsWith("'") && val.includes("'", 1))) {
      const quote = val[0];
      const closeIdx = val.indexOf(quote, 1);
      val = val.slice(1, closeIdx);
    } else {
      const commentIdx = val.indexOf("#");
      if (commentIdx !== -1) val = val.slice(0, commentIdx).trim();
    }
    // Detect numbers
    result[key] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
  }
  return result as unknown as ConfigFile;
}

function loadConfigFile(filePath: string): ConfigFile {
  const raw = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".toml") {
    return parseToml(raw);
  }
  return JSON.parse(raw) as ConfigFile;
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Deploy a new stablecoin (SSS-1 or SSS-2)")
    .option("--name <name>", "Token name (max 32 chars)")
    .option("--symbol <symbol>", "Token symbol (max 10 chars)")
    .option("--preset <preset>", "Preset: sss-1 (default) or sss-2", "sss-1")
    .option("--decimals <n>", "Decimal places (default 6)", "6")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--config <path>", "Path to a JSON or TOML config file")
    .option("--custom <path>", "Alias for --config")
    .option("--mint-keypair <path>", "Path to fresh mint keypair JSON (auto-generated if omitted)")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; json: boolean };
      try {
        let name: string = opts.name;
        let symbol: string = opts.symbol;
        let decimals: number = parseInt(opts.decimals as string, 10);
        let uri: string = opts.uri ?? "";
        let preset: "sss-1" | "sss-2" = opts.preset;

        const configPath = opts.config ?? opts.custom;
        if (configPath) {
          const cfg = loadConfigFile(configPath);
          name = cfg.name ?? name;
          symbol = cfg.symbol ?? symbol;
          decimals = cfg.decimals ?? decimals;
          uri = cfg.uri ?? uri;
          preset = cfg.preset ?? preset;
        }

        if (!name || !symbol) {
          throw new Error("--name and --symbol are required (or provide them via --config).");
        }

        if (preset !== "sss-1" && preset !== "sss-2") {
          throw new Error(`Unknown preset "${preset}". Use sss-1 or sss-2.`);
        }

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const mint = opts.mintKeypair
          ? loadKeypair(opts.mintKeypair)
          : Keypair.generate();

        const coin = await SolanaStablecoin.create(connection, authority, mint, {
          name,
          symbol,
          decimals,
          uri,
          preset,
        });

        saveSssConfig({ mint: coin.mintAddress.toBase58() });

        printSuccess("Stablecoin deployed", {
          mint: coin.mintAddress.toBase58(),
          config: coin.configAddress.toBase58(),
          preset,
          "saved to": ".sss-config.json",
        });
      } catch (err) {
        printError(err);
      }
    });
}
