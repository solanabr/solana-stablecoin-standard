#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { table } from "table";
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as toml from "toml";

import { SolanaStablecoin, Preset } from "@stbr/sss-token";
import { loadConfig, requireMint, saveMintToConfig } from "./config";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard — operator CLI")
  .version("0.1.0")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-u, --url <url>", "RPC URL (overrides config)")
  .option("-m, --mint <address>", "Stablecoin mint address");

// ─── init ──────────────────────────────────────────────────────────────────────

const initCmd = program.command("init").description("Initialize a new stablecoin");

initCmd
  .option("--preset <preset>", "Preset: sss-1 | sss-2", "sss-1")
  .option("--custom <path>", "Path to TOML/JSON config file (overrides preset)")
  .option("--name <name>", "Token name", "My Stablecoin")
  .option("--symbol <symbol>", "Token symbol", "MYUSD")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--decimals <decimals>", "Decimal places", "6")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
    });

    let createOpts: Parameters<typeof SolanaStablecoin.create>[0];

    if (opts.custom) {
      // Load from file
      const raw = fs.readFileSync(opts.custom, "utf-8");
      const fileConf = opts.custom.endsWith(".toml")
        ? toml.parse(raw)
        : JSON.parse(raw);

      createOpts = {
        connection: config.connection,
        authority: config.keypair,
        name: fileConf.name,
        symbol: fileConf.symbol,
        uri: fileConf.uri ?? "",
        decimals: fileConf.decimals ?? 6,
        extensions: {
          permanentDelegate: fileConf.permanent_delegate ?? false,
          transferHook: fileConf.transfer_hook ?? false,
          defaultAccountFrozen: fileConf.default_account_frozen ?? false,
        },
      };
    } else {
      const preset =
        opts.preset === "sss-2" ? Preset.SSS_2 : Preset.SSS_1;
      createOpts = {
        connection: config.connection,
        authority: config.keypair,
        preset,
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: parseInt(opts.decimals),
      };
    }

    const spinner = ora(
      `Initializing ${createOpts.name} (${opts.preset ?? "custom"})...`
    ).start();

    try {
      const stable = await SolanaStablecoin.create(createOpts);
      saveMintToConfig(stable.mint);
      spinner.succeed(
        chalk.green(`✓ Stablecoin initialized!\n`) +
          `  Mint:    ${chalk.cyan(stable.mint.toBase58())}\n` +
          `  State:   ${chalk.cyan(stable.statePDA.toBase58())}\n` +
          `  Cluster: ${chalk.yellow(config.cluster)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(`Failed: ${e.message}`));
      process.exit(1);
    }
  });

// ─── mint ──────────────────────────────────────────────────────────────────────

program
  .command("mint <recipient> <amount>")
  .description("Mint tokens to a recipient")
  .action(async (recipient, amount, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Minting ${amount} tokens to ${recipient}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.mint({
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
        minter: config.keypair,
      });
      spinner.succeed(
        chalk.green(`✓ Minted ${amount} tokens\n`) +
          `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── burn ──────────────────────────────────────────────────────────────────────

program
  .command("burn <amount>")
  .description("Burn tokens from your account")
  .action(async (amount, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Burning ${amount} tokens...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.burn(config.keypair.publicKey, BigInt(amount));
      spinner.succeed(
        chalk.green(`✓ Burned ${amount} tokens\n`) +
          `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── freeze ────────────────────────────────────────────────────────────────────

program
  .command("freeze <address>")
  .description("Freeze a token account")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Freezing ${address}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.freeze(new PublicKey(address));
      spinner.succeed(
        chalk.green(`✓ Account frozen\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── thaw ──────────────────────────────────────────────────────────────────────

program
  .command("thaw <address>")
  .description("Thaw a frozen token account")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Thawing ${address}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.thaw(new PublicKey(address));
      spinner.succeed(
        chalk.green(`✓ Account thawed\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── pause / unpause ───────────────────────────────────────────────────────────

program
  .command("pause")
  .description("Pause the protocol (halts minting and burning)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora("Pausing protocol...").start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.pause();
      spinner.succeed(
        chalk.yellow(`⏸ Protocol paused\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

program
  .command("unpause")
  .description("Unpause the protocol")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora("Unpausing protocol...").start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.unpause();
      spinner.succeed(
        chalk.green(`▶ Protocol unpaused\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── status ────────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show stablecoin status")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora("Fetching status...").start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const state = await stable.getState();
      const supply = await stable.getTotalSupply();
      spinner.stop();

      const rows = [
        ["Name", state.name],
        ["Symbol", state.symbol],
        ["Mint", mint.toBase58()],
        ["Decimals", state.decimals.toString()],
        ["Total Supply", supply.toLocaleString()],
        ["Paused", state.paused ? chalk.red("YES") : chalk.green("NO")],
        ["Compliance (SSS-2)", state.complianceEnabled ? chalk.cyan("Enabled") : "Disabled"],
        ["Transfer Hook", state.transferHookEnabled ? chalk.cyan("Enabled") : "Disabled"],
        ["Master Authority", state.masterAuthority.toBase58()],
      ];

      console.log(table(rows));
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── supply ────────────────────────────────────────────────────────────────────

program
  .command("supply")
  .description("Show current token supply")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const supply = await stable.getTotalSupply();
      console.log(`Supply: ${chalk.cyan(supply.toLocaleString())} tokens`);
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── minters ───────────────────────────────────────────────────────────────────

const mintersCmd = program
  .command("minters")
  .description("Manage minters");

mintersCmd
  .command("add <address>")
  .option("--quota <quota>", "Quota limit (0 = unlimited)", "0")
  .description("Add or update a minter")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Adding minter ${address}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.addMinter(
        new PublicKey(address),
        BigInt(opts.quota)
      );
      spinner.succeed(
        chalk.green(`✓ Minter added\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

mintersCmd
  .command("remove <address>")
  .description("Deactivate a minter")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Removing minter ${address}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.removeMinter(new PublicKey(address));
      spinner.succeed(
        chalk.green(`✓ Minter deactivated\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── blacklist (SSS-2) ─────────────────────────────────────────────────────────

const blacklistCmd = program
  .command("blacklist")
  .description("Blacklist management (SSS-2 only)");

blacklistCmd
  .command("add <address>")
  .option("--reason <reason>", "Reason for blacklisting", "Compliance action")
  .description("Add an address to the blacklist")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Blacklisting ${address}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.compliance.blacklistAdd(
        new PublicKey(address),
        opts.reason
      );
      spinner.succeed(
        chalk.green(`✓ Address blacklisted\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

blacklistCmd
  .command("remove <address>")
  .option("--reason <reason>", "Reason for removal", "Compliance cleared")
  .description("Remove an address from the blacklist")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Removing ${address} from blacklist...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.compliance.blacklistRemove(
        new PublicKey(address),
        opts.reason
      );
      spinner.succeed(
        chalk.green(`✓ Address removed from blacklist\n`) +
          `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

blacklistCmd
  .command("check <address>")
  .description("Check if an address is blacklisted")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const blacklisted = await stable.compliance.isBlacklisted(
        new PublicKey(address)
      );
      if (blacklisted) {
        console.log(chalk.red(`🚫 ${address} IS blacklisted`));
      } else {
        console.log(chalk.green(`✓ ${address} is NOT blacklisted`));
      }
    } catch (e: any) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── seize (SSS-2) ─────────────────────────────────────────────────────────────

program
  .command("seize <address>")
  .option("--to <treasury>", "Treasury address to receive seized tokens")
  .description("Seize tokens from a blacklisted address (SSS-2)")
  .action(async (address, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    if (!opts.to) {
      console.error(chalk.red("--to <treasury> is required"));
      process.exit(1);
    }

    const spinner = ora(`Seizing tokens from ${address}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.compliance.seize(
        new PublicKey(address),
        new PublicKey(opts.to)
      );
      spinner.succeed(
        chalk.green(`✓ Tokens seized\n`) + `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── audit-log ─────────────────────────────────────────────────────────────────

program
  .command("audit-log")
  .option("--action <type>", "Filter by action type")
  .option("--limit <n>", "Max entries to show", "20")
  .description("Show on-chain audit log (from event history)")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    console.log(
      chalk.yellow(
        `Fetching audit log for mint ${mint.toBase58()}...\n` +
          `(Shows recent on-chain events via getSignaturesForAddress)\n`
      )
    );

    const signatures = await config.connection.getSignaturesForAddress(
      mint,
      { limit: parseInt(opts.limit) }
    );

    const rows = [["Signature", "Slot", "Time", "Status"]];
    for (const sig of signatures) {
      rows.push([
        sig.signature.slice(0, 20) + "...",
        sig.slot.toString(),
        sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : "unknown",
        sig.err ? chalk.red("FAILED") : chalk.green("OK"),
      ]);
    }

    console.log(table(rows));
  });

program.parse();