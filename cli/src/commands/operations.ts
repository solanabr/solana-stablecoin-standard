import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import ora from "ora";
import * as anchor from "@coral-xyz/anchor";
import { table } from "table";

import { SolanaStablecoin } from "@stbr/sss-token";
import { loadConfig } from "../config";
import { buildProvider, buildProgram } from "../client";

function getProgram(cfg: ReturnType<typeof loadConfig>) {
  const provider = buildProvider(cfg);
  anchor.setProvider(provider);
  let idl: any;
  try {
    idl = require("../../target/idl/sss_core.json");
  } catch {
    console.error(chalk.red("IDL not found — run `anchor build` first."));
    process.exit(1);
  }
  return { provider, program: buildProgram(provider, idl) };
}

function resolveMint(alias: string, cfg: ReturnType<typeof loadConfig>): PublicKey {
  if (cfg.vaults[alias]) {
    return new PublicKey(cfg.vaults[alias].mint);
  }
  // Try as direct pubkey
  try {
    return new PublicKey(alias);
  } catch {
    console.error(chalk.red(`Unknown alias or invalid pubkey: ${alias}`));
    process.exit(1);
  }
}

export function registerOperationCommands(program: Command): void {
  // status
  program
    .command("status <mint>")
    .description("Show stablecoin status and config")
    .action(async (mintArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const state = await stable.getState();
      const supply = await stable.getTotalSupply();

      console.log(chalk.bold(`\n${state.name} (${state.symbol})`));
      console.log(chalk.gray("Mint:      "), mint.toBase58());
      console.log(chalk.gray("Authority: "), state.authority.toBase58());
      console.log(chalk.gray("Preset:    "), state.preset === 2 ? "SSS-2" : "SSS-1");
      console.log(chalk.gray("Decimals:  "), state.decimals);
      console.log(chalk.gray("Paused:    "), state.paused ? chalk.red("YES") : chalk.green("NO"));
      console.log(chalk.gray("Supply:    "), supply.toString());
      if (state.enableTransferHook) console.log(chalk.yellow("Transfer hook: enabled"));
      if (state.enablePermanentDelegate) console.log(chalk.yellow("Permanent delegate: enabled"));
    });

  // mint
  program
    .command("mint <mint> <recipient> <amount>")
    .description("Mint tokens to recipient")
    .option("--dry-run")
    .action(async (mintArg, recipientArg, amountArg, opts) => {
      if (opts.dryRun) {
        console.log(chalk.blue(`[dry-run] Would mint ${amountArg} to ${recipientArg}`));
        return;
      }
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Minting...").start();
      try {
        const recipient = new PublicKey(recipientArg);
        const sig = await stable.mintTokens(
          provider.wallet as any,
          recipient,
          BigInt(amountArg)
        );
        spinner.succeed(chalk.green("Minted! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  // burn
  program
    .command("burn <mint> <amount>")
    .description("Burn tokens from your account")
    .action(async (mintArg, amountArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Burning...").start();
      try {
        const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
        const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
        const ata = getAssociatedTokenAddressSync(
          mint,
          provider.wallet.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID
        );
        const sig = await stable.burnTokens(provider.wallet as any, ata, BigInt(amountArg));
        spinner.succeed(chalk.green("Burned! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  // freeze / thaw
  program
    .command("freeze <mint> <account>")
    .description("Freeze a token account")
    .action(async (mintArg, accountArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Freezing...").start();
      try {
        const sig = await stable.freezeAccount(provider.wallet as any, new PublicKey(accountArg));
        spinner.succeed(chalk.green("Frozen! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  program
    .command("thaw <mint> <account>")
    .description("Thaw a frozen token account")
    .action(async (mintArg, accountArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Thawing...").start();
      try {
        const sig = await stable.thawAccount(provider.wallet as any, new PublicKey(accountArg));
        spinner.succeed(chalk.green("Thawed! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  // pause / unpause
  program
    .command("pause <mint>")
    .description("Pause all mint/burn operations")
    .action(async (mintArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Pausing...").start();
      try {
        const sig = await stable.pause(provider.wallet as any);
        spinner.succeed(chalk.green("Paused! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  program
    .command("unpause <mint>")
    .description("Resume operations")
    .action(async (mintArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Unpausing...").start();
      try {
        const sig = await stable.unpause(provider.wallet as any);
        spinner.succeed(chalk.green("Unpaused! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  // supply
  program
    .command("supply <mint>")
    .description("Get current token supply")
    .action(async (mintArg) => {
      const cfg = loadConfig();
      const { program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const supply = await stable.getTotalSupply();
      console.log(chalk.bold("Supply: "), supply.toString());
    });
}
