import { Command } from "commander";
import { BN } from "@coral-xyz/anchor";
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
 * Register the `seize` command onto the given commander program.
 *
 * Usage:
 *   sss-token seize <amount> --mint <pubkey> --from <pubkey> --to <pubkey>
 *
 * SSS-2 only — seizes tokens from a source account to a treasury via the
 * permanent delegate. Only callable by the authority role.
 */
export function registerSeizeCommand(program: Command): void {
  program
    .command("seize <amount>")
    .description(
      "Seize tokens from an account to a treasury via permanent delegate (SSS-2 only)"
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--from <pubkey>", "Source token account to seize from")
    .requiredOption("--to <pubkey>", "Destination treasury token account")
    .action(async (amountArg: string, opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      // Validate amount
      const amountNum = parseFloat(amountArg);
      if (isNaN(amountNum) || amountNum <= 0) {
        logError(`Amount must be a positive number, got: ${amountArg}`);
        process.exit(1);
      }
      if (!Number.isInteger(amountNum)) {
        logError(
          `Amount must be an integer (base units). Got: ${amountArg}.\n` +
            `  Hint: if you want 1.5 tokens with 6 decimals, pass 1500000.`
        );
        process.exit(1);
      }

      let mintPubkey: PublicKey;
      let fromPubkey: PublicKey;
      let toPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        fromPubkey = parsePublicKey(opts.from, "--from");
        toPubkey = parsePublicKey(opts.to, "--to");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      const amount = new BN(amountArg);

      if (dryRun) {
        const dryData = {
          action: "seize",
          mint: mintPubkey.toBase58(),
          from: fromPubkey.toBase58(),
          to: toPubkey.toBase58(),
          amount: amount.toString(),
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
        `Seize ${amount.toString()} tokens from ${fromPubkey.toBase58()} to treasury ${toPubkey.toBase58()}?`,
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

        const txSig = await client.seize(mintPubkey, fromPubkey, toPubkey, amount);

        const output = {
          action: "seize",
          mint: mintPubkey.toBase58(),
          from: fromPubkey.toBase58(),
          to: toPubkey.toBase58(),
          amount: amount.toString(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Seized ${amount.toString()} tokens successfully`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to seize tokens: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
