import { Command } from "commander";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { StablecoinClient } from "../../client";
import { ComplianceClient } from "../../compliance";
import { PRESET_MINIMAL, PRESET_COMPLIANT } from "../../constants";
import {
  getProvider,
  formatOutput,
  confirmAction,
  logSuccess,
  logError,
  logWarning,
  parsePublicKey,
} from "../utils";

/**
 * Register the `init` command onto the given commander program.
 *
 * Usage: sss-token init --preset <1|2> --name <name> --symbol <sym> [options]
 */
export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new stablecoin mint and config account")
    .requiredOption("--preset <number>", "Preset: 1 = SSS-1 (Minimal), 2 = SSS-2 (Compliant)")
    .requiredOption("--name <string>", "Human-readable stablecoin name (e.g. \"USD Coin\")")
    .requiredOption("--symbol <string>", "Ticker symbol (e.g. USDC)")
    .option("--uri <string>", "URI to off-chain metadata JSON", "")
    .option("--decimals <number>", "Number of decimal places (0-9)", "6")
    .option("--hook-program <pubkey>", "Hook program ID (required for preset 2)")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      // Validate preset
      const preset = parseInt(opts.preset, 10);
      if (preset !== PRESET_MINIMAL && preset !== PRESET_COMPLIANT) {
        logError(`--preset must be 1 or 2, got: ${opts.preset}`);
        process.exit(1);
      }

      // Validate decimals
      const decimals = parseInt(opts.decimals, 10);
      if (isNaN(decimals) || decimals < 0 || decimals > 9) {
        logError(`--decimals must be between 0 and 9, got: ${opts.decimals}`);
        process.exit(1);
      }

      // Validate hook program for preset 2
      let hookProgram: PublicKey | undefined;
      if (preset === PRESET_COMPLIANT) {
        if (!opts.hookProgram) {
          logError("--hook-program <pubkey> is required when --preset is 2");
          process.exit(1);
        }
        try {
          hookProgram = parsePublicKey(opts.hookProgram, "--hook-program");
        } catch (err) {
          logError((err as Error).message);
          process.exit(1);
        }
      }

      const presetLabel = preset === PRESET_MINIMAL ? "SSS-1 (Minimal)" : "SSS-2 (Compliant)";

      if (dryRun) {
        const dryData = {
          action: "initialize",
          preset: presetLabel,
          name: opts.name,
          symbol: opts.symbol,
          uri: opts.uri,
          decimals,
          hookProgram: hookProgram?.toBase58() ?? null,
          keypair: keypairPath,
          cluster: url,
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      const confirmed = await confirmAction(
        `Initialize a new ${presetLabel} stablecoin "${opts.name}" (${opts.symbol})?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);

        // Use ComplianceClient for SSS-2 so hook methods are available;
        // StablecoinClient suffices for SSS-1.
        const client =
          preset === PRESET_COMPLIANT
            ? new ComplianceClient(
                new (require("@solana/web3.js").Connection)(url, "confirmed"),
                wallet
              )
            : new StablecoinClient(
                new (require("@solana/web3.js").Connection)(url, "confirmed"),
                wallet
              );

        const result = await client.initialize(
          { preset, name: opts.name, symbol: opts.symbol, uri: opts.uri, decimals },
          hookProgram
        );

        const output = {
          mint: result.mint.toBase58(),
          config: result.config.toBase58(),
          txSignature: result.txSig,
          preset: presetLabel,
          name: opts.name,
          symbol: opts.symbol,
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
