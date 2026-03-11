#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init";
import { registerTokenCommands } from "./commands/token";
import { registerAdminCommands } from "./commands/admin";

const program = new Command();

program
  .name("sss-token")
  .description("S\u00b3 \u2014 Solana Stablecoin Standard CLI")
  .version("0.1.0")
  .option("--url <rpc>", "Solana RPC URL or moniker (mainnet, devnet, localnet)", "localnet")
  .option("--keypair <path>", "Wallet keypair file path")
  .option("--output <format>", "Output format: text | json", "text");

registerInitCommand(program);
registerTokenCommands(program);
registerAdminCommands(program);

program.parse();
