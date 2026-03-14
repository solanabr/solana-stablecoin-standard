import { Command } from "commander";
import chalk from "chalk";
import { table } from "table";
import { getMintContext } from "../lib/context";

export function registerAuditCommands(program: Command): void {
  program
    .command("audit-log")
    .option("--action <type>", "Filter by action type (e.g. Mint, Burn, Pause, Freeze, BlacklistAdd, Seize)")
    .option("--limit <n>", "Max entries to show", "20")
    .description("Show on-chain audit log (from event history)")
    .action(async (opts, cmd) => {
      const { config, mint } = getMintContext(cmd);
      const actionFilter = opts.action?.toLowerCase();
      const limit = parseInt(opts.limit, 10);
      const fetchLimit = actionFilter ? limit * 5 : limit;

      console.log(
        chalk.yellow(
          `Fetching audit log for mint ${mint.toBase58()}...\n` +
            (actionFilter ? `  Filtering by action: ${opts.action}\n` : "") +
            `(Shows recent on-chain events via getSignaturesForAddress)\n`,
        ),
      );

      const signatures = await config.connection.getSignaturesForAddress(mint, { limit: fetchLimit });
      const rows: string[][] = [["Signature", "Slot", "Time", "Status", "Action"]];
      let count = 0;

      for (const sig of signatures) {
        if (count >= limit) break;
        let action = "-";

        if (actionFilter) {
          try {
            const tx = await config.connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });
            const logs = tx?.meta?.logMessages ?? [];
            const logText = logs.join(" ").toLowerCase();
            const eventPatterns: Record<string, string[]> = {
              mint: ["tokensminted", "mint_token", "mint"],
              burn: ["tokensburned", "burn"],
              pause: ["stablecoinpaused", "pause"],
              unpause: ["stablecoinunpaused", "unpause"],
              freeze: ["accountfrozen", "freeze_account"],
              thaw: ["accountthawed", "thaw_account"],
              blacklistadd: ["addressblacklisted", "add_to_blacklist"],
              blacklistremove: ["addressunblacklisted", "remove_from_blacklist"],
              seize: ["tokensseized", "seize"],
              addminter: ["minteradded", "add_minter"],
              removeminter: ["minterremoved", "remove_minter"],
              updateroles: ["rolesupdated", "update_roles"],
            };

            const patterns = eventPatterns[actionFilter] ?? [actionFilter];
            if (!patterns.some((pattern) => logText.includes(pattern))) {
              continue;
            }

            for (const [name, pats] of Object.entries(eventPatterns)) {
              if (pats.some((pattern) => logText.includes(pattern))) {
                action = name.charAt(0).toUpperCase() + name.slice(1);
                break;
              }
            }
          } catch {
            continue;
          }
        } else {
          try {
            const tx = await config.connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });
            const logText = (tx?.meta?.logMessages ?? []).join(" ").toLowerCase();
            const quickPatterns: [string, string][] = [
              ["mint", "Mint"], ["burn", "Burn"], ["pause", "Pause"],
              ["unpause", "Unpause"], ["freeze", "Freeze"], ["thaw", "Thaw"],
              ["blacklist", "Blacklist"], ["seize", "Seize"],
              ["minter", "Minter"], ["role", "Roles"],
            ];
            for (const [pattern, label] of quickPatterns) {
              if (logText.includes(pattern)) {
                action = label;
                break;
              }
            }
          } catch {
            // ignore parse errors
          }
        }

        rows.push([
          `${sig.signature.slice(0, 20)}...`,
          sig.slot.toString(),
          sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : "unknown",
          sig.err ? chalk.red("FAILED") : chalk.green("OK"),
          action,
        ]);
        count++;
      }

      if (rows.length <= 1) {
        console.log(chalk.yellow("No matching transactions found."));
      } else {
        console.log(table(rows));
      }
    });
}
