import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { ComplianceClient } from "../../compliance";
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
 * Register the `blacklist` sub-command group onto the given commander program.
 *
 * Sub-commands:
 *   sss-token blacklist add    --mint <pubkey> --wallet <pubkey> --reason <string>
 *   sss-token blacklist remove --mint <pubkey> --wallet <pubkey>
 *   sss-token blacklist check  --mint <pubkey> --wallet <pubkey>
 *
 * All blacklist operations are SSS-2 (Compliant preset) only.
 */
export function registerBlacklistCommands(program: Command): void {
  const blacklist = program
    .command("blacklist")
    .description("Manage the compliance blacklist (SSS-2 only)");

  // ----- add -----
  blacklist
    .command("add")
    .description(
      "Add a wallet to the blacklist. Only callable by the blacklister role."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to blacklist")
    .requiredOption("--reason <string>", "Human-readable reason (max 200 chars)")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let walletPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        walletPubkey = parsePublicKey(opts.wallet, "--wallet");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (opts.reason.length > 200) {
        logError(`--reason must be at most 200 characters, got ${opts.reason.length}`);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "blacklist add",
          mint: mintPubkey.toBase58(),
          wallet: walletPubkey.toBase58(),
          reason: opts.reason,
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
        `Add ${walletPubkey.toBase58()} to the blacklist for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new ComplianceClient(connection, wallet);

        const txSig = await client.addToBlacklist(mintPubkey, walletPubkey, opts.reason);

        const output = {
          action: "blacklist add",
          mint: mintPubkey.toBase58(),
          wallet: walletPubkey.toBase58(),
          reason: opts.reason,
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Wallet ${walletPubkey.toBase58()} added to blacklist`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to add to blacklist: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- remove -----
  blacklist
    .command("remove")
    .description(
      "Remove a wallet from the blacklist. Only callable by the blacklister role."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to remove from the blacklist")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let walletPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        walletPubkey = parsePublicKey(opts.wallet, "--wallet");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "blacklist remove",
          mint: mintPubkey.toBase58(),
          wallet: walletPubkey.toBase58(),
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
        `Remove ${walletPubkey.toBase58()} from the blacklist for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new ComplianceClient(connection, wallet);

        const txSig = await client.removeFromBlacklist(mintPubkey, walletPubkey);

        const output = {
          action: "blacklist remove",
          mint: mintPubkey.toBase58(),
          wallet: walletPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Wallet ${walletPubkey.toBase58()} removed from blacklist`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to remove from blacklist: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- check -----
  blacklist
    .command("check")
    .description("Check whether a wallet is currently blacklisted")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--wallet <pubkey>", "Wallet address to check")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";

      let mintPubkey: PublicKey;
      let walletPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        walletPubkey = parsePublicKey(opts.wallet, "--wallet");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new ComplianceClient(connection, wallet);

        const entry = await client.getBlacklistEntry(mintPubkey, walletPubkey);

        const output = entry
          ? {
              mint: mintPubkey.toBase58(),
              wallet: walletPubkey.toBase58(),
              blacklisted: entry.blacklisted,
              reason: entry.reason,
              blacklistedAt: entry.blacklistedAt.toString(),
              blacklistedBy: entry.blacklistedBy.toBase58(),
            }
          : {
              mint: mintPubkey.toBase58(),
              wallet: walletPubkey.toBase58(),
              blacklisted: false,
              reason: "",
              blacklistedAt: "",
              blacklistedBy: "",
            };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to check blacklist status: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
