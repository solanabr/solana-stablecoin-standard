import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerMint(program: Command): void {
  program
    .command("mint <recipient> <amount>")
    .description("Mint tokens to a recipient address")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (recipient: string, amount: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const minter = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        minter
      );

      const config = await stable.getConfig();
      const amountLamports = new BN(amount).mul(
        new BN(10).pow(new BN(config.decimals))
      );

      console.log(
        chalk.cyan(
          `Minting ${amount} ${config.symbol} to ${recipient}...`
        )
      );

      const sig = await stable.mintTokens(
        { recipient: new PublicKey(recipient), amount: amountLamports },
        minter
      );

      console.log(chalk.green(`✓ Minted! Signature: ${sig}`));
    });
}
