import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

export function registerBurn(program: Command): void {
  program
    .command("burn")
    .description("Burn tokens from the burner's own token account")
    .argument("<amount>", "Amount to burn (in display units, e.g. 50)")
    .option("--burner <path>", "Path to burner keypair (defaults to --keypair)")
    .action(async (amount: string, opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const burner = loadKeypair(opts.burner ?? globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const info = await coin.getInfo();

        const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** info.decimals));
        const sig = await coin.burnTokens(burner, rawAmount);

        printSuccess("Tokens burned", {
          amount: `${amount} ${info.symbol}`,
          signature: sig,
        });
      } catch (err) {
        printError(err);
      }
    });
}
