import { Command } from "commander";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";
import chalk from "chalk";
import Table from "cli-table3";

export function registerAuditLog(program: Command): void {
  program
    .command("audit-log")
    .description("Display on-chain audit trail of compliance events")
    .option("--action <type>", "Filter by action type (blacklist|seize|freeze|mint)")
    .option("--limit <n>", "Max events to show", "50")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      // Fetch program logs for the sss-token program
      console.log(chalk.cyan("Fetching transaction history..."));

      const programId = cfg.program_id;
      const limit = parseInt(opts.limit, 10);

      const signatures = await connection.getSignaturesForAddress(
        mintPubkey,
        { limit }
      );

      const table = new Table({
        head: ["Signature", "Time", "Event"],
      });

      for (const sig of signatures) {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) continue;

        // Parse program logs for event data
        const logs = tx.meta?.logMessages ?? [];
        for (const log of logs) {
          if (log.includes("Program data:")) {
            const time = sig.blockTime
              ? new Date(sig.blockTime * 1000).toISOString()
              : "Unknown";
            const eventSummary = log.replace("Program data:", "").trim();

            if (opts.action) {
              if (!eventSummary.toLowerCase().includes(opts.action.toLowerCase())) {
                continue;
              }
            }

            table.push([
              sig.signature.slice(0, 20) + "...",
              time,
              eventSummary.slice(0, 50),
            ]);
          }
        }
      }

      console.log(table.toString());
    });
}
