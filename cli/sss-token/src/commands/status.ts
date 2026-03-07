import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import Table from "cli-table3";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Display stablecoin status")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);
      const mint = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(connection, mint, authority);
      const status = await stable.getStatus();

      const table = new Table();
      table.push(
        ["Mint", status.mint],
        ["Name", status.name],
        ["Symbol", status.symbol],
        ["Decimals", status.decimals.toString()],
        ["Preset", chalk.bold(status.preset)],
        ["Supply", (status.supply / BigInt(10 ** status.decimals)).toString()],
        ["Paused", status.paused ? chalk.red("YES") : chalk.green("NO")],
        ["Authority", status.authority]
      );

      console.log(table.toString());
    });

  program
    .command("supply")
    .description("Show total token supply")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);
      const mint = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(connection, mint, authority);
      const [supply, config] = await Promise.all([
        stable.getTotalSupply(),
        stable.getConfig(),
      ]);
      const divisor = BigInt(10 ** config.decimals);
      console.log(`${supply / divisor} ${config.symbol}`);
    });
}
