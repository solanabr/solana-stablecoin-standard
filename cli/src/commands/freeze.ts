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

export function registerFreezeCommand(program: Command): void {
  program
    .command("freeze")
    .description("Freeze a token account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--target <pubkey>", "Target wallet to freeze")
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
        const target = new PublicKey(opts.target);

        header("Freezing account");
        field("Mint", opts.mint);
        field("Target", opts.target);

        const sig = await client.freeze(mintPubkey, target);

        console.log();
        success(`Account frozen`);
        success(`Transaction: ${txLink(sig)}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}

export function registerThawCommand(program: Command): void {
  program
    .command("thaw")
    .description("Thaw a frozen token account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--target <pubkey>", "Target wallet to thaw")
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
        const target = new PublicKey(opts.target);

        header("Thawing account");
        field("Mint", opts.mint);
        field("Target", opts.target);

        const sig = await client.thaw(mintPubkey, target);

        console.log();
        success(`Account thawed`);
        success(`Transaction: ${txLink(sig)}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}
