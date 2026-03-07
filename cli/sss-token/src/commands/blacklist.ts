import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import Table from "cli-table3";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerBlacklist(program: Command): void {
  const blacklistCmd = program
    .command("blacklist")
    .description("Manage compliance blacklist (SSS-2 only)");

  blacklistCmd
    .command("add <address>")
    .description("Add an address to the blacklist")
    .requiredOption("--reason <reason>", "Reason for blacklisting")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (address: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const blacklister = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        blacklister
      );
      const sig = await stable.compliance.blacklistAdd(
        new PublicKey(address),
        opts.reason,
        blacklister
      );
      console.log(chalk.red(`✓ Added to blacklist! Signature: ${sig}`));
    });

  blacklistCmd
    .command("remove <address>")
    .description("Remove an address from the blacklist")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (address: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const blacklister = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        blacklister
      );
      const sig = await stable.compliance.blacklistRemove(
        new PublicKey(address),
        blacklister
      );
      console.log(chalk.green(`✓ Removed from blacklist! Signature: ${sig}`));
    });

  blacklistCmd
    .command("list")
    .description("List all blacklisted addresses")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        authority
      );
      const entries = await stable.compliance.listBlacklisted();

      if (entries.length === 0) {
        console.log(chalk.green("No addresses blacklisted."));
        return;
      }

      const table = new Table({
        head: ["Address", "Reason", "Blacklisted By", "Timestamp"],
      });
      for (const e of entries) {
        table.push([
          e.address.toBase58(),
          e.reason,
          e.blacklister.toBase58(),
          new Date(Number(e.timestamp) * 1000).toISOString(),
        ]);
      }
      console.log(table.toString());
    });

  blacklistCmd
    .command("check <address>")
    .description("Check if an address is blacklisted")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (address: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        authority
      );
      const isBlacklisted = await stable.compliance.isBlacklisted(
        new PublicKey(address)
      );
      if (isBlacklisted) {
        console.log(chalk.red(`${address} IS blacklisted`));
      } else {
        console.log(chalk.green(`${address} is NOT blacklisted`));
      }
    });
}
