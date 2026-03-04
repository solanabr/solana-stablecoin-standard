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

export function registerMintCommand(program: Command): void {
  program
    .command("mint")
    .description("Mint tokens to a destination address")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--to <pubkey>", "Destination wallet address")
    .requiredOption("--amount <amount>", "Amount to mint (in base units)")
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
        const destination = new PublicKey(opts.to);
        const amount = BigInt(opts.amount);

        header("Minting tokens");
        field("Mint", opts.mint);
        field("To", opts.to);
        field("Amount", opts.amount);

        const sig = await client.mint(mintPubkey, destination, amount);

        console.log();
        success(`Minted ${opts.amount} tokens`);
        success(`Transaction: ${txLink(sig)}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}
