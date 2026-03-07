import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import Table from "cli-table3";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerMinters(program: Command): void {
  const mintersCmd = program
    .command("minters")
    .description("Manage authorized minters");

  mintersCmd
    .command("list")
    .description("List all authorized minters")
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
      const minters = await stable.minters.list();

      const table = new Table({
        head: ["Minter", "Quota", "Minted", "Active"],
      });
      for (const m of minters) {
        table.push([
          m.minter.toBase58(),
          m.quota.toString() === "0" ? "Unlimited" : m.quota.toString(),
          m.minted.toString(),
          m.active ? chalk.green("Yes") : chalk.red("No"),
        ]);
      }
      console.log(table.toString());
    });

  mintersCmd
    .command("add <address>")
    .description("Add or update a minter")
    .option("--quota <amount>", "Max tokens (0 = unlimited)", "0")
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
      const sig = await stable.minters.add(
        {
          minter: new PublicKey(address),
          quota: new BN(opts.quota),
          active: true,
        },
        authority
      );
      console.log(chalk.green(`✓ Minter added! Signature: ${sig}`));
    });

  mintersCmd
    .command("remove <address>")
    .description("Deactivate a minter")
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
      const sig = await stable.minters.remove(
        new PublicKey(address),
        authority
      );
      console.log(chalk.green(`✓ Minter removed! Signature: ${sig}`));
    });
}
