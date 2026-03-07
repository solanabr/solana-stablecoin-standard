import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerFreeze(program: Command): void {
  program
    .command("freeze <token-account>")
    .description("Freeze a token account")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (tokenAccount: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        authority
      );
      const sig = await stable.freeze(
        new PublicKey(tokenAccount),
        authority
      );
      console.log(chalk.green(`✓ Frozen! Signature: ${sig}`));
    });

  program
    .command("thaw <token-account>")
    .description("Thaw a frozen token account")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (tokenAccount: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const authority = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        authority
      );
      const sig = await stable.thaw(
        new PublicKey(tokenAccount),
        authority
      );
      console.log(chalk.green(`✓ Thawed! Signature: ${sig}`));
    });
}
