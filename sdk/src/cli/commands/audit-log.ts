import { Command } from "commander";
import { Connection, PublicKey, ConfirmedSignatureInfo } from "@solana/web3.js";
import { findConfigPda } from "../../pda";
import { SSS_CORE_PROGRAM_ID, SSS_HOOK_PROGRAM_ID } from "../../constants";
import {
  formatOutput,
  logError,
  logWarning,
  parsePublicKey,
} from "../utils";

/**
 * Known Anchor event names emitted by sss-core and sss-hook programs.
 * Used to label log entries from transaction data.
 */
const CORE_INSTRUCTION_LABELS: Record<string, string> = {
  initialize: "StablecoinInitialized",
  configure_minter: "MinterConfigured",
  remove_minter: "MinterRemoved",
  mint_tokens: "TokensMinted",
  burn_tokens: "TokensBurned",
  freeze_account: "AccountFrozen",
  thaw_account: "AccountThawed",
  pause: "Paused",
  unpause: "Unpaused",
  update_role: "RoleUpdated",
  transfer_authority: "AuthorityTransferInitiated",
  accept_authority: "AuthorityTransferAccepted",
  seize: "TokensSeized",
};

const HOOK_INSTRUCTION_LABELS: Record<string, string> = {
  initialize_hook: "HookInitialized",
  add_to_blacklist: "AddedToBlacklist",
  remove_from_blacklist: "RemovedFromBlacklist",
};

/**
 * Parse instruction name from transaction log messages.
 * Anchor emits "Program log: Instruction: <name>" for each instruction.
 */
function parseInstructionName(
  logs: string[],
  coreProgramId: string,
  hookProgramId: string,
): { instruction: string; program: string } {
  let currentProgram = "";
  for (const log of logs) {
    if (log.includes(`Program ${coreProgramId} invoke`)) {
      currentProgram = "sss-core";
    } else if (log.includes(`Program ${hookProgramId} invoke`)) {
      currentProgram = "sss-hook";
    }

    const match = log.match(/^Program log: Instruction: (.+)$/);
    if (match) {
      const rawName = match[1];
      // Convert PascalCase to snake_case for lookup
      const snakeName = rawName
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");

      const labels =
        currentProgram === "sss-hook"
          ? HOOK_INSTRUCTION_LABELS
          : CORE_INSTRUCTION_LABELS;
      const eventLabel = labels[snakeName] ?? rawName;

      return { instruction: eventLabel, program: currentProgram || "unknown" };
    }
  }
  return { instruction: "Unknown", program: "unknown" };
}

/**
 * Register the `audit-log` command onto the given commander program.
 *
 * Usage:
 *   sss-token audit-log --mint <pubkey>            Show recent transaction log
 *   sss-token audit-log --mint <pubkey> --limit 50 Show last 50 entries
 */
export function registerAuditLogCommand(program: Command): void {
  program
    .command("audit-log")
    .description("Show recent on-chain transaction history for a stablecoin")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .option("--limit <number>", "Number of recent transactions to fetch", "25")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      const limit = parseInt(opts.limit, 10);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        logError("--limit must be between 1 and 1000");
        process.exit(1);
      }

      try {
        const connection = new Connection(url, "confirmed");
        const [configPda] = findConfigPda(mintPubkey, SSS_CORE_PROGRAM_ID);

        // Fetch recent signatures for the config PDA (all instructions touch it)
        const signatures: ConfirmedSignatureInfo[] =
          await connection.getSignaturesForAddress(configPda, { limit });

        if (signatures.length === 0) {
          if (outputFormat === "json") {
            process.stdout.write("[]\n");
          } else {
            logWarning("No transactions found for this mint.");
          }
          return;
        }

        const coreId = SSS_CORE_PROGRAM_ID.toBase58();
        const hookId = SSS_HOOK_PROGRAM_ID.toBase58();

        // Fetch transaction details in parallel (batched)
        const rows: Record<string, unknown>[] = [];
        const batchSize = 10;

        for (let i = 0; i < signatures.length; i += batchSize) {
          const batch = signatures.slice(i, i + batchSize);
          const txResults = await Promise.all(
            batch.map((sig) =>
              connection
                .getTransaction(sig.signature, {
                  commitment: "confirmed",
                  maxSupportedTransactionVersion: 0,
                })
                .catch(() => null)
            )
          );

          for (let j = 0; j < batch.length; j++) {
            const sig = batch[j];
            const tx = txResults[j];

            let instruction = "Unknown";
            let txProgram = "unknown";

            if (tx?.meta?.logMessages) {
              const parsed = parseInstructionName(
                tx.meta.logMessages,
                coreId,
                hookId,
              );
              instruction = parsed.instruction;
              txProgram = parsed.program;
            }

            const timestamp = sig.blockTime
              ? new Date(sig.blockTime * 1000).toISOString()
              : "N/A";

            rows.push({
              slot: sig.slot,
              timestamp,
              event: instruction,
              program: txProgram,
              status: sig.err ? "FAILED" : "OK",
              signature: sig.signature,
            });
          }
        }

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
        } else {
          process.stdout.write(formatOutput(rows, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to fetch audit log: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
