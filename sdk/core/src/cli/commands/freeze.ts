import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info } from "../output";

export const freezeCommand = new Command("freeze")
  .description("Freeze or thaw a token account")
  .argument("<address>", "Token account address to freeze/thaw")
  .option("--thaw", "Thaw instead of freeze")
  .option("--keypair <path>", "Path to freezer keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured. Run 'sss-token init' first.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const freezer = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        freezer,
        programId
      );

      const tokenAccount = new PublicKey(address);

      if (opts.thaw) {
        info(`Thawing account ${address}...`);
        const sig = await stable.thawAccount({ tokenAccount, freezer });
        success(`Account thawed. Signature: ${sig}`);
      } else {
        info(`Freezing account ${address}...`);
        const sig = await stable.freezeAccount({ tokenAccount, freezer });
        success(`Account frozen. Signature: ${sig}`);
      }
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
