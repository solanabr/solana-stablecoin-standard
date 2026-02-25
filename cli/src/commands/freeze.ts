import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

function getTokenAccountForWallet(mint: PublicKey, wallet: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
}

export function registerFreeze(program: Command): void {
  program
    .command("freeze")
    .description("Freeze a token account")
    .argument("<address>", "Wallet address whose token account to freeze")
    .action(async (address: string, opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const mintKey = new PublicKey(mintAddr);
        const coin = await SolanaStablecoin.load(connection, mintKey);

        const tokenAccount = getTokenAccountForWallet(mintKey, new PublicKey(address));
        const sig = await coin.freezeAccount(authority, tokenAccount);

        printSuccess("Account frozen", { wallet: address, "token account": tokenAccount.toBase58(), signature: sig });
      } catch (err) {
        printError(err);
      }
    });

  program
    .command("thaw")
    .description("Thaw (unfreeze) a token account")
    .argument("<address>", "Wallet address whose token account to thaw")
    .action(async (address: string, opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const mintKey = new PublicKey(mintAddr);
        const coin = await SolanaStablecoin.load(connection, mintKey);

        const tokenAccount = getTokenAccountForWallet(mintKey, new PublicKey(address));
        const sig = await coin.thawAccount(authority, tokenAccount);

        printSuccess("Account thawed", { wallet: address, "token account": tokenAccount.toBase58(), signature: sig });
      } catch (err) {
        printError(err);
      }
    });
}
