import { Command } from "commander";

import { registerAllowlistCommands } from "./commands/allowlist";
import { registerAskCommand } from "./commands/ask";
import { registerAuthorityCommands } from "./commands/authority";
import { registerComplianceCommands } from "./commands/compliance";
import { registerConfigCommands } from "./commands/config-cmd";
import { registerInitCommand } from "./commands/init";
import { registerManagementCommands } from "./commands/management";
import { registerOracleCommands } from "./commands/oracle";
import { registerOperationCommands } from "./commands/operations";

export function createCli(): Command {
  const program = new Command();

  program
    .name("sss-token")
    .description("Operator CLI for the Solana Stablecoin Standard (SSS)")
    .version("0.1.0")
    .showHelpAfterError()
    .option("--url <rpc>", "RPC URL override")
    .option("--keypair <path>", "Keypair path override")
    .option("--cluster <cluster>", "Cluster override (localnet, devnet, mainnet-beta)")
    .option("--output <format>", "Output format (text, json)")
    .option("--mint <address>", "Stablecoin mint address override")
    .option("--program <address>", "Core program ID override");

  registerInitCommand(program);
  registerOperationCommands(program);
  registerComplianceCommands(program);
  registerManagementCommands(program);
  registerAuthorityCommands(program);
  registerAllowlistCommands(program);
  registerOracleCommands(program);
  registerConfigCommands(program);
  registerAskCommand(program);

  return program;
}
