import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SssClient, Preset } from "@solana-stablecoin-standard/sdk";
import * as anchor from "@coral-xyz/anchor";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import {
  loadKeypair,
  getConnection,
  loadIdl,
  error,
  header,
  field,
} from "../utils";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show token configuration and supply")
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

        // Fetch config
        const config = await client.getConfig(mintPubkey);

        // Fetch mint info for supply
        const mintInfo = await getMint(
          connection,
          mintPubkey,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );

        const presetName = config.preset === 1 ? "SSS-1 (Minimal)" : "SSS-2 (Compliant)";

        header("Token Status");
        field("Mint", mintPubkey.toBase58());
        field("Preset", presetName);
        field("Decimals", config.decimals);
        field("Supply", mintInfo.supply.toString());
        field(
          "Supply cap",
          config.supplyCap.toString() === "0"
            ? "unlimited"
            : config.supplyCap.toString()
        );
        field("Paused", config.paused ? "YES" : "no");
        field("Deployer", config.deployer.toBase58());
        field("Freeze authority", "config PDA");

        if (config.preset === Preset.SSS2) {
          field(
            "Transfer hook",
            config.transferHookProgram.toBase58()
          );

          // Fetch blacklist
          const isBlacklisted = await client.isBlacklisted(mintPubkey, mintPubkey);
          const status = await client.getStatus(mintPubkey);
          field(
            "Blacklisted addrs",
            (status.blacklistCount ?? 0).toString()
          );
          field("Perm. delegate", "config PDA");
        }

        console.log();
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}

export function registerSupplyCommand(program: Command): void {
  program
    .command("supply")
    .description("Show current token supply")
    .requiredOption("--mint <pubkey>", "Mint address")
    .option("--rpc <url>", "Solana RPC URL")
    .action(async (opts) => {
      try {
        const connection = getConnection(opts.rpc);
        const mintPubkey = new PublicKey(opts.mint);
        const mintInfo = await getMint(
          connection,
          mintPubkey,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        console.log(mintInfo.supply.toString());
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}
