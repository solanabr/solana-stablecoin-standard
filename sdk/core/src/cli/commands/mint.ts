import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info } from "../output";

export const mintCommand = new Command("mint")
  .description("Mint tokens to a recipient")
  .argument("<recipient>", "Recipient wallet address")
  .argument("<amount>", "Amount to mint (in base units)")
  .option("--keypair <path>", "Path to minter keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (recipient: string, amount: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured. Run 'sss-token init' first or set mint in config.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const minter = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        minter,
        programId
      );

      info(`Minting ${amount} tokens to ${recipient}...`);

      const sig = await stable.mint({
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
        minter,
      });

      success(`Minted ${amount} tokens. Signature: ${sig}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
