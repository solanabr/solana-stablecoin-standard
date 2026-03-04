#!/usr/bin/env node
import { Command } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, Presets, RoleTypes } from "./index";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard CLI")
  .version("0.1.0");

// --- Shared options helper ---
function addConnectionOpts(cmd: Command): Command {
  return cmd
    .option("-u, --url <url>", "RPC endpoint URL", "https://api.devnet.solana.com")
    .option("-k, --keypair <path>", "Path to keypair JSON", `${homedir()}/.config/solana/id.json`);
}

function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.replace("~", homedir());
  const secretKey = JSON.parse(readFileSync(resolved, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function getConnection(url: string): Connection {
  return new Connection(url, "confirmed");
}

// --- init ---
// Supports:
//   sss-token init --preset sss-1 --name "USD Coin" --symbol USDC
//   sss-token init --preset sss-2 --name "Compliant USD" --symbol cUSD
//   sss-token init --custom config.toml --name "Custom" --symbol CUS
addConnectionOpts(
  program
    .command("init")
    .description("Initialize a new stablecoin (use --preset or --custom)")
    .option("--name <name>", "Token name")
    .option("--symbol <symbol>", "Token symbol")
    .option("--preset <preset>", "Preset: sss-1 or sss-2")
    .option("--custom <path>", "Path to custom TOML config file")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <n>", "Decimal places", "6")
    .action(async (opts) => {
      if (!opts.preset && !opts.custom) {
        console.error("Error: must specify --preset <sss-1|sss-2> or --custom <config.toml>");
        process.exit(1);
      }
      if (!opts.name || !opts.symbol) {
        console.error("Error: --name and --symbol are required");
        process.exit(1);
      }

      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);

      // Parse custom TOML config if provided
      let customExtensions: { permanentDelegate?: boolean; transferHook?: boolean } | undefined;
      if (opts.custom) {
        if (!existsSync(opts.custom)) {
          console.error(`Error: custom config file not found: ${opts.custom}`);
          process.exit(1);
        }
        // Simple TOML key=value parser for extension flags
        const tomlText = readFileSync(opts.custom, "utf-8");
        customExtensions = {};
        const pdMatch = tomlText.match(/permanent_delegate\s*=\s*(true|false)/i);
        const thMatch = tomlText.match(/transfer_hook\s*=\s*(true|false)/i);
        const dafMatch = tomlText.match(/default_account_frozen\s*=\s*(true|false)/i);
        if (pdMatch) customExtensions.permanentDelegate = pdMatch[1].toLowerCase() === "true";
        if (thMatch) customExtensions.transferHook = thMatch[1].toLowerCase() === "true";
        console.log(`Loading custom config from: ${opts.custom}`);
      }

      const presetVal = opts.preset
        ? opts.preset === "sss-2" ? Presets.SSS_2 : Presets.SSS_1
        : undefined;

      console.log(`Initializing ${opts.preset ? opts.preset.toUpperCase() : "custom"} stablecoin: ${opts.name} (${opts.symbol})`);
      console.log(`Authority: ${keypair.publicKey.toBase58()}`);

      const stable = await SolanaStablecoin.create(connection, {
        preset: presetVal,
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: parseInt(opts.decimals),
        authority: keypair,
        ...(customExtensions ? { extensions: customExtensions } : {}),
      });

      console.log(`\n✓ Stablecoin created!`);
      console.log(`  Mint: ${stable.mintAddress.toBase58()}`);
      console.log(`  Config PDA: ${stable.config.toBase58()}`);
      if (opts.preset) console.log(`  Preset: ${opts.preset.toUpperCase()}`);
      if (opts.custom) console.log(`  Config: ${opts.custom}`);
    })
).parseOptions;

// --- mint <recipient> <amount> ---
addConnectionOpts(
  program
    .command("mint")
    .description("Mint tokens to a recipient")
    .argument("<recipient>", "Recipient wallet address")
    .argument("<amount>", "Amount in base units")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (recipient: string, amount: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.mint({
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
      });
      console.log(`✓ Minted ${amount} tokens to ${recipient}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// --- burn <amount> ---
addConnectionOpts(
  program
    .command("burn")
    .description("Burn tokens from a token account")
    .argument("<amount>", "Amount in base units")
    .requiredOption("--mint <pubkey>", "Mint address")
    .option("--from <pubkey>", "Source token account (defaults to authority ATA)")
    .action(async (amount: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const fromPubkey = opts.from
        ? new PublicKey(opts.from)
        : stable.getTokenAccount(keypair.publicKey);
      const sig = await stable.burn(fromPubkey, BigInt(amount));
      console.log(`✓ Burned ${amount} tokens`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// --- freeze <address> ---
addConnectionOpts(
  program
    .command("freeze")
    .description("Freeze a token account")
    .argument("<address>", "Token account to freeze")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (address: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.freezeAccount(new PublicKey(address));
      console.log(`✓ Frozen: ${address}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// --- thaw <address> ---
addConnectionOpts(
  program
    .command("thaw")
    .description("Thaw a frozen token account")
    .argument("<address>", "Token account to thaw")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (address: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.thawAccount(new PublicKey(address));
      console.log(`✓ Thawed: ${address}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// --- pause ---
addConnectionOpts(
  program
    .command("pause")
    .description("Pause all token operations")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.pause();
      console.log(`✓ Paused. Tx: ${sig}`);
    })
).parseOptions;

// --- unpause ---
addConnectionOpts(
  program
    .command("unpause")
    .description("Unpause token operations")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.unpause();
      console.log(`✓ Unpaused. Tx: ${sig}`);
    })
).parseOptions;

// --- status ---
addConnectionOpts(
  program
    .command("status")
    .description("Show stablecoin status and configuration")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const state = await stable.refresh();
      const supply = await stable.getTotalSupply();

      console.log(`\n=== Stablecoin Status ===`);
      console.log(`Mint:        ${stable.mintAddress.toBase58()}`);
      console.log(`Config:      ${stable.config.toBase58()}`);
      console.log(`Authority:   ${state.authority.toBase58()}`);
      console.log(`Paused:      ${state.paused}`);
      console.log(`Supply:      ${supply}`);
      console.log(`Preset:      ${state.enableTransferHook ? "SSS-2 (Compliant)" : "SSS-1 (Minimal)"}`);
      if (state.enablePermanentDelegate) {
        console.log(`Perm Delegate: enabled`);
      }
      if (state.enableTransferHook) {
        console.log(`Transfer Hook: enabled (${state.hookProgramId?.toBase58()})`);
      }
      if (state.pendingAuthority) {
        console.log(`Pending Auth: ${state.pendingAuthority.toBase58()}`);
      }
    })
).parseOptions;

// --- supply ---
addConnectionOpts(
  program
    .command("supply")
    .description("Show current token supply")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const supply = await stable.getTotalSupply();
      console.log(`Supply: ${supply}`);
    })
).parseOptions;

// --- holders [--min-balance <amount>] ---
addConnectionOpts(
  program
    .command("holders")
    .description("List token holders")
    .requiredOption("--mint <pubkey>", "Mint address")
    .option("--min-balance <amount>", "Minimum balance filter (base units)", "0")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const minBalance = BigInt(opts.minBalance ?? "0");
      console.log(`Fetching holders for mint ${opts.mint}...`);
      const holders = await stable.listHolders(minBalance);
      if (holders.length === 0) {
        console.log("No holders found.");
        return;
      }
      console.log(`\nHolders (${holders.length} total):`);
      for (const h of holders) {
        console.log(`  ${h.address.toBase58()}  ${h.amount}`);
      }
    })
).parseOptions;

// --- audit-log [--action <type>] ---
// Note: audit log relies on on-chain program logs / events indexed by the compliance-service.
// This command fetches recent transaction signatures for the config PDA and filters by log.
addConnectionOpts(
  program
    .command("audit-log")
    .description("Show audit log of on-chain events for this stablecoin")
    .requiredOption("--mint <pubkey>", "Mint address")
    .option("--action <type>", "Filter by action type (e.g. mint, burn, freeze, blacklist, seize)")
    .option("--limit <n>", "Number of recent signatures to scan", "50")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));

      const sigs = await connection.getSignaturesForAddress(stable.config, {
        limit: parseInt(opts.limit),
      });

      console.log(`\n=== Audit Log (last ${sigs.length} txns) ===`);
      if (opts.action) {
        console.log(`Filtering by action: ${opts.action}`);
      }

      for (const sig of sigs) {
        const action = opts.action ? opts.action.toUpperCase() : "ALL";
        const status = sig.err ? "FAILED" : "OK";
        const time = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : "unknown";
        // Filter: if action flag set, only print if memo or log contains it
        const logStr = sig.memo ?? "";
        if (opts.action && !logStr.toLowerCase().includes(opts.action.toLowerCase())) {
          continue;
        }
        console.log(`  ${time}  [${status}]  ${sig.signature}`);
        if (sig.memo) console.log(`    memo: ${sig.memo}`);
      }
    })
).parseOptions;

// --- minters subcommand ---
const mintersCmd = program.command("minters").description("Manage minters");

// minters list
addConnectionOpts(
  mintersCmd
    .command("list")
    .description("List all registered minters")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const minters = await stable.listMinters();
      if (minters.length === 0) {
        console.log("No minters registered.");
        return;
      }
      console.log(`\nMinters (${minters.length} total):`);
      for (const m of minters) {
        const quota = m.quota.isZero() ? "unlimited" : m.quota.toString();
        console.log(`  ${m.minter.toBase58()}  quota=${quota}  minted=${m.minted}  active=${m.active}`);
      }
    })
).parseOptions;

// minters add
addConnectionOpts(
  mintersCmd
    .command("add")
    .description("Add a minter")
    .argument("<minter>", "Minter wallet address")
    .requiredOption("--mint <pubkey>", "Mint address")
    .option("--quota <n>", "Mint quota in base units (0 = unlimited)", "0")
    .action(async (minter: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.addMinter(new PublicKey(minter), BigInt(opts.quota));
      console.log(`✓ Minter added: ${minter} (quota: ${opts.quota === "0" ? "unlimited" : opts.quota})`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// minters remove
addConnectionOpts(
  mintersCmd
    .command("remove")
    .description("Remove a minter")
    .argument("<minter>", "Minter wallet address")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (minter: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.removeMinter(new PublicKey(minter));
      console.log(`✓ Minter removed: ${minter}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// --- blacklist subcommand (SSS-2) ---
const blacklistCmd = program.command("blacklist").description("Manage blacklist (SSS-2 only)");

// blacklist add <address> --reason "OFAC match"
addConnectionOpts(
  blacklistCmd
    .command("add")
    .description("Add address to blacklist")
    .argument("<address>", "Address to blacklist")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--reason <reason>", "Reason for blacklisting")
    .action(async (address: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.compliance.blacklistAdd(new PublicKey(address), opts.reason);
      console.log(`✓ Blacklisted: ${address}`);
      console.log(`  Reason: ${opts.reason}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// blacklist remove <address>
addConnectionOpts(
  blacklistCmd
    .command("remove")
    .description("Remove address from blacklist")
    .argument("<address>", "Address to unblacklist")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (address: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.compliance.blacklistRemove(new PublicKey(address));
      console.log(`✓ Removed from blacklist: ${address}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// blacklist check <address>
addConnectionOpts(
  blacklistCmd
    .command("check")
    .description("Check if address is blacklisted")
    .argument("<address>", "Address to check")
    .requiredOption("--mint <pubkey>", "Mint address")
    .action(async (address: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const blacklisted = await stable.compliance.isBlacklisted(new PublicKey(address));
      const entry = blacklisted
        ? await stable.compliance.getBlacklistEntry(new PublicKey(address))
        : null;
      console.log(`Address: ${address}`);
      console.log(`Blacklisted: ${blacklisted}`);
      if (entry) {
        console.log(`Reason: ${entry.reason}`);
        console.log(`By: ${entry.blacklistedBy.toBase58()}`);
      }
    })
).parseOptions;

// --- seize <address> --to <treasury> ---
addConnectionOpts(
  program
    .command("seize")
    .description("Seize tokens via permanent delegate (SSS-2 only)")
    .argument("<address>", "Source token account to seize from")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--to <pubkey>", "Destination treasury token account")
    .option("--amount <n>", "Amount to seize in base units (omit to seize all)")
    .action(async (address: string, opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));

      // Resolve amount: if not given, seize full balance
      let amount: bigint;
      if (opts.amount) {
        amount = BigInt(opts.amount);
      } else {
        amount = await stable.getBalance(new PublicKey(address));
        console.log(`Seizing full balance: ${amount}`);
      }

      const sig = await stable.compliance.seize({
        from: new PublicKey(address),
        to: new PublicKey(opts.to),
        amount,
      });
      console.log(`✓ Seized ${amount} tokens from ${address}`);
      console.log(`  To: ${opts.to}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

program.parse(process.argv);
