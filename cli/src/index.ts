#!/usr/bin/env node
import { Command } from "commander";
import { version } from "../package.json";
import { ensureConfigFile } from "./config";
import { registerAuditCommands } from "./commands/audit";
import { registerComplianceCommands } from "./commands/compliance";
import { registerConfigCommands } from "./commands/config";
import { registerInitCommands } from "./commands/init";
import { registerMinterCommands } from "./commands/minters";
import { registerRegistryCommands } from "./commands/registry";
import { registerRoleCommands } from "./commands/roles";
import { registerTokenCommands } from "./commands/token";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard — operator CLI")
  .version(version)
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-u, --url <url>", "RPC URL (overrides config)")
  .option("-m, --mint <address>", "Stablecoin mint address");

ensureConfigFile();

registerInitCommands(program);
registerTokenCommands(program);
registerConfigCommands(program);
registerRegistryCommands(program);
registerMinterCommands(program);
registerRoleCommands(program);
registerComplianceCommands(program);
registerAuditCommands(program);

program.parse();
