import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey } from "@solana/web3.js";
import { getStablecoinContext } from "../lib/context";
import { exitWithError, failSpinner } from "../lib/output";

export function registerComplianceCommands(program: Command): void {
  const blacklistCmd = program.command("blacklist").description("Blacklist management (SSS-2 only)");

  blacklistCmd
    .command("add <address>")
    .option("--reason <reason>", "Reason for blacklisting", "Compliance action")
    .description("Add an address to the blacklist")
    .action(async (address, opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Blacklisting ${address}...`).start();
      try {
        const sig = await stable.compliance.blacklistAdd(new PublicKey(address), opts.reason);
        spinner.succeed(chalk.green("✓ Address blacklisted\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  blacklistCmd
    .command("remove <address>")
    .option("--reason <reason>", "Reason for removal", "Compliance cleared")
    .description("Remove an address from the blacklist")
    .action(async (address, opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Removing ${address} from blacklist...`).start();
      try {
        const sig = await stable.compliance.blacklistRemove(new PublicKey(address), opts.reason);
        spinner.succeed(chalk.green("✓ Address removed from blacklist\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  blacklistCmd
    .command("check <address>")
    .description("Check if an address is blacklisted")
    .action(async (address, _opts, cmd) => {
      try {
        const { stable } = await getStablecoinContext(cmd);
        const blacklisted = await stable.compliance.isBlacklisted(new PublicKey(address));
        console.log(blacklisted ? chalk.red(`🚫 ${address} IS blacklisted`) : chalk.green(`✓ ${address} is NOT blacklisted`));
      } catch (error) {
        exitWithError(error);
      }
    });

  program
    .command("seize <address>")
    .option("--to <treasury>", "Treasury address to receive seized tokens")
    .description("Seize tokens from a blacklisted address (SSS-2)")
    .action(async (address, opts, cmd) => {
      if (!opts.to) {
        console.error(chalk.red("--to <treasury> is required"));
        process.exit(1);
      }

      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora(`Seizing tokens from ${address}...`).start();
      try {
        const sig = await stable.compliance.seize(new PublicKey(address), new PublicKey(opts.to));
        spinner.succeed(chalk.green("✓ Tokens seized\n") + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });
}
