#!/usr/bin/env node
/**
 * sss-token — CLI for the Solana Stablecoin Standard
 *
 * Wraps StablecoinClient and ComplianceClient from the SSS SDK and exposes
 * every on-chain instruction as a typed, discoverable CLI command.
 *
 * Global options (available on every command):
 *   --keypair  <path>    Path to signer keypair JSON    (default: ~/.config/solana/id.json)
 *   --url      <url>     RPC cluster URL                (default: http://localhost:8899)
 *   --output   <format>  Output format: table|json|csv  (default: table)
 *   --yes                Skip confirmation prompts
 *   --dry-run            Simulate only — print what would happen without executing
 */

import { Command } from "commander";

// Command group registrations
import { registerInitCommand }       from "./commands/init";
import { registerMintCommand }       from "./commands/mint";
import { registerBurnCommand }       from "./commands/burn";
import { registerFreezeCommands }    from "./commands/freeze";
import { registerPauseCommands }     from "./commands/pause";
import { registerMinterCommands }    from "./commands/minter";
import { registerBlacklistCommands } from "./commands/blacklist";
import { registerRolesCommands }     from "./commands/roles";
import { registerInfoCommands }      from "./commands/info";

// ---------------------------------------------------------------------------
// Program root
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("sss-token")
  .description("CLI for the Solana Stablecoin Standard (SSS-1 & SSS-2)")
  .version("0.1.0");

// ---------------------------------------------------------------------------
// Global options — declared on the root program so every sub-command can
// access them via cmd.parent?.opts() (or cmd.parent?.parent?.opts() for
// nested sub-commands).
// ---------------------------------------------------------------------------

program
  .option(
    "--keypair <path>",
    "Path to a Solana keypair JSON file",
    "~/.config/solana/id.json"
  )
  .option(
    "--url <url>",
    "Solana RPC cluster URL",
    "http://localhost:8899"
  )
  .option(
    "--output <format>",
    "Output format: table | json | csv",
    (value: string) => {
      const allowed = ["table", "json", "csv"];
      if (!allowed.includes(value)) {
        console.error(
          `\x1b[31m✗ Invalid --output "${value}". Choose one of: ${allowed.join(", ")}\x1b[0m`
        );
        process.exit(1);
      }
      return value;
    },
    "table"
  )
  .option("--yes", "Skip confirmation prompts", false)
  .option("--dry-run", "Print what would happen without executing", false);

// ---------------------------------------------------------------------------
// Register command groups
// ---------------------------------------------------------------------------

registerInitCommand(program);
registerMintCommand(program);
registerBurnCommand(program);
registerFreezeCommands(program);
registerPauseCommands(program);
registerMinterCommands(program);
registerBlacklistCommands(program);
registerRolesCommands(program);
registerInfoCommands(program);

// ---------------------------------------------------------------------------
// Error handling and parse
// ---------------------------------------------------------------------------

// Surface unknown commands as errors instead of silently ignoring them
program.showHelpAfterError(true);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\x1b[31m✗ ${msg}\x1b[0m\n`);
  process.exit(1);
});
