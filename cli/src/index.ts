#!/usr/bin/env node
/**
 * sss-token CLI — admin tool for Solana Stablecoin Standard deployments
 *
 * Global flags (available on every command):
 *   --cluster <name|url>   RPC endpoint (mainnet|devnet|testnet|localnet|URL). Default: devnet
 *   --keypair <path>       Keypair JSON file. Default: ~/.config/solana/id.json
 *   --mint <address>       Active stablecoin mint. Defaults to value in .sss-config.json
 *   --json                 Machine-readable JSON output
 */

import { Command } from "commander";
import { setJsonMode } from "./utils/output.js";
import { registerInit } from "./commands/init.js";
import { registerStatus } from "./commands/status.js";
import { registerMint } from "./commands/mint.js";
import { registerBurn } from "./commands/burn.js";
import { registerFreeze } from "./commands/freeze.js";
import { registerPause } from "./commands/pause.js";
import { registerBlacklist } from "./commands/blacklist.js";
import { registerSeize } from "./commands/seize.js";
import { registerMinters } from "./commands/minters.js";
import { registerSupply } from "./commands/status.js";
import { registerHolders } from "./commands/holders.js";
import { registerAuditLog } from "./commands/audit-log.js";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard — CLI admin tool")
  .version("0.1.0")
  .option("--cluster <cluster>", "Solana cluster or RPC URL", "devnet")
  .option("--keypair <path>", "Path to authority keypair JSON")
  .option("--mint <address>", "Stablecoin mint address (overrides .sss-config.json)")
  .option("--json", "Output results as JSON", false)
  .hook("preAction", (cmd) => {
    const opts = cmd.opts() as { json: boolean };
    setJsonMode(opts.json);
  });

registerInit(program);
registerStatus(program);
registerMint(program);
registerBurn(program);
registerFreeze(program);
registerPause(program);
registerBlacklist(program);
registerSeize(program);
registerMinters(program);
registerSupply(program);
registerHolders(program);
registerAuditLog(program);

program.parse(process.argv);
