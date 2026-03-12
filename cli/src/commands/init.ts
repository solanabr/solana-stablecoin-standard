import { Command } from "commander";
import { Keypair, PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import ora from "ora";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as toml from "toml";

import { SolanaStablecoin, Preset, sss1Preset, sss2Preset } from "@stbr/sss-token";
import type { StablecoinConfig } from "@stbr/sss-token";
import { loadConfig, saveConfig } from "../config";
import { buildProvider, buildProgram } from "../client";

export function registerInitCommand(program: Command): void {
  const init = program
    .command("init")
    .description("Initialize a new stablecoin")
    .option("--preset <preset>", "Preset: sss-1 or sss-2", "sss-1")
    .option("--name <name>", "Token name", "My Stablecoin")
    .option("--symbol <symbol>", "Token symbol", "MUSD")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <n>", "Decimal places", "6")
    .option("--custom <file>", "Path to custom TOML/JSON config file")
    .option("--keypair <path>", "Override keypair path")
    .option("--url <url>", "Override RPC URL")
    .option("--dry-run", "Simulate without submitting")
    .action(async (opts) => {
      const cfg = loadConfig();
      if (opts.keypair) cfg.keypairPath = opts.keypair;
      if (opts.url) cfg.rpcUrl = opts.url;

      let config: StablecoinConfig;
      const decimals = parseInt(opts.decimals, 10);

      if (opts.custom) {
        const raw = fs.readFileSync(opts.custom, "utf8");
        const parsed = opts.custom.endsWith(".toml") ? toml.parse(raw) : JSON.parse(raw);
        config = parsed as StablecoinConfig;
      } else if (opts.preset === "sss-2") {
        config = sss2Preset(opts.name, opts.symbol, { uri: opts.uri, decimals });
      } else {
        config = sss1Preset(opts.name, opts.symbol, { uri: opts.uri, decimals });
      }

      console.log(chalk.bold("\nInitializing stablecoin..."));
      console.log(chalk.gray("  Preset:   "), opts.custom ? "custom" : opts.preset);
      console.log(chalk.gray("  Name:     "), config.name);
      console.log(chalk.gray("  Symbol:   "), config.symbol);
      console.log(chalk.gray("  Decimals: "), config.decimals);
      if (config.enableTransferHook) console.log(chalk.yellow("  Transfer hook: enabled (SSS-2)"));
      if (config.enablePermanentDelegate) console.log(chalk.yellow("  Permanent delegate: enabled (SSS-2)"));
      if (config.defaultAccountFrozen) console.log(chalk.yellow("  Default account state: frozen (SSS-2)"));

      if (opts.dryRun) {
        console.log(chalk.blue("\n[dry-run] Would create stablecoin with above config."));
        return;
      }

      const spinner = ora("Submitting transaction...").start();
      try {
        const provider = buildProvider(cfg);
        anchor.setProvider(provider);

        // Load IDL (from local target after build, or from the package)
        let idl: any;
        try {
          idl = require("../../target/idl/sss_core.json");
        } catch {
          spinner.fail("IDL not found — run `anchor build` first.");
          return;
        }

        const programClient = buildProgram(provider, idl);
        const mintKeypair = Keypair.generate();

        const stable = await SolanaStablecoin.create(provider, programClient, {
          ...config,
          mintKeypair,
        });

        spinner.succeed(chalk.green("Stablecoin created!"));
        console.log(chalk.bold("\n  Mint:  "), stable.mint.toBase58());
        console.log(chalk.bold("  State: "), stable.statePda.toBase58());

        // Save alias
        const alias = `${config.symbol.toLowerCase()}-${Date.now()}`;
        cfg.vaults[alias] = { mint: stable.mint.toBase58(), preset: opts.preset };
        saveConfig(cfg);
        console.log(chalk.gray(`\n  Saved as alias: ${alias}`));
      } catch (err: any) {
        spinner.fail(chalk.red("Failed: " + err.message));
        process.exit(1);
      }
    });
}
