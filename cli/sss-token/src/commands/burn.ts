import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerBurn(program: Command): void {
  program
    .command("burn <token-account> <amount>")
    .description("Burn tokens from a token account")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (tokenAccount: string, amount: string, opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const burner = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        burner
      );
      const config = await stable.getConfig();
      const amountLamports = new BN(amount).mul(
        new BN(10).pow(new BN(config.decimals))
      );

      console.log(chalk.cyan(`Burning ${amount} ${config.symbol}...`));

      const sig = await stable.burn(
        {
          tokenAccount: new PublicKey(tokenAccount),
          tokenAccountOwner: burner.publicKey,
          amount: amountLamports,
        },
        burner
      );

      console.log(chalk.green(`✓ Burned! Signature: ${sig}`));
    });
}
