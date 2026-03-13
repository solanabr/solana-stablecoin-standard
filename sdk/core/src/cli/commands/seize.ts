import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info } from "../output";

export const seizeCommand = new Command("seize")
  .description("Seize tokens from an account (SSS-2 only)")
  .argument("<address>", "Token account to seize from")
  .requiredOption("--to <treasury>", "Treasury token account to receive seized tokens")
  .option("--keypair <path>", "Path to seizer keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const seizer = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        seizer,
        programId
      );

      info(`Seizing tokens from ${address} to ${opts.to}...`);

      const sig = await stable.compliance.seize({
        fromTokenAccount: new PublicKey(address),
        toTokenAccount: new PublicKey(opts.to),
        seizer,
      });

      success(`Tokens seized. Signature: ${sig}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
