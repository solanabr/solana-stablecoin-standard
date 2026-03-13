#!/usr/bin/env node

/**
 * sss-token CLI — Command-line interface for the Solana Stablecoin Standard.
 *
 * Global flags:
 *   --keypair <path>   Path to signer keypair (default: ~/.config/solana/id.json)
 *   --url <rpc>        RPC URL (default: from Solana CLI config)
 *
 * Usage:
 *   sss-token init --preset sss-2 --name "USDBRL" --symbol "BRLs" --decimals 6
 *   sss-token mint <recipient> <amount>
 *   sss-token burn <amount>
 *   sss-token freeze <address>
 *   sss-token thaw <address>
 *   sss-token pause / unpause
 *   sss-token status / supply
 *   sss-token blacklist add <address> --reason "OFAC match"
 *   sss-token blacklist remove <address>
 *   sss-token seize <address> --to <treasury>
 *   sss-token minters list / add / remove
 */

import { Command } from "commander";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  SolanaStablecoin,
  Presets,
  fetchStablecoinConfig,
  fetchRoleManager,
  deriveConfigPda,
  deriveRolesPda,
} from "@stbr/sss-token";
import {
  getConnection,
  getWallet,
  loadKeypair,
  loadTomlConfig,
  shortKey,
  formatAmount,
  log,
} from "./helpers";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard CLI — manage stablecoins on Solana")
  .version("0.1.0")
  .option("--keypair <path>", "Path to signer keypair")
  .option("--url <rpc>", "RPC URL");

// ── Helper: resolve mint from env/flag ──────────────────────────────────

function resolveMint(opts: { mint?: string }): PublicKey {
  const mintStr = opts.mint ?? process.env.SSS_MINT;
  if (!mintStr) {
    throw new Error(
      "No mint specified. Use --mint <address> or set SSS_MINT env variable."
    );
  }
  return new PublicKey(mintStr);
}

function getGlobalOpts(): { keypair?: string; url?: string } {
  return program.opts();
}

// ── Init Command ────────────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize a new stablecoin")
  .option("--preset <preset>", "Use a preset (sss-1, sss-2, sss-3)")
  .option("--custom <config>", "Use a custom TOML config file")
  .option("--name <name>", "Token name")
  .option("--symbol <symbol>", "Token symbol")
  .option("--decimals <decimals>", "Token decimals", "6")
  .option("--uri <uri>", "Metadata URI", "")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);

      let name: string, symbol: string, decimals: number, uri: string;
      let preset: string | undefined;

      if (options.custom) {
        // Load from TOML config
        const config = loadTomlConfig(options.custom);
        name = config.name;
        symbol = config.symbol;
        decimals = config.decimals;
        uri = config.uri ?? "";
        preset = config.preset;
        log.info(`Loaded config from ${options.custom}`);
      } else {
        name = options.name;
        symbol = options.symbol;
        decimals = parseInt(options.decimals);
        uri = options.uri ?? "";
        preset = options.preset;
      }

      if (!name || !symbol) {
        log.error("--name and --symbol are required (or use --custom config.toml)");
        process.exit(1);
      }

      const presetEnum = preset
        ? preset.toUpperCase().replace("-", "_") as keyof typeof Presets
        : undefined;

      log.info(`Initializing ${presetEnum ?? "custom"} stablecoin: ${name} (${symbol})`);

      const stable = await SolanaStablecoin.create(connection, wallet, {
        preset: presetEnum,
        name,
        symbol,
        decimals,
        uri,
      });

      log.success(`Stablecoin initialized!`);
      console.log(`   Mint:   ${stable.getMint().toBase58()}`);
      console.log(`   Config: ${stable.getConfigPda().toBase58()}`);
      console.log(`   Roles:  ${stable.getRolesPda().toBase58()}`);
      console.log(`\n   Set SSS_MINT=${stable.getMint().toBase58()} for subsequent commands.`);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Mint Command ────────────────────────────────────────────────────────

program
  .command("mint <recipient> <amount>")
  .description("Mint tokens to a recipient")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .option("--minter <keypair>", "Minter keypair path")
  .action(async (recipient: string, amount: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);
      const minter = options.minter ? loadKeypair(options.minter) : undefined;

      log.info(`Minting ${amount} tokens to ${shortKey(recipient)}...`);

      const sig = await stable.mint({
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
        minter,
      });

      log.success(`Minted ${amount} tokens`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Burn Command ────────────────────────────────────────────────────────

program
  .command("burn <amount>")
  .description("Burn tokens from your account")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (amount: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Burning ${amount} tokens...`);
      const sig = await stable.burn({ amount: BigInt(amount) });

      log.success(`Burned ${amount} tokens`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Freeze/Thaw Commands ────────────────────────────────────────────────

program
  .command("freeze <address>")
  .description("Freeze a token account")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Freezing account for ${shortKey(address)}...`);
      const sig = await stable.freeze({ address: new PublicKey(address) });

      log.success(`Account frozen`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("thaw <address>")
  .description("Thaw a frozen token account")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Thawing account for ${shortKey(address)}...`);
      const sig = await stable.thaw({ address: new PublicKey(address) });

      log.success(`Account thawed`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Pause/Unpause Commands ──────────────────────────────────────────────

program
  .command("pause")
  .description("Pause all mint/burn operations")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info("Pausing operations...");
      const sig = await stable.pause();

      log.success("Operations paused");
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("unpause")
  .description("Unpause all operations")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info("Unpausing operations...");
      const sig = await stable.unpause();

      log.success("Operations unpaused");
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Status Command ──────────────────────────────────────────────────────

program
  .command("status")
  .description("Show stablecoin status")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const mintPk = resolveMint(options);

      const [configPda] = deriveConfigPda(mintPk);
      const [rolesPda] = deriveRolesPda(configPda);

      const config = await fetchStablecoinConfig(connection, configPda);
      const roles = await fetchRoleManager(connection, rolesPda);

      const supply = config.totalMinted - config.totalBurned;

      console.log("\n┌─────────────────────────────────────────────────────┐");
      console.log(`│  ${config.name} (${config.symbol})`.padEnd(54) + "│");
      console.log("├─────────────────────────────────────────────────────┤");
      console.log(`│  Mint:       ${mintPk.toBase58().slice(0, 36)}...   │`);
      console.log(`│  Decimals:   ${config.decimals}`.padEnd(54) + "│");
      console.log(`│  Paused:     ${config.isPaused ? "🔴 YES" : "🟢 NO"}`.padEnd(55) + "│");
      console.log("├─────────────────────────────────────────────────────┤");
      console.log(`│  Supply:     ${formatAmount(supply, config.decimals)}`.padEnd(54) + "│");
      console.log(`│  Minted:     ${formatAmount(config.totalMinted, config.decimals)}`.padEnd(54) + "│");
      console.log(`│  Burned:     ${formatAmount(config.totalBurned, config.decimals)}`.padEnd(54) + "│");
      console.log("├─────────────────────────────────────────────────────┤");
      console.log(`│  Features:`.padEnd(54) + "│");
      console.log(`│    Permanent Delegate:    ${config.enablePermanentDelegate ? "✅" : "❌"}`.padEnd(55) + "│");
      console.log(`│    Transfer Hook:         ${config.enableTransferHook ? "✅" : "❌"}`.padEnd(55) + "│");
      console.log(`│    Confidential:          ${config.enableConfidentialTransfers ? "✅" : "❌"}`.padEnd(55) + "│");
      console.log(`│    Default Frozen:        ${config.defaultAccountFrozen ? "✅" : "❌"}`.padEnd(55) + "│");
      console.log("├─────────────────────────────────────────────────────┤");
      console.log(`│  Roles:`.padEnd(54) + "│");
      console.log(`│    Authority:    ${shortKey(roles.masterAuthority)}`.padEnd(54) + "│");
      console.log(`│    Pauser:       ${shortKey(roles.pauser)}`.padEnd(54) + "│");
      console.log(`│    Blacklister:  ${shortKey(roles.blacklister)}`.padEnd(54) + "│");
      console.log(`│    Seizer:       ${shortKey(roles.seizer)}`.padEnd(54) + "│");
      console.log(`│    Minters:      ${roles.minters.length}`.padEnd(54) + "│");
      console.log(`│    Burners:      ${roles.burners.length}`.padEnd(54) + "│");
      console.log("└─────────────────────────────────────────────────────┘\n");
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Supply Command ──────────────────────────────────────────────────────

program
  .command("supply")
  .description("Show total token supply")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const mintPk = resolveMint(options);

      const [configPda] = deriveConfigPda(mintPk);
      const config = await fetchStablecoinConfig(connection, configPda);

      const supply = config.totalMinted - config.totalBurned;

      console.log(`\nToken: ${config.name} (${config.symbol})`);
      console.log(`Supply: ${formatAmount(supply, config.decimals)} ${config.symbol}`);
      console.log(`  Minted: ${formatAmount(config.totalMinted, config.decimals)}`);
      console.log(`  Burned: ${formatAmount(config.totalBurned, config.decimals)}\n`);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Blacklist Commands ──────────────────────────────────────────────────

const blacklist = program
  .command("blacklist")
  .description("SSS-2 blacklist management");

blacklist
  .command("add <address>")
  .description("Add address to blacklist")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .requiredOption("--reason <reason>", "Reason for blacklisting")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Blacklisting ${shortKey(address)}: "${options.reason}"`);
      const sig = await stable.compliance.blacklistAdd(
        new PublicKey(address),
        options.reason
      );

      log.success(`Address blacklisted`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

blacklist
  .command("remove <address>")
  .description("Remove address from blacklist")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Removing ${shortKey(address)} from blacklist...`);
      const sig = await stable.compliance.blacklistRemove(new PublicKey(address));

      log.success(`Address removed from blacklist`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Seize Command ───────────────────────────────────────────────────────

program
  .command("seize <address>")
  .description("Seize tokens from frozen blacklisted account")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .requiredOption("--to <treasury>", "Treasury address")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Seizing tokens from ${shortKey(address)} → ${shortKey(options.to)}`);
      const sig = await stable.compliance.seize(
        new PublicKey(address),
        new PublicKey(options.to)
      );

      log.success(`Tokens seized to treasury`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Minters Commands ────────────────────────────────────────────────────

const minters = program
  .command("minters")
  .description("Minter management");

minters
  .command("list")
  .description("List all minters and quotas")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const mintPk = resolveMint(options);

      const [configPda] = deriveConfigPda(mintPk);
      const [rolesPda] = deriveRolesPda(configPda);
      const config = await fetchStablecoinConfig(connection, configPda);
      const roles = await fetchRoleManager(connection, rolesPda);

      if (roles.minters.length === 0) {
        log.info("No minters configured.");
        return;
      }

      console.log(`\nMinters for ${config.name} (${config.symbol}):\n`);
      console.log("  Address                                      Quota              Minted");
      console.log("  " + "─".repeat(75));

      for (const minter of roles.minters) {
        const quota = formatAmount(minter.quota, config.decimals);
        const minted = formatAmount(minter.minted, config.decimals);
        console.log(`  ${minter.address.toBase58().padEnd(44)} ${quota.padStart(18)} ${minted.padStart(18)}`);
      }
      console.log();
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

minters
  .command("add <address>")
  .description("Add a minter with quota")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .requiredOption("--quota <amount>", "Minting quota (base units)")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Adding minter ${shortKey(address)} with quota ${options.quota}...`);
      const sig = await stable.updateMinter({
        minter: new PublicKey(address),
        quota: BigInt(options.quota),
      });

      log.success(`Minter added`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

minters
  .command("remove <address>")
  .description("Remove a minter")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .action(async (address: string, options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const wallet = getWallet(globalOpts.keypair);
      const mintPk = resolveMint(options);

      const stable = SolanaStablecoin.connect(connection, mintPk, wallet);

      log.info(`Removing minter ${shortKey(address)}...`);
      const sig = await stable.removeMinter(new PublicKey(address));

      log.success(`Minter removed`);
      log.tx(sig, globalOpts.url);
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Holders Command ─────────────────────────────────────────────────────

program
  .command("holders")
  .description("List token holders")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .option("--min-balance <amount>", "Minimum balance filter")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const mintPk = resolveMint(options);

      const [configPda] = deriveConfigPda(mintPk);
      const config = await fetchStablecoinConfig(connection, configPda);

      log.info("Fetching token accounts...");
      const { value: accounts } = await connection.getTokenLargestAccounts(mintPk);

      const minBalance = options.minBalance ? BigInt(options.minBalance) : BigInt(0);

      console.log(`\nHolders of ${config.name} (${config.symbol}):\n`);
      console.log("  Account                                      Balance");
      console.log("  " + "─".repeat(60));

      for (const account of accounts) {
        const amount = BigInt(account.amount);
        if (amount >= minBalance) {
          console.log(`  ${account.address.toBase58().padEnd(44)} ${formatAmount(amount, config.decimals).padStart(18)}`);
        }
      }
      console.log();
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Audit Log Command ───────────────────────────────────────────────────

program
  .command("audit-log")
  .description("Show recent transaction history for the stablecoin")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .option("--limit <n>", "Number of transactions to show", "10")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const mintPk = resolveMint(options);

      const [configPda] = deriveConfigPda(mintPk);

      log.info("Fetching recent transactions...");
      const sigs = await connection.getSignaturesForAddress(configPda, {
        limit: parseInt(options.limit),
      });

      if (sigs.length === 0) {
        log.info("No transactions found.");
        return;
      }

      console.log(`\nRecent transactions (last ${sigs.length}):\n`);
      console.log("  Time                    Status     Signature");
      console.log("  " + "─".repeat(75));

      for (const sig of sigs) {
        const time = sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString().replace("T", " ").slice(0, 19)
          : "unknown";
        const status = sig.err ? "❌ FAIL" : "✅ OK  ";
        console.log(`  ${time}   ${status}   ${sig.signature.slice(0, 44)}...`);
      }
      console.log();
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Audit Log Command ───────────────────────────────────────────────────

program
  .command("audit-log")
  .description("Show on-chain audit trail for a stablecoin")
  .option("--mint <address>", "Mint address (or set SSS_MINT)")
  .option("--action <type>", "Filter by action (mint, burn, freeze, thaw, blacklist, seize, pause)")
  .option("--format <fmt>", "Output format: table (default) or json", "table")
  .option("--limit <n>", "Max entries to show", "50")
  .action(async (options) => {
    try {
      const globalOpts = getGlobalOpts();
      const connection = getConnection(globalOpts.url);
      const mint = resolveMint(options);

      const limit = parseInt(options.limit) || 50;
      const sigs = await connection.getSignaturesForAddress(mint, { limit });

      // Instruction discriminator prefixes for event identification
      const ACTION_PATTERNS: Record<string, string[]> = {
        mint: ["Instruction: MintTokens", "TokensMinted"],
        burn: ["Instruction: BurnTokens", "TokensBurned"],
        freeze: ["Instruction: FreezeAccount", "AccountFrozen"],
        thaw: ["Instruction: ThawAccount", "AccountThawed"],
        pause: ["Instruction: Pause", "OperationsPaused"],
        unpause: ["Instruction: Unpause", "OperationsUnpaused"],
        blacklist: ["Instruction: AddToBlacklist", "AddressBlacklisted"],
        seize: ["Instruction: Seize", "TokensSeized"],
      };

      const entries: Array<{
        timestamp: string;
        action: string;
        signature: string;
        status: string;
      }> = [];

      for (const sig of sigs) {
        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx?.meta?.logMessages) continue;

        const logs = tx.meta.logMessages.join("\n");
        let action = "unknown";

        for (const [name, patterns] of Object.entries(ACTION_PATTERNS)) {
          if (patterns.some(p => logs.includes(p))) {
            action = name;
            break;
          }
        }

        // Filter by action if specified
        if (options.action && action !== options.action) continue;

        const timestamp = sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : "unknown";

        entries.push({
          timestamp,
          action,
          signature: sig.signature,
          status: sig.err ? "failed" : "success",
        });
      }

      if (options.format === "json") {
        console.log(JSON.stringify(entries, null, 2));
      } else {
        log.section("Audit Log");
        console.log(`  Mint: ${mint.toBase58()}`);
        console.log(`  Entries: ${entries.length}`);
        console.log();

        if (entries.length === 0) {
          console.log("  No matching entries found.");
        } else {
          console.log(
            "  " +
            "Timestamp".padEnd(25) +
            "Action".padEnd(12) +
            "Status".padEnd(10) +
            "Signature"
          );
          console.log("  " + "─".repeat(90));

          for (const e of entries) {
            const ts = e.timestamp.replace("T", " ").slice(0, 19);
            console.log(
              "  " +
              ts.padEnd(25) +
              e.action.padEnd(12) +
              e.status.padEnd(10) +
              e.signature.slice(0, 44) + "..."
            );
          }
        }
        console.log();
      }
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Validate Command ────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate a stablecoin configuration before deployment")
  .option("--preset <preset>", "Preset to validate (sss-1, sss-2, sss-3)")
  .option("--custom <config>", "Custom TOML/JSON config file to validate")
  .option("--name <name>", "Token name")
  .option("--symbol <symbol>", "Token symbol")
  .option("--decimals <decimals>", "Token decimals", "6")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--supply-cap <amount>", "Supply cap in base units")
  .action(async (options) => {
    try {
      log.section("Configuration Validation");

      const issues: string[] = [];
      const warnings: string[] = [];
      const info: string[] = [];

      // Resolve preset
      let preset = options.preset?.toUpperCase().replace("-", "_") || "custom";
      let name = options.name || "";
      let symbol = options.symbol || "";
      let decimals = parseInt(options.decimals) || 6;
      let uri = options.uri || "";
      let supplyCap = options.supplyCap
        ? BigInt(options.supplyCap)
        : undefined;

      // If custom config file provided, try parsing it
      if (options.custom) {
        const fs = await import("fs");
        const content = fs.readFileSync(options.custom, "utf-8");
        let config: Record<string, any>;
        if (options.custom.endsWith(".json")) {
          config = JSON.parse(content);
        } else {
          // Basic TOML parsing for simple flat configs
          config = {};
          for (const line of content.split("\n")) {
            const match = line.match(/^(\w+)\s*=\s*"?([^"]*)"?\s*$/);
            if (match) config[match[1]] = match[2];
          }
        }
        name = config.name || name;
        symbol = config.symbol || symbol;
        decimals = parseInt(config.decimals) || decimals;
        uri = config.uri || uri;
        preset = config.preset?.toUpperCase().replace("-", "_") || preset;
        if (config.supply_cap) supplyCap = BigInt(config.supply_cap);
      }

      // ── Validation Rules ──────────────────────────────────────────

      // Name
      if (!name) {
        issues.push("Name is required");
      } else if (name.length > 32) {
        issues.push(`Name "${name}" exceeds 32 character limit (${name.length})`);
      } else {
        info.push(`Name: "${name}" (${name.length}/32 chars)`);
      }

      // Symbol
      if (!symbol) {
        issues.push("Symbol is required");
      } else if (symbol.length > 10) {
        issues.push(`Symbol "${symbol}" exceeds 10 character limit (${symbol.length})`);
      } else {
        info.push(`Symbol: "${symbol}" (${symbol.length}/10 chars)`);
      }

      // Decimals
      if (decimals < 0 || decimals > 18) {
        issues.push(`Decimals must be 0-18 (got ${decimals})`);
      } else if (decimals !== 6) {
        warnings.push(`Non-standard decimals: ${decimals} (stablecoins typically use 6)`);
      }
      info.push(`Decimals: ${decimals}`);

      // URI
      if (uri && uri.length > 200) {
        issues.push(`URI exceeds 200 character limit (${uri.length})`);
      }

      // Supply Cap
      if (supplyCap !== undefined) {
        if (supplyCap <= 0n) {
          issues.push("Supply cap must be positive");
        } else {
          const humanCap = Number(supplyCap) / Math.pow(10, decimals);
          info.push(`Supply Cap: ${humanCap.toLocaleString()} tokens (${supplyCap.toString()} base units)`);
        }
      } else {
        warnings.push("No supply cap set — minters can mint unlimited tokens");
      }

      // Preset-specific validation
      if (preset === "SSS_1") {
        info.push("Preset: SSS-1 (Minimal)");
        info.push("Extensions: None (mint + freeze + metadata only)");
      } else if (preset === "SSS_2") {
        info.push("Preset: SSS-2 (Compliant)");
        info.push("Extensions: PermanentDelegate + TransferHook + Blacklist");
        warnings.push("SSS-2 requires a separate transfer-hook program deployment");
        if (!supplyCap) {
          warnings.push("Compliance tokens should have a supply cap for regulatory safety");
        }
      } else if (preset === "SSS_3") {
        info.push("Preset: SSS-3 (Private)");
        info.push("Extensions: ConfidentialTransferMint (experimental)");
        warnings.push("SSS-3 requires Token-2022 with zk-ops — not available on mainnet yet");
      }

      // Estimated deployment cost
      const estimatedRent = preset === "SSS_2" ? "~0.015 SOL" : "~0.008 SOL";
      info.push(`Estimated rent: ${estimatedRent} (config + roles + mint)`);

      // ── Output ─────────────────────────────────────────────────────

      if (info.length > 0) {
        console.log("  ℹ️  Configuration:");
        for (const i of info) console.log(`     ${i}`);
        console.log();
      }

      if (warnings.length > 0) {
        console.log("  ⚠️  Warnings:");
        for (const w of warnings) console.log(`     ${w}`);
        console.log();
      }

      if (issues.length > 0) {
        console.log("  ❌ Errors:");
        for (const i of issues) console.log(`     ${i}`);
        console.log();
        log.error(`Validation failed with ${issues.length} error(s)`);
        process.exit(1);
      } else {
        log.success("Configuration is valid — ready to deploy");
      }
    } catch (err: unknown) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

// ── Parse ───────────────────────────────────────────────────────────────

program.parse();
