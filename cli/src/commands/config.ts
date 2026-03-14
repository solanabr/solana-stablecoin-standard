import { Command } from "commander";
import chalk from "chalk";
import { table } from "table";
import { getStoredConfig, setRpcUrl } from "../config";

export function registerConfigCommands(program: Command): void {
  const configCmd = program.command("config").description("Manage CLI configuration");

  configCmd
    .command("get")
    .description("Show configured RPC URL and default mint")
    .action(() => {
      const stored = getStoredConfig();
      console.log(table([
        ["rpcUrl", stored.rpcUrl],
        ["defaultMint", stored.defaultMint || "(not set)"],
      ]));
    });

  configCmd
    .command("set <rpcUrl>")
    .description("Set default RPC URL used for all CLI RPC calls")
    .action((rpcUrl) => {
      setRpcUrl(rpcUrl);
      const stored = getStoredConfig();
      console.log(chalk.green(`✓ rpcUrl set to ${stored.rpcUrl}`));
    });
}
