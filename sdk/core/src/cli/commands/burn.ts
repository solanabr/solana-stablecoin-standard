import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info } from "../output";

export const burnCommand = new Command("burn")
  .description("Burn tokens")
  .argument("<amount>", "Amount to burn (in base units)")
  .option("--keypair <path>", "Path to burner keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (amount: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured. Run 'sss-token init' first.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const burner = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        burner,
        programId
      );

      info(`Burning ${amount} tokens...`);

      const sig = await stable.burn({
        amount: BigInt(amount),
        burner,
      });

      success(`Burned ${amount} tokens. Signature: ${sig}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
