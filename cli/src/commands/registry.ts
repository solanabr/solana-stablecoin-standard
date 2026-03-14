import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { table } from "table";
import { setDefaultMint } from "../config";
import { getCliConfig, getMintContext, getStablecoinContext } from "../lib/context";
import { exitWithError, failSpinner } from "../lib/output";

export function registerRegistryCommands(program: Command): void {
  program
    .command("list")
    .description("List all configured stablecoins")
    .action((_, cmd) => {
      const config = getCliConfig(cmd);
      if (config.mints.size === 0) {
        console.log(chalk.yellow("No stablecoins configured. Create one with 'sss-token init'"));
        return;
      }

      const rows = [["Alias", "Mint Address", "Default"]];
      for (const [alias, address] of config.mints.entries()) {
        rows.push([alias, address, config.currentMint?.toBase58() === address ? chalk.green("✓") : ""]);
      }
      console.log(table(rows));
    });

  program
    .command("use <alias-or-address>")
    .description("Set default stablecoin by alias or address")
    .action((aliasOrAddress) => {
      setDefaultMint(aliasOrAddress);
    });

  program
    .command("status [mint]")
    .description("Show stablecoin status (optionally specify mint address or alias)")
    .action(async (mintArg, cmd) => {
      const { config, mint, stable } = await getStablecoinContext(cmd, mintArg);
      const spinner = ora("Fetching status...").start();
      try {
        const state = await stable.getState();
        const supply = await stable.getTotalSupply();
        spinner.stop();

        const alias = Array.from(config.mints.entries()).find(([, addr]) => addr === mint.toBase58())?.[0] || "";
        console.log(table([
          ["Alias", alias || "(unnamed)"],
          ["Name", state.name],
          ["Symbol", state.symbol],
          ["Mint", mint.toBase58()],
          ["Decimals", state.decimals.toString()],
          ["Total Supply", supply.toLocaleString()],
          ["Paused", state.paused ? chalk.red("YES") : chalk.green("NO")],
          ["Compliance (SSS-2)", state.complianceEnabled ? chalk.cyan("Enabled") : "Disabled"],
          ["Transfer Hook", state.transferHookEnabled ? chalk.cyan("Enabled") : "Disabled"],
          ["Master Authority", state.masterAuthority.toBase58()],
          ["Pauser", state.pauser ? state.pauser.toBase58() : "(none)"],
          ["Burner", state.burner ? state.burner.toBase58() : "(none)"],
          ["Freezer", state.freezer ? state.freezer.toBase58() : "(none)"],
          ["Blacklister", state.blacklister ? state.blacklister.toBase58() : "(none)"],
          ["Seizer", state.seizer ? state.seizer.toBase58() : "(none)"],
        ]));
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  program
    .command("supply [mint]")
    .description("Show current token supply (optionally specify mint address or alias)")
    .action(async (mintArg, cmd) => {
      const { config, mint, stable } = await getStablecoinContext(cmd, mintArg);
      try {
        const supply = await stable.getTotalSupply();
        const alias = Array.from(config.mints.entries()).find(([, addr]) => addr === mint.toBase58())?.[0] || "";
        if (alias) {
          console.log(`Supply (${chalk.cyan(alias)}): ${chalk.cyan(supply.toLocaleString())} tokens`);
          console.log(`Mint: ${chalk.dim(mint.toBase58())}`);
        } else {
          console.log(`Supply: ${chalk.cyan(supply.toLocaleString())} tokens`);
          console.log(`Mint: ${chalk.dim(mint.toBase58())}`);
        }
      } catch (error) {
        exitWithError(error);
      }
    });

  program
    .command("holders")
    .option("--limit <n>", "Max holders to display", "20")
    .description("List token holders for this stablecoin")
    .action(async (opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const spinner = ora("Fetching holders...").start();
      try {
        const holders = await stable.getHolders();
        spinner.stop();
        if (holders.length === 0) {
          console.log(chalk.yellow("No holders found."));
          return;
        }

        const limit = parseInt(opts.limit, 10);
        const rows: string[][] = [["#", "Owner", "Balance"]];
        holders.slice(0, limit).forEach((holder, index) => {
          rows.push([(index + 1).toString(), holder.owner.toBase58(), holder.balance.toLocaleString()]);
        });
        console.log(table(rows));
        if (holders.length > limit) {
          console.log(chalk.dim(`  ... and ${holders.length - limit} more holders`));
        }
      } catch (error) {
        failSpinner(spinner, error);
      }
    });
}
