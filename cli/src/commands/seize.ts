import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

export function registerSeize(program: Command): void {
  program
    .command("seize")
    .description("Seize tokens from a frozen account to a treasury (SSS-2 only)")
    .argument("<from>", "Wallet address whose tokens to seize")
    .argument("<amount>", "Amount to seize (in display units, e.g. 100)")
    .requiredOption("--to <address>", "Destination (treasury) wallet address")
    .option("--seizer <path>", "Path to seizer keypair (defaults to --keypair)")
    .action(async (from: string, amount: string, opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const seizer = loadKeypair(opts.seizer ?? globalOpts.keypair);
        const mintKey = new PublicKey(mintAddr);
        const coin = await SolanaStablecoin.load(connection, mintKey);
        const info = await coin.getInfo();

        const fromTokenAccount = getAssociatedTokenAddressSync(
          mintKey,
          new PublicKey(from),
          false,
          TOKEN_2022_PROGRAM_ID
        );
        const toTokenAccount = getAssociatedTokenAddressSync(
          mintKey,
          new PublicKey(opts.to as string),
          false,
          TOKEN_2022_PROGRAM_ID
        );

        const rawAmount = BigInt(Math.round(parseFloat(amount) * 10 ** info.decimals));
        const sig = await coin.compliance.seize(
          seizer,
          fromTokenAccount,
          toTokenAccount,
          rawAmount
        );

        printSuccess("Tokens seized", {
          from,
          to: opts.to as string,
          amount: `${amount} ${info.symbol}`,
          signature: sig,
        });
      } catch (err) {
        printError(err);
      }
    });
}
