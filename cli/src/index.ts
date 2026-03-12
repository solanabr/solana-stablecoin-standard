#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { table } from "table";
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as toml from "toml";

import { SolanaStablecoin, Preset } from "@stbr/sss-token";
import { loadConfig, requireMint, saveMintToConfig, setDefaultMint } from "./config";

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
  .option("--alias <alias>", "Alias for this token (for easy reference)")
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
          `  Alias:   ${chalk.cyan(opts.alias || `token${config.mints.size + 1}`)}\n` +
          `  Mint:    ${chalk.cyan(stable.mint.toBase58())}\n` +
          `  State:   ${chalk.cyan(stable.statePDA.toBase58())}\n` +
          `  Cluster: ${chalk.yellow(config.cluster)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(`Failed: ${e.message}`));
      process.exit(1);
    }
  });

// ─── init-hook ─────────────────────────────────────────────────────────────────

program
  .command("init-hook")
  .description(
    "Initialize the transfer-hook extra-account-metas PDA for an existing SSS-2 mint. " +
    "Run this once per mint if transfers are failing with AccountNotFound."
  )
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Initializing transfer-hook accounts for ${mint.toBase58().slice(0, 8)}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.initializeTransferHook();
      spinner.succeed(
        chalk.green(`✓ Transfer-hook initialized\n`) +
          `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
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
      const sig = await stable.mintTokens({
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
  .description("Burn tokens from an account")
  .option("-f, --from <address>", "Source wallet address (defaults to your keypair)")
  .action(async (amount, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    // Determine source address
    let sourceAddress: PublicKey;
    if (opts.from) {
      try {
        sourceAddress = new PublicKey(opts.from);
      } catch {
        console.error(chalk.red(`Invalid source address: ${opts.from}`));
        process.exit(1);
      }
    } else {
      sourceAddress = config.keypair.publicKey;
    }

    const spinner = ora(`Burning ${amount} tokens from ${sourceAddress.toBase58().slice(0, 8)}...`).start();
    
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      
      const sig = await stable.burn(sourceAddress, BigInt(amount));
      
      spinner.succeed(
        chalk.green(`✓ Burned ${amount} tokens from ${chalk.cyan(sourceAddress.toBase58())}\n`) +
        `  Tx: ${chalk.cyan(sig)}`
      );
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── transfer ──────────────────────────────────────────────────────────────────

program
  .command("transfer <recipient> <amount>")
  .description(
    "Transfer tokens to a recipient. Handles SSS-2 transfer-hook resolution " +
    "correctly (creates ATA first, then transfers). Use this instead of " +
    "'spl-token transfer --fund-recipient' for SSS-2 mints."
  )
  .action(async (recipient, amount, opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora(`Transferring ${amount} tokens to ${recipient}...`).start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const sig = await stable.transfer({
        from: config.keypair,
        to: new PublicKey(recipient),
        amount: BigInt(amount),
      });
      spinner.succeed(
        chalk.green(`✓ Transferred ${amount} tokens\n`) +
          `  To:  ${chalk.cyan(recipient)}\n` +
          `  Tx:  ${chalk.cyan(sig)}`
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



// ─── list ────────────────────────────────────────────────────────────────────

program
  .command("list")
  .description("List all configured stablecoins")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
    });

    if (config.mints.size === 0) {
      console.log(chalk.yellow("No stablecoins configured. Create one with 'sss-token init'"));
      return;
    }

    const rows = [["Alias", "Mint Address", "Default"]];
    for (const [alias, address] of config.mints.entries()) {
      const isDefault = config.currentMint?.toBase58() === address;
      rows.push([
        alias,
        address,
        isDefault ? chalk.green("✓") : "",
      ]);
    }
    console.log(table(rows));
  });

// ─── use ─────────────────────────────────────────────────────────────────────

program
  .command("use <alias-or-address>")
  .description("Set default stablecoin by alias or address")
  .action(async (aliasOrAddress, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
    });

    setDefaultMint(aliasOrAddress);
  });

// ─── status (modified) ───────────────────────────────────────────────────────

program
  .command("status [mint]")
  .description("Show stablecoin status (optionally specify mint address or alias)")
  .action(async (mintArg, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: mintArg ? undefined : globalOpts.mint, // Don't use global mint if arg provided
    });
    
    const mint = requireMint(config, mintArg);

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

      // Find alias for this mint
      let alias = "";
      for (const [a, addr] of config.mints.entries()) {
        if (addr === mint.toBase58()) {
          alias = a;
          break;
        }
      }

      const rows = [
        ["Alias", alias || "(unnamed)"],
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
  .command("supply [mint]")
  .description("Show current token supply (optionally specify mint address or alias)")
  .action(async (mintArg, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: mintArg ? undefined : globalOpts.mint, // Don't use global mint if arg provided
    });
    
    const mint = requireMint(config, mintArg);

    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const supply = await stable.getTotalSupply();
      
      // Find alias for this mint (if any)
      let alias = "";
      for (const [a, addr] of config.mints.entries()) {
        if (addr === mint.toBase58()) {
          alias = a;
          break;
        }
      }

      if (alias) {
        console.log(`Supply (${chalk.cyan(alias)}): ${chalk.cyan(supply.toLocaleString())} tokens`);
        console.log(`Mint: ${chalk.dim(mint.toBase58())}`);
      } else {
        console.log(`Supply: ${chalk.cyan(supply.toLocaleString())} tokens`);
        console.log(`Mint: ${chalk.dim(mint.toBase58())}`);
      }
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

mintersCmd
  .command("list")
  .description("List all minters for this stablecoin")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora("Fetching minters...").start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const minters = await stable.listMinters();
      spinner.stop();

      if (minters.length === 0) {
        console.log(chalk.yellow("No minters found."));
        return;
      }

      const rows: string[][] = [["Address", "Quota", "Minted (epoch)", "Active"]];
      for (const m of minters) {
        rows.push([
          m.address.toBase58(),
          m.quota === 0n ? "unlimited" : m.quota.toLocaleString(),
          m.mintedThisEpoch.toLocaleString(),
          m.active ? chalk.green("YES") : chalk.red("NO"),
        ]);
      }
      console.log(table(rows));
    } catch (e: any) {
      spinner.fail(chalk.red(e.message));
      process.exit(1);
    }
  });

// ─── holders ───────────────────────────────────────────────────────────────────

program
  .command("holders")
  .option("--limit <n>", "Max holders to display", "20")
  .description("List token holders for this stablecoin")
  .action(async (opts, cmd) => {
    const globalOpts = cmd.parent?.opts() ?? {};
    const config = loadConfig({
      keypair: globalOpts.keypair,
      url: globalOpts.url,
      mint: globalOpts.mint,
    });
    const mint = requireMint(config);

    const spinner = ora("Fetching holders...").start();
    try {
      const stable = await SolanaStablecoin.load(
        config.connection,
        mint,
        config.keypair
      );
      const holders = await stable.getHolders();
      spinner.stop();

      if (holders.length === 0) {
        console.log(chalk.yellow("No holders found."));
        return;
      }

      const limit = parseInt(opts.limit);
      const display = holders.slice(0, limit);
      const rows: string[][] = [["#", "Owner", "Balance"]];
      display.forEach((h, i) => {
        rows.push([
          (i + 1).toString(),
          h.owner.toBase58(),
          h.balance.toLocaleString(),
        ]);
      });
      console.log(table(rows));
      if (holders.length > limit) {
        console.log(chalk.dim(`  ... and ${holders.length - limit} more holders`));
      }
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
  .option("--action <type>", "Filter by action type (e.g. Mint, Burn, Pause, Freeze, BlacklistAdd, Seize)")
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

    const actionFilter = opts.action?.toLowerCase();
    const limit = parseInt(opts.limit);
    const fetchLimit = actionFilter ? limit * 5 : limit; // fetch more when filtering

    console.log(
      chalk.yellow(
        `Fetching audit log for mint ${mint.toBase58()}...\n` +
          (actionFilter ? `  Filtering by action: ${opts.action}\n` : "") +
          `(Shows recent on-chain events via getSignaturesForAddress)\n`
      )
    );

    const signatures = await config.connection.getSignaturesForAddress(
      mint,
      { limit: fetchLimit }
    );

    // If action filter is set, fetch full transactions and parse logs
    const rows: string[][] = [["Signature", "Slot", "Time", "Status", "Action"]];
    let count = 0;

    for (const sig of signatures) {
      if (count >= limit) break;

      let action = "-";
      if (actionFilter) {
        try {
          const tx = await config.connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          const logs = tx?.meta?.logMessages ?? [];
          // Anchor events are logged as "Program data: ..." or contain instruction names
          const logText = logs.join(" ").toLowerCase();
          // Check for event/instruction keywords
          const eventPatterns: Record<string, string[]> = {
            mint: ["tokensminted", "mint_token", "mint"],
            burn: ["tokensburned", "burn"],
            pause: ["stablecoinpaused", "pause"],
            unpause: ["stablecoinunpaused", "unpause"],
            freeze: ["accountfrozen", "freeze_account"],
            thaw: ["accountthawed", "thaw_account"],
            blacklistadd: ["addressblacklisted", "add_to_blacklist"],
            blacklistremove: ["addressunblacklisted", "remove_from_blacklist"],
            seize: ["tokensseized", "seize"],
            addminter: ["minteradded", "add_minter"],
            removeminter: ["minterremoved", "remove_minter"],
            updateroles: ["rolesupdated", "update_roles"],
          };

          const patterns = eventPatterns[actionFilter] ?? [actionFilter];
          const matches = patterns.some((p) => logText.includes(p));
          if (!matches) continue;

          // Determine action from all patterns
          for (const [name, pats] of Object.entries(eventPatterns)) {
            if (pats.some((p) => logText.includes(p))) {
              action = name.charAt(0).toUpperCase() + name.slice(1);
              break;
            }
          }
        } catch {
          continue; // skip transactions we can't parse
        }
      } else {
        // No filter - try to detect action from a quick log scan
        try {
          const tx = await config.connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          const logs = tx?.meta?.logMessages ?? [];
          const logText = logs.join(" ").toLowerCase();
          const quickPatterns: [string, string][] = [
            ["mint", "Mint"], ["burn", "Burn"], ["pause", "Pause"],
            ["unpause", "Unpause"], ["freeze", "Freeze"], ["thaw", "Thaw"],
            ["blacklist", "Blacklist"], ["seize", "Seize"],
            ["minter", "Minter"], ["role", "Roles"],
          ];
          for (const [pat, label] of quickPatterns) {
            if (logText.includes(pat)) { action = label; break; }
          }
        } catch {
          // ignore parse errors for display
        }
      }

      rows.push([
        sig.signature.slice(0, 20) + "...",
        sig.slot.toString(),
        sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : "unknown",
        sig.err ? chalk.red("FAILED") : chalk.green("OK"),
        action,
      ]);
      count++;
    }

    if (rows.length <= 1) {
      console.log(chalk.yellow("No matching transactions found."));
    } else {
      console.log(table(rows));
    }
  });

program.parse();