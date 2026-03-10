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
 * Register `freeze` and `thaw` commands onto the given commander program.
 *
 * Usage:
 *   sss-token freeze <token-account> --mint <pubkey>
 *   sss-token thaw   <token-account> --mint <pubkey>
 */
export function registerFreezeCommands(program: Command): void {
  // ----- freeze -----
  program
    .command("freeze <token-account>")
    .description("Freeze a token account, preventing transfers")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (tokenAccountArg: string, opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let tokenAccount: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        tokenAccount = parsePublicKey(tokenAccountArg, "<token-account>");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "freeze",
          mint: mintPubkey.toBase58(),
          tokenAccount: tokenAccount.toBase58(),
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
        `Freeze token account ${tokenAccount.toBase58()}?`,
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

        const txSig = await client.freezeAccount(mintPubkey, tokenAccount);

        const output = {
          action: "freeze",
          mint: mintPubkey.toBase58(),
          tokenAccount: tokenAccount.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Token account ${tokenAccount.toBase58()} frozen`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to freeze account: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- thaw -----
  program
    .command("thaw <token-account>")
    .description("Thaw a frozen token account, restoring transfer capability")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (tokenAccountArg: string, opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let tokenAccount: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        tokenAccount = parsePublicKey(tokenAccountArg, "<token-account>");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "thaw",
          mint: mintPubkey.toBase58(),
          tokenAccount: tokenAccount.toBase58(),
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
        `Thaw token account ${tokenAccount.toBase58()}?`,
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

        const txSig = await client.thawAccount(mintPubkey, tokenAccount);

        const output = {
          action: "thaw",
          mint: mintPubkey.toBase58(),
          tokenAccount: tokenAccount.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Token account ${tokenAccount.toBase58()} thawed`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to thaw account: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
