import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadSssConfig, makeConnection } from "../utils/config.js";
import { printTable, printError } from "../utils/output.js";
import { SSS_TOKEN_PROGRAM_ID } from "@stbr/sss-sdk";

// Known Anchor event names emitted by the sss-token program
const KNOWN_EVENTS = [
  "TokenInitialized",
  "TokensMinted",
  "TokensBurned",
  "AccountFrozen",
  "AccountThawed",
  "TokenPaused",
  "TokenUnpaused",
  "BlacklistAdded",
  "BlacklistRemoved",
  "TokensSeized",
  "AuthorityTransferred",
  "RoleUpdated",
  "MinterQuotaUpdated",
];

export function registerAuditLog(program: Command): void {
  program
    .command("audit-log")
    .description("Show recent on-chain actions for the active stablecoin")
    .option("--action <type>", `Filter by action type. One of: ${KNOWN_EVENTS.join(", ")}`)
    .option("--limit <n>", "Max number of transactions to scan", "50")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found. Run `sss-token init` first.");

        const actionFilter: string | undefined = opts.action;
        if (actionFilter && !KNOWN_EVENTS.includes(actionFilter)) {
          throw new Error(`Unknown action "${actionFilter}". Valid types: ${KNOWN_EVENTS.join(", ")}`);
        }

        const connection = makeConnection(globalOpts.cluster);
        const limit = parseInt(opts.limit as string, 10);

        // Get recent signatures for the sss-token program
        const sigs = await connection.getSignaturesForAddress(SSS_TOKEN_PROGRAM_ID, { limit });

        const rows: Record<string, string>[] = [];

        for (const sigInfo of sigs) {
          if (sigInfo.err) continue;

          const tx = await connection.getParsedTransaction(sigInfo.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });

          if (!tx?.meta?.logMessages) continue;

          // Filter to only transactions involving our mint
          const accountKeys = tx.transaction.message.accountKeys.map(
            (k) => ("pubkey" in k ? k.pubkey : k).toBase58()
          );
          if (!accountKeys.includes(mintAddr)) continue;

          // Scan log messages for Anchor event markers
          for (const log of tx.meta.logMessages) {
            // Anchor emits: "Program data: <base64>" for events
            // The event name is not directly in the log, but the log before it
            // says "Program log: Instruction: <Name>" — we use that as action type
            const instrMatch = log.match(/Program log: Instruction: (\w+)/);
            if (instrMatch) {
              const action = instrMatch[1];
              if (actionFilter && action !== actionFilter) break;
              if (!actionFilter && !KNOWN_EVENTS.some((e) => action.includes(e.replace(/([A-Z])/g, "$1")))) {
                // Include all instructions even if not in our event list
              }
              rows.push({
                slot: String(sigInfo.slot),
                action,
                signature: sigInfo.signature.slice(0, 20) + "...",
                time: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000).toISOString() : "unknown",
              });
              break; // one row per tx
            }
          }
        }

        if (rows.length === 0) {
          console.log("  (no matching audit entries found)");
          return;
        }

        printTable(rows);
        console.log(`\n  ${rows.length} entr${rows.length === 1 ? "y" : "ies"} found`);
      } catch (err) {
        printError(err);
      }
    });
}
