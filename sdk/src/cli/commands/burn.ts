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
 * Register the `burn` command onto the given commander program.
 *
 * Usage: sss-token burn <amount> --mint <pubkey>
 *
 * Tokens are burned from the signer's associated token account (ATA).
 */
export function registerBurnCommand(program: Command): void {
  program
    .command("burn <amount>")
    .description(
      "Burn tokens from the signer's associated token account (ATA)"
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
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
          `Amount must be an integer (base units, not decimal). Got: ${amountArg}.\n` +
            `  Hint: if you want 1.5 tokens with 6 decimals, pass 1500000.`
        );
        process.exit(1);
      }

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      const amount = new BN(amountArg);

      if (dryRun) {
        const dryData = {
          action: "burn",
          mint: mintPubkey.toBase58(),
          amount: amount.toString(),
          source: "signer's ATA",
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
        `Burn ${amount.toString()} tokens from your ATA for mint ${mintPubkey.toBase58()}?`,
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

        const txSig = await client.burn(mintPubkey, amount);

        const output = {
          action: "burn",
          mint: mintPubkey.toBase58(),
          amount: amount.toString(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Burned ${amount.toString()} tokens successfully`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to burn tokens: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
