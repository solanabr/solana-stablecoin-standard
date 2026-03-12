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
 * Register the `hook` sub-command group onto the given commander program.
 *
 * Sub-commands:
 *   sss-token hook init --mint <pubkey>
 */
export function registerHookCommands(program: Command): void {
  const hook = program
    .command("hook")
    .description("Manage the SSS-2 transfer hook program");

  hook
    .command("init")
    .description(
      "Initialize the transfer hook for an SSS-2 stablecoin. " +
      "Creates the HookConfig and ExtraAccountMetaList PDAs."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
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
          action: "hook init",
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
        `Initialize transfer hook for mint ${mintPubkey.toBase58()}?`,
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

        const txSig = await client.initializeHook(mintPubkey);

        const output = {
          action: "hook init",
          mint: mintPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Transfer hook initialized for mint ${mintPubkey.toBase58()}`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to initialize hook: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
