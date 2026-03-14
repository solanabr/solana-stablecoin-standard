import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey } from "@solana/web3.js";
import { table } from "table";
import { getStablecoinContext } from "../lib/context";
import { failSpinner } from "../lib/output";

export function registerMinterCommands(program: Command): void {
  const mintersCmd = program.command("minters").description("Manage minters");

  mintersCmd
    .command("add <address>")
    .option("--quota <quota>", "Lifetime quota (0 = unlimited)", "0")
    .description("Add or update a minter")
    .action(async (address, opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Adding minter ${address}...`).start();
      try {
        const sig = await stable.addMinter(new PublicKey(address), BigInt(opts.quota));
        spinner.succeed(chalk.green("✓ Minter added\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  mintersCmd
    .command("increase <address> <amount>")
    .description("Increase an existing minter's lifetime quota")
    .action(async (address, amount, _opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Increasing quota for ${address} by ${amount}...`).start();
      try {
        const sig = await stable.increaseMinterQuota(new PublicKey(address), BigInt(amount));
        spinner.succeed(chalk.green("✓ Minter quota increased\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  mintersCmd
    .command("remove <address>")
    .description("Deactivate a minter")
    .action(async (address, _opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Removing minter ${address}...`).start();
      try {
        const sig = await stable.removeMinter(new PublicKey(address));
        spinner.succeed(chalk.green("✓ Minter deactivated\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  mintersCmd
    .command("list")
    .description("List all minters for this stablecoin")
    .action(async (_opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora("Fetching minters...").start();
      try {
        const minters = await stable.listMinters();
        spinner.stop();
        if (minters.length === 0) {
          console.log(chalk.yellow("No minters found."));
          return;
        }

        const rows: string[][] = [["Address", "Quota", "Minted (total)", "Active"]];
        for (const minter of minters) {
          rows.push([
            minter.address.toBase58(),
            minter.quota === 0n ? "unlimited" : minter.quota.toLocaleString(),
            minter.mintedTotal.toLocaleString(),
            minter.active ? chalk.green("YES") : chalk.red("NO"),
          ]);
        }
        console.log(table(rows));
      } catch (error) {
        failSpinner(spinner, error);
      }
    });
}
