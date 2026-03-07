import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import chalk from "chalk";
import Table from "cli-table3";
import { getConnection, loadConfig, loadKeypair, resolveMint } from "../config";

export function registerHolders(program: Command): void {
  program
    .command("holders")
    .description("List all token holders")
    .option("--min-balance <amount>", "Minimum balance to show", "0")
    .option("--mint <pubkey>", "Mint address")
    .option("--config <path>", "CLI config file path")
    .action(async (opts) => {
      const cfg = loadConfig(opts.config);
      const connection = getConnection(cfg);
      const mintPubkey = resolveMint(cfg, opts.mint);

      console.log(chalk.cyan("Fetching token accounts..."));

      const accounts = await connection.getParsedProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        {
          filters: [
            { dataSize: 165 },
            {
              memcmp: {
                offset: 0,
                bytes: mintPubkey.toBase58(),
              },
            },
          ],
        }
      );

      const minBalance = BigInt(opts.minBalance) * BigInt(1e6);

      const table = new Table({
        head: ["Owner", "Token Account", "Balance"],
      });

      let count = 0;
      for (const acc of accounts) {
        const parsed = (acc.account.data as { parsed: { info: { owner: string; tokenAmount: { uiAmount: number } } } }).parsed;
        const balance = BigInt(
          Math.floor((parsed.info.tokenAmount.uiAmount ?? 0) * 1e6)
        );
        if (balance >= minBalance) {
          table.push([
            parsed.info.owner,
            acc.pubkey.toBase58(),
            parsed.info.tokenAmount.uiAmount?.toString() ?? "0",
          ]);
          count++;
        }
      }

      if (count === 0) {
        console.log(chalk.yellow("No holders found."));
      } else {
        console.log(table.toString());
        console.log(chalk.dim(`${count} holders`));
      }
    });
}
