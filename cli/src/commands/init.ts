import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SssClient, Preset } from "@solana-stablecoin-standard/sdk";
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

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize a new SSS stablecoin token")
    .requiredOption(
      "--preset <preset>",
      "Token preset: sss-1, sss-2, or custom",
      "sss-1"
    )
    .requiredOption("--name <name>", "Token name")
    .requiredOption("--symbol <symbol>", "Token symbol")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <decimals>", "Token decimals", "6")
    .option("--supply-cap <cap>", "Max supply (0 = unlimited)", "0")
    .option(
      "--transfer-hook <programId>",
      "Transfer hook program ID (SSS-2 only)"
    )
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

        const presetMap: Record<string, Preset> = {
          "sss-1": Preset.SSS1,
          "sss-2": Preset.SSS2,
          custom: Preset.SSS2, // custom starts from SSS-2 base
        };
        const preset = presetMap[opts.preset];
        if (!preset) {
          error(`Unknown preset: ${opts.preset}. Use sss-1, sss-2, or custom.`);
          process.exit(1);
        }

        header(`Initializing ${opts.preset.toUpperCase()} token`);

        const hookProgram = opts.transferHook
          ? new PublicKey(opts.transferHook)
          : undefined;

        const { mint, signature } = await client.initialize({
          preset,
          name: opts.name,
          symbol: opts.symbol,
          uri: opts.uri,
          decimals: parseInt(opts.decimals),
          supplyCap: BigInt(opts.supplyCap),
          transferHookProgram: hookProgram,
        });

        header("Token created");
        field("Mint", mint.publicKey.toBase58());
        field("Preset", opts.preset.toUpperCase());
        field("Decimals", opts.decimals);
        field("Supply cap", opts.supplyCap === "0" ? "unlimited" : opts.supplyCap);
        field("Deployer", keypair.publicKey.toBase58());
        console.log();
        success(`Transaction: ${txLink(signature)}`);

        // Save mint keypair for later use
        const fs = await import("fs");
        const mintPath = `${opts.symbol.toLowerCase()}-mint.json`;
        fs.writeFileSync(
          mintPath,
          JSON.stringify(Array.from(mint.secretKey))
        );
        success(`Mint keypair saved to ${mintPath}`);
      } catch (err: any) {
        error(err.message ?? err);
        process.exit(1);
      }
    });
}
