#!/usr/bin/env node
import { Command } from "commander";
import { registerInit } from "./commands/init";
import { registerStatus } from "./commands/status";
import { registerMint } from "./commands/mint";
import { registerBurn } from "./commands/burn";
import { registerFreeze } from "./commands/freeze";
import { registerPause } from "./commands/pause";
import { registerMinters } from "./commands/minters";
import { registerBlacklist } from "./commands/blacklist";
import { registerSeize } from "./commands/seize";
import { registerHolders } from "./commands/holders";
import { registerAuditLog } from "./commands/audit-log";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard admin CLI")
  .version("0.1.0");

registerInit(program);
registerStatus(program);
registerMint(program);
registerBurn(program);
registerFreeze(program);
registerPause(program);
registerMinters(program);
registerBlacklist(program);
registerSeize(program);
registerHolders(program);
registerAuditLog(program);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error("Error:", err.message);
  process.exit(1);
});
