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

export function registerPauseCommand(program: Command): void {
  program
    .command("pause")
    .description("Pause all token operations")
    .requiredOption("--mint <pubkey>", "Mint address")
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

        header("Pausing token");
        field("Mint", opts.mint);

        const sig = await client.pause(mintPubkey);

        console.log();
        success("Token paused — all operations blocked");
        success(`Transaction: ${txLink(sig)}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}

export function registerUnpauseCommand(program: Command): void {
  program
    .command("unpause")
    .description("Resume token operations")
    .requiredOption("--mint <pubkey>", "Mint address")
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

        const sig = await client.unpause(mintPubkey);

        success("Token unpaused");
        success(`Transaction: ${txLink(sig)}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}
