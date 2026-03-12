import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import {
  formatOutput,
  logError,
  logWarning,
  parsePublicKey,
} from "../utils";

/**
 * Register the `holders` command onto the given commander program.
 *
 * Usage:
 *   sss-token holders --mint <pubkey>             List all token holders
 *   sss-token holders --mint <pubkey> --top 20    Show top 20 by balance
 */
export function registerHoldersCommand(program: Command): void {
  program
    .command("holders")
    .description("List all current token holders for a stablecoin mint")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .option(
      "--top <number>",
      "Only show the top N holders by balance (default: all)"
    )
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

      let topN: number | undefined;
      if (opts.top !== undefined) {
        topN = parseInt(opts.top, 10);
        if (isNaN(topN) || topN < 1) {
          logError("--top must be a positive integer");
          process.exit(1);
        }
      }

      try {
        const connection = new Connection(url, "confirmed");

        // Fetch all Token-2022 token accounts for this mint
        const accounts = await connection.getProgramAccounts(
          TOKEN_2022_PROGRAM_ID,
          {
            filters: [
              { dataSize: AccountLayout.span },
              {
                memcmp: {
                  offset: 0, // mint is the first field in the token account layout
                  bytes: mintPubkey.toBase58(),
                },
              },
            ],
          }
        );

        if (accounts.length === 0) {
          if (outputFormat === "json") {
            process.stdout.write("[]\n");
          } else {
            logWarning("No token accounts found for this mint.");
          }
          return;
        }

        // Parse account data to extract owner and balance
        const holders: { owner: string; balance: string; account: string; frozen: boolean }[] = [];

        for (const { pubkey, account } of accounts) {
          try {
            const decoded = AccountLayout.decode(account.data);
            const balance = decoded.amount;
            const owner = new PublicKey(decoded.owner).toBase58();
            const isFrozen = decoded.state === 2; // AccountState.Frozen = 2

            holders.push({
              owner,
              balance: balance.toString(),
              account: pubkey.toBase58(),
              frozen: isFrozen,
            });
          } catch {
            // Skip accounts that can't be decoded (extended accounts)
            // Token-2022 accounts with extensions have larger data sizes
            continue;
          }
        }

        // Sort by balance descending
        holders.sort((a, b) => {
          const balA = BigInt(a.balance);
          const balB = BigInt(b.balance);
          if (balB > balA) return 1;
          if (balB < balA) return -1;
          return 0;
        });

        // Apply top N filter
        const result = topN !== undefined ? holders.slice(0, topN) : holders;

        // Add summary
        const totalHolders = holders.length;
        const nonZeroHolders = holders.filter((h) => h.balance !== "0").length;

        if (outputFormat === "json") {
          const output = {
            mint: mintPubkey.toBase58(),
            totalAccounts: totalHolders,
            nonZeroHolders,
            holders: result,
          };
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          process.stdout.write(
            `Mint: ${mintPubkey.toBase58()}\n` +
            `Total accounts: ${totalHolders}  |  Non-zero holders: ${nonZeroHolders}\n\n`
          );
          if (result.length > 0) {
            process.stdout.write(formatOutput(result, outputFormat) + "\n");
          } else {
            logWarning("No holders found.");
          }
        }
      } catch (err) {
        logError(`Failed to fetch holders: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
