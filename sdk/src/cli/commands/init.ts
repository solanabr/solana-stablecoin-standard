import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Command } from "commander";
import { PublicKey, Connection } from "@solana/web3.js";
import * as toml from "toml";
import { StablecoinClient } from "../../client";
import { ComplianceClient } from "../../compliance";
import { PRESET_MINIMAL, PRESET_COMPLIANT, SSS_HOOK_PROGRAM_ID } from "../../constants";
import {
  getProvider,
  formatOutput,
  confirmAction,
  logSuccess,
  logError,
  logWarning,
  parsePublicKey,
} from "../utils";

// ---------------------------------------------------------------------------
// Preset resolution — accepts both string ("sss-1", "sss-2") and numeric (1, 2)
// ---------------------------------------------------------------------------

/** Maps user-facing preset strings to numeric preset values. */
const PRESET_MAP: Record<string, number> = {
  "sss-1": PRESET_MINIMAL,
  "sss-2": PRESET_COMPLIANT,
  "1": PRESET_MINIMAL,
  "2": PRESET_COMPLIANT,
};

function resolvePreset(value: string): number {
  const key = value.toLowerCase().trim();
  const preset = PRESET_MAP[key];
  if (preset === undefined) {
    throw new Error(
      `Invalid preset "${value}". ` +
      `Must be one of: sss-1, sss-2, 1, 2`
    );
  }
  return preset;
}

function presetLabel(preset: number): string {
  return preset === PRESET_MINIMAL ? "SSS-1 (Minimal)" : "SSS-2 (Compliant)";
}

// ---------------------------------------------------------------------------
// Custom config file parsing
// ---------------------------------------------------------------------------

interface CustomConfig {
  preset: number;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  hookProgram?: string;
}

function loadConfigFile(filePath: string): CustomConfig {
  const expanded = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;

  if (!fs.existsSync(expanded)) {
    throw new Error(`Config file not found: ${expanded}`);
  }

  const raw = fs.readFileSync(expanded, "utf8");
  const ext = path.extname(expanded).toLowerCase();

  let parsed: Record<string, unknown>;
  if (ext === ".toml") {
    parsed = toml.parse(raw) as Record<string, unknown>;
  } else if (ext === ".json") {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse JSON config file: ${expanded}`);
    }
  } else {
    throw new Error(
      `Unsupported config file format "${ext}". Use .toml or .json`
    );
  }

  // Resolve preset from config file (supports string or number)
  let preset: number;
  if (parsed.preset === undefined) {
    throw new Error("Config file must contain a 'preset' field (e.g. \"sss-1\", \"sss-2\", 1, or 2)");
  }
  if (typeof parsed.preset === "string") {
    preset = resolvePreset(parsed.preset);
  } else if (typeof parsed.preset === "number") {
    if (parsed.preset !== PRESET_MINIMAL && parsed.preset !== PRESET_COMPLIANT) {
      throw new Error(`Config file preset must be 1 or 2, got: ${parsed.preset}`);
    }
    preset = parsed.preset;
  } else {
    throw new Error(`Config file preset must be a string or number, got: ${typeof parsed.preset}`);
  }

  // Validate required fields
  if (typeof parsed.name !== "string" || !parsed.name) {
    throw new Error("Config file must contain a non-empty 'name' field");
  }
  if (typeof parsed.symbol !== "string" || !parsed.symbol) {
    throw new Error("Config file must contain a non-empty 'symbol' field");
  }

  const uri = typeof parsed.uri === "string" ? parsed.uri : "";

  let decimals = 6;
  if (parsed.decimals !== undefined) {
    if (typeof parsed.decimals !== "number" || !Number.isInteger(parsed.decimals)) {
      throw new Error("Config file 'decimals' must be an integer");
    }
    if (parsed.decimals < 0 || parsed.decimals > 9) {
      throw new Error(`Config file 'decimals' must be between 0 and 9, got: ${parsed.decimals}`);
    }
    decimals = parsed.decimals;
  }

  const hookProgram = typeof parsed.hook_program === "string"
    ? parsed.hook_program
    : typeof parsed.hookProgram === "string"
      ? parsed.hookProgram
      : undefined;

  return { preset, name: parsed.name, symbol: parsed.symbol, uri, decimals, hookProgram };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `init` command onto the given commander program.
 *
 * Supports three modes:
 *   sss-token init --preset sss-1 --name "..." --symbol "..."
 *   sss-token init --preset sss-2 --name "..." --symbol "..." --hook-program <pubkey>
 *   sss-token init --custom config.toml
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new stablecoin mint and config account")
    .option(
      "--preset <preset>",
      "Preset: sss-1 (Minimal), sss-2 (Compliant), or 1, 2"
    )
    .option("--name <string>", "Human-readable stablecoin name (e.g. \"USD Coin\")")
    .option("--symbol <string>", "Ticker symbol (e.g. USDC)")
    .option("--uri <string>", "URI to off-chain metadata JSON", "")
    .option("--decimals <number>", "Number of decimal places (0-9)", "6")
    .option("--hook-program <pubkey>", "Hook program ID (required for SSS-2)")
    .option("--custom <path>", "Load configuration from a TOML or JSON file")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      // ------------------------------------------------------------------
      // Resolve config: either from --custom file or from CLI flags
      // ------------------------------------------------------------------
      let preset: number;
      let name: string;
      let symbol: string;
      let uri: string;
      let decimals: number;
      let hookProgram: PublicKey | undefined;

      if (opts.custom) {
        // Mode: custom config file
        try {
          const cfg = loadConfigFile(opts.custom);
          preset = cfg.preset;
          name = cfg.name;
          symbol = cfg.symbol;
          uri = cfg.uri;
          decimals = cfg.decimals;
          if (cfg.hookProgram) {
            hookProgram = parsePublicKey(cfg.hookProgram, "config.hook_program");
          }
        } catch (err) {
          logError((err as Error).message);
          process.exit(1);
        }
      } else {
        // Mode: CLI flags (--preset + --name + --symbol)
        if (!opts.preset) {
          logError(
            "Either --preset <sss-1|sss-2> or --custom <path> is required.\n" +
            "  Examples:\n" +
            "    sss-token init --preset sss-1 --name \"My Coin\" --symbol MYC\n" +
            "    sss-token init --preset sss-2 --name \"My Coin\" --symbol MYC --hook-program <pubkey>\n" +
            "    sss-token init --custom config.toml"
          );
          process.exit(1);
        }

        try {
          preset = resolvePreset(opts.preset);
        } catch (err) {
          logError((err as Error).message);
          process.exit(1);
        }

        if (!opts.name) {
          logError("--name <string> is required when using --preset mode");
          process.exit(1);
        }
        if (!opts.symbol) {
          logError("--symbol <string> is required when using --preset mode");
          process.exit(1);
        }

        name = opts.name;
        symbol = opts.symbol;
        uri = opts.uri;

        decimals = parseInt(opts.decimals, 10);
        if (isNaN(decimals) || decimals < 0 || decimals > 9) {
          logError(`--decimals must be between 0 and 9, got: ${opts.decimals}`);
          process.exit(1);
        }

        if (opts.hookProgram) {
          try {
            hookProgram = parsePublicKey(opts.hookProgram, "--hook-program");
          } catch (err) {
            logError((err as Error).message);
            process.exit(1);
          }
        }
      }

      // SSS-2 requires a hook program — default to deployed program ID if not specified
      if (preset === PRESET_COMPLIANT && !hookProgram) {
        hookProgram = SSS_HOOK_PROGRAM_ID;
      }

      const label = presetLabel(preset);

      // ------------------------------------------------------------------
      // Dry run
      // ------------------------------------------------------------------
      if (dryRun) {
        const dryData = {
          action: "initialize",
          preset: label,
          name,
          symbol,
          uri,
          decimals,
          hookProgram: hookProgram?.toBase58() ?? null,
          keypair: keypairPath,
          cluster: url,
          ...(opts.custom ? { configFile: opts.custom } : {}),
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      // ------------------------------------------------------------------
      // Confirm and execute
      // ------------------------------------------------------------------
      const confirmed = await confirmAction(
        `Initialize a new ${label} stablecoin "${name}" (${symbol})?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");

        const client =
          preset === PRESET_COMPLIANT
            ? new ComplianceClient(connection, wallet)
            : new StablecoinClient(connection, wallet);

        const result = await client.initialize(
          { preset, name, symbol, uri, decimals },
          hookProgram
        );

        const output = {
          mint: result.mint.toBase58(),
          config: result.config.toBase58(),
          txSignature: result.txSig,
          preset: label,
          name,
          symbol,
          decimals,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Stablecoin initialized successfully`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to initialize stablecoin: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
