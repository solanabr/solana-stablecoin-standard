import { Command } from "commander";
import * as fs from "fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import chalk from "chalk";
import { getConnection, loadConfig, loadKeypair } from "../config";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Initialize a new stablecoin mint")
    .option("--preset <preset>", "sss-1 or sss-2", "sss-1")
    .option("--custom <path>", "Path to a TOML/JSON config file")
    .option("--name <name>", "Token name")
    .option("--symbol <symbol>", "Token symbol")
    .option("--decimals <n>", "Token decimals", "6")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);

      let initParams: Record<string, unknown> = {
        name: opts.name ?? "My Stablecoin",
        symbol: opts.symbol ?? "MYST",
        uri: opts.uri,
        decimals: parseInt(opts.decimals, 10),
      };

      // Load custom config if provided
      if (opts.custom) {
        if (!fs.existsSync(opts.custom)) {
          console.error(chalk.red(`Config file not found: ${opts.custom}`));
          process.exit(1);
        }
        const raw = fs.readFileSync(opts.custom, "utf8");
        const custom = opts.custom.endsWith(".json")
          ? JSON.parse(raw)
          : require("toml").parse(raw);
        initParams = { ...initParams, ...custom };
      }

      const preset =
        opts.preset === "sss-2" ? Presets.SSS_2 : Presets.SSS_1;

      const hookProgramId = new PublicKey(cfg.hook_program_id);

      console.log(
        chalk.cyan(
          `Initializing ${opts.preset.toUpperCase()} stablecoin: ${initParams.name} (${initParams.symbol})`
        )
      );

      const stable = await SolanaStablecoin.create(connection, {
        ...(initParams as unknown as Parameters<typeof SolanaStablecoin.create>[1]),
        preset,
        authority,
        ...(preset === Presets.SSS_2 ? { transferHookProgramId: hookProgramId } : {}),
      });

      console.log(chalk.green("✓ Stablecoin initialized!"));
      console.log(`  Mint:      ${stable.mint.toBase58()}`);
      console.log(`  Preset:    ${opts.preset.toUpperCase()}`);
      console.log(`  Authority: ${authority.publicKey.toBase58()}`);
      console.log(
        chalk.dim("\nAdd to your config.toml:"),
        `\n  mint = "${stable.mint.toBase58()}"`
      );
    });
}
