import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { loadSssConfig, makeConnection } from "../utils/config.js";
import { printTable, printError } from "../utils/output.js";

export function registerHolders(program: Command): void {
  program
    .command("holders")
    .description("List token holders for the active stablecoin")
    .option("--min-balance <amount>", "Only show holders with balance >= this amount (in base units)", "0")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found. Run `sss-token init` first.");

        const mintKey = new PublicKey(mintAddr);
        const connection = makeConnection(globalOpts.cluster);
        const minBalance = BigInt(opts.minBalance as string);

        // Fetch all Token-2022 accounts for this mint
        const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
          filters: [
            { dataSize: 165 }, // standard token account size
            {
              memcmp: {
                offset: 0,
                bytes: mintKey.toBase58(),
              },
            },
          ],
        });

        const rows: Record<string, string>[] = [];
        for (const { pubkey, account } of accounts) {
          // Token account layout: mint (32) | owner (32) | amount (8, little-endian u64)
          const data = account.data;
          const owner = new PublicKey(data.slice(32, 64)).toBase58();
          const amount = data.readBigUInt64LE(64);

          if (amount < minBalance) continue;

          rows.push({
            account: pubkey.toBase58(),
            owner,
            balance: amount.toString(),
          });
        }

        // Sort descending by balance
        rows.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));

        if (rows.length === 0) {
          console.log("  (no holders found)");
          return;
        }

        printTable(rows);
        console.log(`\n  total holders: ${rows.length}`);
      } catch (err) {
        printError(err);
      }
    });
}
