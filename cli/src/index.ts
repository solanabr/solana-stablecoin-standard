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

// ── Parse ───────────────────────────────────────────────────────────────

program.parse();
