import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import chalk from "chalk";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerSeize(program: Command): void {
  program
    .command("seize")
    .description("Seize tokens using permanent delegate (SSS-2 only)")
    .requiredOption("--from <token-account>", "Token account to seize from")
    .requiredOption("--to <token-account>", "Treasury token account")
    .requiredOption("--amount <amount>", "Amount to seize (in token units)")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const seizer = loadKeypair(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      const stable = await SolanaStablecoin.load(
        connection,
        mintPubkey,
        seizer
      );
      const config = await stable.getConfig();
      const amountLamports = new BN(opts.amount).mul(
        new BN(10).pow(new BN(config.decimals))
      );

      console.log(
        chalk.red(
          `Seizing ${opts.amount} ${config.symbol} from ${opts.from}...`
        )
      );

      const sig = await stable.compliance.seize(
        {
          fromTokenAccount: new PublicKey(opts.from),
          toTokenAccount: new PublicKey(opts.to),
          amount: amountLamports,
        },
        seizer
      );
      console.log(chalk.green(`✓ Seized! Signature: ${sig}`));
    });
}
