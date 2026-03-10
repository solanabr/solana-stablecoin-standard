import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { StablecoinClient } from "../../client";
import {
  getProvider,
  formatOutput,
  confirmAction,
  logSuccess,
  logError,
  logWarning,
  parsePublicKey,
} from "../utils";

/**
 * Register `pause` and `unpause` commands onto the given commander program.
 *
 * Usage:
 *   sss-token pause   --mint <pubkey>
 *   sss-token unpause --mint <pubkey>
 */
export function registerPauseCommands(program: Command): void {
  // ----- pause -----
  program
    .command("pause")
    .description(
      "Pause all minting, burning, and transfer operations for a stablecoin"
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "pause",
          mint: mintPubkey.toBase58(),
          keypair: keypairPath,
          cluster: url,
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      const confirmed = await confirmAction(
        `Pause all operations for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const txSig = await client.pause(mintPubkey);

        const output = {
          action: "pause",
          mint: mintPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Stablecoin ${mintPubkey.toBase58()} is now paused`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to pause: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- unpause -----
  program
    .command("unpause")
    .description("Resume operations after a pause")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "unpause",
          mint: mintPubkey.toBase58(),
          keypair: keypairPath,
          cluster: url,
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      const confirmed = await confirmAction(
        `Unpause operations for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const txSig = await client.unpause(mintPubkey);

        const output = {
          action: "unpause",
          mint: mintPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Stablecoin ${mintPubkey.toBase58()} is now active`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to unpause: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
