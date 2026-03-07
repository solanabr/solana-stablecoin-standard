import { Command } from "commander";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerPause(program: Command): void {
  program
    .command("pause")
    .description("Pause the stablecoin (disables mint and burn)")
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
      const sig = await stable.pause(authority);
      console.log(chalk.yellow(`⏸  Paused! Signature: ${sig}`));
    });

  program
    .command("unpause")
    .description("Unpause the stablecoin")
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
      const sig = await stable.unpause(authority);
      console.log(chalk.green(`▶  Unpaused! Signature: ${sig}`));
    });
}
