#!/usr/bin/env node
import { Command } from "commander";
import { initConfig } from "./config";
import { registerInitCommand } from "./commands/init";
import { registerOperationCommands } from "./commands/operations";
import { registerComplianceCommands } from "./commands/compliance";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard CLI")
  .version("0.1.0");

// Config management
program
  .command("config")
  .description("Configuration management")
  .addCommand(
    new Command("init").description("Initialize CLI config").action(initConfig)
  );

// Core commands
registerInitCommand(program);
registerOperationCommands(program);
registerComplianceCommands(program);

program.parse(process.argv);
