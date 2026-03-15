#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init";
import { mintCommand } from "./commands/mint";
import { burnCommand } from "./commands/burn";
import { freezeCommand } from "./commands/freeze";
import { pauseCommand } from "./commands/pause";
import { rolesCommand } from "./commands/roles";
import { blacklistCommand } from "./commands/blacklist";
import { statusCommand } from "./commands/status";

const program = new Command();

program
  .name("sss-token")
  .description("CLI for the Solana Stablecoin Standard (SSS-1/SSS-2)")
  .version("0.1.0")
  .option("-c, --cluster <url>", "Solana cluster URL", "http://localhost:8899")
  .option("-k, --keypair <path>", "Path to keypair file", "~/.config/solana/id.json")
  .option("-v, --verbose", "Enable verbose output");

// ─── Initialize ──────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize a new stablecoin")
  .requiredOption("--preset <preset>", "Preset standard: sss-1, sss-2, or custom")
  .requiredOption("--name <n>", "Token name (max 32 chars)")
  .requiredOption("--symbol <symbol>", "Token symbol (max 10 chars)")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--decimals <n>", "Decimal places", "6")
  .option("--default-frozen", "Freeze new accounts by default (KYC gating)")
  .option("--config <path>", "Custom config JSON/TOML file (for --preset custom)")
  .action(initCommand);

program
  .command("init-hook")
  .description("Initialize transfer hook extra account metas PDA (SSS-2 only)")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .action(async (opts: any) => {
    const parent = opts.parent || {};
    const cluster = parent.cluster || opts.cluster || "http://localhost:8899";
    const keypair = parent.keypair || opts.keypair || "~/.config/solana/id.json";
    try {
      const { getProvider, loadStablecoin } = await import("./commands/utils");
      const provider = await getProvider(cluster, keypair);
      const stablecoin = await loadStablecoin(provider, opts.mint);
      if (!stablecoin.isComplianceEnabled()) {
        console.error("❌ Transfer hook requires SSS-2 preset");
        process.exit(1);
      }
      console.log("\n🔗 Initializing transfer hook extra account metas...");
      const sig = await stablecoin.compliance.initializeTransferHook();
      console.log("✅ Transfer hook initialized");
      console.log(`   Signature: ${sig}`);
    } catch (err: any) {
      console.error(`\n❌ Hook init failed: ${err.message}`);
      process.exit(1);
    }
  });

// ─── Token Operations ────────────────────────────────────────────

program
  .command("mint")
  .description("Mint tokens to a destination account")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--to <address>", "Destination token account")
  .requiredOption("--amount <amount>", "Amount to mint (in base units)")
  .action(mintCommand);

program
  .command("burn")
  .description("Burn tokens from a source account")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--from <address>", "Source token account")
  .requiredOption("--amount <amount>", "Amount to burn (in base units)")
  .action(burnCommand);

program
  .command("freeze")
  .description("Freeze a token account")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--account <address>", "Token account to freeze")
  .action(freezeCommand);

program
  .command("thaw")
  .description("Thaw a frozen token account")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--account <address>", "Token account to thaw")
  .action((opts: any) => freezeCommand({ ...opts, thaw: true }));

program
  .command("pause")
  .description("Pause all token operations")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .action(pauseCommand);

program
  .command("unpause")
  .description("Unpause token operations")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .action((opts: any) => pauseCommand({ ...opts, unpause: true }));

// ─── Role Management ─────────────────────────────────────────────

const roles = program
  .command("roles")
  .description("Manage roles");

roles
  .command("grant")
  .description("Grant a role to an address")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to grant role to")
  .requiredOption("--role <role>", "Role: minter, burner, pauser, blacklister, seizer")
  .option("--quota <amount>", "Mint quota (for minter role, 0 = unlimited)")
  .action((opts: any) => rolesCommand({ ...opts, action: "grant" }));

roles
  .command("revoke")
  .description("Revoke a role from an address")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to revoke role from")
  .requiredOption("--role <role>", "Role: minter, burner, pauser, blacklister, seizer")
  .action((opts: any) => rolesCommand({ ...opts, action: "revoke" }));

roles
  .command("list")
  .description("List roles for an address")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to check")
  .action((opts: any) => rolesCommand({ ...opts, action: "list" }));

// ─── Minters (convenience shortcuts) ────────────────────────────

const minters = program
  .command("minters")
  .description("Manage minters (shorthand for roles)");

minters
  .command("add")
  .description("Add a minter")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Minter address")
  .option("--quota <amount>", "Mint quota (0 = unlimited)")
  .action((opts: any) => rolesCommand({ ...opts, role: "minter", action: "grant" }));

minters
  .command("remove")
  .description("Remove a minter")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Minter address")
  .action((opts: any) => rolesCommand({ ...opts, role: "minter", action: "revoke" }));

minters
  .command("list")
  .description("List minters (check specific address)")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to check")
  .action((opts: any) => rolesCommand({ ...opts, role: "minter", action: "list" }));

// ─── Compliance (SSS-2) ─────────────────────────────────────────

const blacklist = program
  .command("blacklist")
  .description("Manage blacklist (SSS-2 only)");

blacklist
  .command("add")
  .description("Add an address to the blacklist")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to blacklist")
  .option("--reason <reason>", "Reason for blacklisting", "")
  .action((opts: any) => blacklistCommand({ ...opts, action: "add" }));

blacklist
  .command("remove")
  .description("Remove an address from the blacklist")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to remove from blacklist")
  .action((opts: any) => blacklistCommand({ ...opts, action: "remove" }));

blacklist
  .command("check")
  .description("Check if an address is blacklisted")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--address <address>", "Address to check")
  .action((opts: any) => blacklistCommand({ ...opts, action: "check" }));

program
  .command("seize")
  .description("Seize tokens from a blacklisted account (SSS-2 only)")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .requiredOption("--from <address>", "Blacklisted token account")
  .requiredOption("--to <address>", "Treasury/destination token account")
  .requiredOption("--amount <amount>", "Amount to seize")
  .requiredOption("--owner <address>", "Blacklisted wallet address (owner of --from)")
  .action((opts: any) => blacklistCommand({ ...opts, action: "seize" }));

// ─── Status & Info ───────────────────────────────────────────────

program
  .command("status")
  .description("Show stablecoin status and configuration")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .action(statusCommand);

program
  .command("supply")
  .description("Show supply information")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .action((opts: any) => statusCommand({ ...opts, supplyOnly: true }));

program
  .command("holders")
  .description("List token holders")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .option("--min-balance <amount>", "Minimum balance filter", "0")
  .action((opts: any) => statusCommand({ ...opts, holders: true }));

program
  .command("audit-log")
  .description("Show recent on-chain events for this stablecoin")
  .requiredOption("--mint <address>", "Stablecoin mint address")
  .option("--action <type>", "Filter by action: mint, burn, freeze, blacklist, seize, etc.")
  .option("--limit <n>", "Number of events to show", "20")
  .action((opts: any) => statusCommand({ ...opts, auditLog: true }));

program.parse();
