import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import chalk from "chalk";
import ora from "ora";
import * as anchor from "@coral-xyz/anchor";

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
  if (cfg.vaults[alias]) return new PublicKey(cfg.vaults[alias].mint);
  try { return new PublicKey(alias); } catch {
    console.error(chalk.red(`Unknown: ${alias}`));
    process.exit(1);
  }
}

export function registerComplianceCommands(program: Command): void {
  const bl = program
    .command("blacklist")
    .description("SSS-2 blacklist management");

  bl.command("add <mint> <address>")
    .description("Add address to blacklist")
    .option("--reason <reason>", "Reason for blacklisting", "OFAC match")
    .action(async (mintArg, addressArg, opts) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora(`Blacklisting ${addressArg}...`).start();
      try {
        const sig = await stable.compliance.blacklistAdd(
          provider.wallet as any,
          new PublicKey(addressArg),
          opts.reason
        );
        spinner.succeed(chalk.green("Blacklisted! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  bl.command("remove <mint> <address>")
    .description("Remove address from blacklist")
    .action(async (mintArg, addressArg) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora(`Removing ${addressArg} from blacklist...`).start();
      try {
        const sig = await stable.compliance.blacklistRemove(
          provider.wallet as any,
          new PublicKey(addressArg)
        );
        spinner.succeed(chalk.green("Removed! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });

  bl.command("check <mint> <address>")
    .description("Check if address is blacklisted")
    .action(async (mintArg, addressArg) => {
      const cfg = loadConfig();
      const { program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const blacklisted = await stable.compliance.isBlacklisted(new PublicKey(addressArg));
      if (blacklisted) {
        const entry = await stable.compliance.getBlacklistEntry(new PublicKey(addressArg));
        console.log(chalk.red("BLACKLISTED"));
        if (entry) {
          console.log(chalk.gray("  Reason:   "), entry.reason);
          console.log(chalk.gray("  Added by: "), entry.blacklistedBy.toBase58());
          console.log(chalk.gray("  At:       "), new Date(Number(entry.timestamp) * 1000).toISOString());
        }
      } else {
        console.log(chalk.green("NOT blacklisted"));
      }
    });

  bl.command("list <mint>")
    .description("List all blacklisted addresses")
    .action(async (mintArg) => {
      const cfg = loadConfig();
      const { program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const entries = await stable.compliance.getAllBlacklisted();
      if (entries.length === 0) {
        console.log(chalk.green("No blacklisted addresses."));
        return;
      }
      console.log(chalk.bold(`\n${entries.length} blacklisted address(es):\n`));
      for (const { address, entry } of entries) {
        console.log(chalk.red("  " + address.toBase58()));
        console.log(chalk.gray("    Reason: "), entry.reason);
      }
    });

  // seize
  program
    .command("seize <mint> <frozen-account> <treasury>")
    .description("SSS-2: seize tokens from a frozen account to treasury")
    .option("--amount <n>", "Amount to seize (all if omitted)", "0")
    .action(async (mintArg, frozenArg, treasuryArg, opts) => {
      const cfg = loadConfig();
      const { provider, program: prog } = getProgram(cfg);
      const mint = resolveMint(mintArg, cfg);
      const stable = SolanaStablecoin.load(prog, mint);
      const spinner = ora("Seizing...").start();
      try {
        const sig = await stable.compliance.seize(
          provider.wallet as any,
          new PublicKey(frozenArg),
          new PublicKey(treasuryArg),
          BigInt(opts.amount)
        );
        spinner.succeed(chalk.green("Seized! Tx: " + sig));
      } catch (e: any) {
        spinner.fail(chalk.red(e.message));
        process.exit(1);
      }
    });
}
