import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info } from "../output";

export const pauseCommand = new Command("pause")
  .description("Pause or unpause the stablecoin")
  .option("--unpause", "Unpause instead of pause")
  .option("--keypair <path>", "Path to pauser keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured. Run 'sss-token init' first.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const pauser = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        pauser,
        programId
      );

      if (opts.unpause) {
        info("Unpausing stablecoin...");
        const sig = await stable.unpause(pauser);
        success(`Stablecoin unpaused. Signature: ${sig}`);
      } else {
        info("Pausing stablecoin...");
        const sig = await stable.pause(pauser);
        success(`Stablecoin paused. Signature: ${sig}`);
      }
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
