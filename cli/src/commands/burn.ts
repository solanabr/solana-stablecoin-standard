import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SssClient } from "@solana-stablecoin-standard/sdk";
import * as anchor from "@coral-xyz/anchor";

import {
  loadKeypair,
  getConnection,
  loadIdl,
  success,
  error,
  header,
  field,
  txLink,
} from "../utils";

export function registerBurnCommand(program: Command): void {
  program
    .command("burn")
    .description("Burn tokens from your account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--amount <amount>", "Amount to burn (in base units)")
    .option("--keypair <path>", "Path to keypair file")
    .option("--rpc <url>", "Solana RPC URL")
    .action(async (opts) => {
      try {
        const keypair = loadKeypair(opts.keypair);
        const connection = getConnection(opts.rpc);
        const wallet = new anchor.Wallet(keypair);
        const idl = loadIdl();

        const client = new SssClient({ connection, wallet });
        await client.loadProgram(idl);

        const mintPubkey = new PublicKey(opts.mint);
        const amount = BigInt(opts.amount);

        header("Burning tokens");
        field("Mint", opts.mint);
        field("Amount", opts.amount);

        const sig = await client.burn(mintPubkey, amount);

        console.log();
        success(`Burned ${opts.amount} tokens`);
        success(`Transaction: ${txLink(sig)}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}
