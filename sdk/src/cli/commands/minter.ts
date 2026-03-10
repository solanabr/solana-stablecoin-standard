import { Command } from "commander";
import { BN } from "@coral-xyz/anchor";
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
 * Register the `minter` sub-command group onto the given commander program.
 *
 * Sub-commands:
 *   sss-token minter configure --mint <pubkey> --minter <pubkey> --quota <amount>
 *   sss-token minter remove    --mint <pubkey> --minter <pubkey>
 */
export function registerMinterCommands(program: Command): void {
  const minter = program
    .command("minter")
    .description("Manage minter allowances for a stablecoin");

  // ----- configure -----
  minter
    .command("configure")
    .description(
      "Create or update a minter quota. Only callable by the master minter."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--minter <pubkey>", "Minter wallet address")
    .requiredOption(
      "--quota <amount>",
      "Maximum tokens (in base units) the minter may mint"
    )
    .action(async (opts, cmd) => {
      // Walk up the parent chain: configure -> minter -> program
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let minterPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        minterPubkey = parsePublicKey(opts.minter, "--minter");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      const quotaNum = parseFloat(opts.quota);
      if (isNaN(quotaNum) || quotaNum < 0) {
        logError(`--quota must be a non-negative integer, got: ${opts.quota}`);
        process.exit(1);
      }
      if (!Number.isInteger(quotaNum)) {
        logError(
          `--quota must be an integer (base units). Got: ${opts.quota}.`
        );
        process.exit(1);
      }
      const quota = new BN(opts.quota);

      if (dryRun) {
        const dryData = {
          action: "minter configure",
          mint: mintPubkey.toBase58(),
          minter: minterPubkey.toBase58(),
          quota: quota.toString(),
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
        `Configure minter ${minterPubkey.toBase58()} with quota ${quota.toString()} for mint ${mintPubkey.toBase58()}?`,
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

        const txSig = await client.configureMinter(mintPubkey, minterPubkey, quota);

        const output = {
          action: "minter configure",
          mint: mintPubkey.toBase58(),
          minter: minterPubkey.toBase58(),
          quota: quota.toString(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(
            `Minter ${minterPubkey.toBase58()} configured with quota ${quota.toString()}`
          );
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to configure minter: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- remove -----
  minter
    .command("remove")
    .description(
      "Disable an existing minter. Only callable by the master minter."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--minter <pubkey>", "Minter wallet address to remove")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let minterPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        minterPubkey = parsePublicKey(opts.minter, "--minter");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "minter remove",
          mint: mintPubkey.toBase58(),
          minter: minterPubkey.toBase58(),
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
        `Remove minter ${minterPubkey.toBase58()} from mint ${mintPubkey.toBase58()}?`,
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

        const txSig = await client.removeMinter(mintPubkey, minterPubkey);

        const output = {
          action: "minter remove",
          mint: mintPubkey.toBase58(),
          minter: minterPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Minter ${minterPubkey.toBase58()} removed`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to remove minter: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
