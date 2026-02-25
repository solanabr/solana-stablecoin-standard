import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

export function registerMint(program: Command): void {
  program
    .command("mint")
    .description("Mint tokens to a recipient")
    .argument("<recipient>", "Recipient wallet address")
    .argument("<amount>", "Amount of tokens (in display units, e.g. 100.5)")
    .option("--minter <path>", "Path to minter keypair (defaults to --keypair)")
    .action(async (recipient: string, amount: string, opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const minter = loadKeypair(opts.minter ?? globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const info = await coin.getInfo();

        const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** info.decimals));
        const sig = await coin.mintTokens(minter, new PublicKey(recipient), rawAmount);

        printSuccess("Tokens minted", {
          to: recipient,
          amount: `${amount} ${info.symbol}`,
          signature: sig,
        });
      } catch (err) {
        printError(err);
      }
    });
}
