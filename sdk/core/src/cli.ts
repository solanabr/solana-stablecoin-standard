#!/usr/bin/env node
import { Command } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
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

// --- Commands ---

// init
addConnectionOpts(
  program
    .command("init")
    .description("Initialize a new stablecoin")
    .requiredOption("--name <name>", "Token name")
    .requiredOption("--symbol <symbol>", "Token symbol")
    .option("--preset <preset>", "Preset: sss-1 or sss-2", "sss-1")
    .option("--uri <uri>", "Metadata URI", "")
    .option("--decimals <n>", "Decimal places", "6")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      console.log(`Initializing ${opts.preset.toUpperCase()} stablecoin: ${opts.name} (${opts.symbol})`);
      console.log(`Authority: ${keypair.publicKey.toBase58()}`);

      const stable = await SolanaStablecoin.create(connection, {
        preset: opts.preset === "sss-2" ? Presets.SSS_2 : Presets.SSS_1,
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: parseInt(opts.decimals),
        authority: keypair,
      });

      console.log(`\n✓ Stablecoin created!`);
      console.log(`  Mint: ${stable.mint.toBase58()}`);
      console.log(`  Config PDA: ${stable.config.toBase58()}`);
      console.log(`  Preset: ${opts.preset.toUpperCase()}`);
    })
).parseOptions;

// mint
addConnectionOpts(
  program
    .command("mint")
    .description("Mint tokens to a recipient")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--recipient <pubkey>", "Recipient wallet address")
    .requiredOption("--amount <n>", "Amount in base units")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.mint({
        recipient: new PublicKey(opts.recipient),
        amount: BigInt(opts.amount),
      });
      console.log(`✓ Minted ${opts.amount} tokens to ${opts.recipient}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// burn
addConnectionOpts(
  program
    .command("burn")
    .description("Burn tokens from a token account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--from <pubkey>", "Source token account")
    .requiredOption("--amount <n>", "Amount in base units")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.burn(new PublicKey(opts.from), BigInt(opts.amount));
      console.log(`✓ Burned ${opts.amount} tokens`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// freeze / thaw
addConnectionOpts(
  program
    .command("freeze")
    .description("Freeze a token account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--account <pubkey>", "Token account to freeze")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.freezeAccount(new PublicKey(opts.account));
      console.log(`✓ Frozen: ${opts.account}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

addConnectionOpts(
  program
    .command("thaw")
    .description("Thaw a frozen token account")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--account <pubkey>", "Token account to thaw")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.thawAccount(new PublicKey(opts.account));
      console.log(`✓ Thawed: ${opts.account}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// pause / unpause
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

// status
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
      console.log(`Mint:        ${stable.mint.toBase58()}`);
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

// supply
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

// minters subcommand
const mintersCmd = program.command("minters").description("Manage minters");

addConnectionOpts(
  mintersCmd
    .command("add")
    .description("Add a minter")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--minter <pubkey>", "Minter wallet address")
    .option("--quota <n>", "Mint quota in base units (0 = unlimited)", "0")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.addMinter(new PublicKey(opts.minter), BigInt(opts.quota));
      console.log(`✓ Minter added: ${opts.minter} (quota: ${opts.quota === "0" ? "unlimited" : opts.quota})`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

addConnectionOpts(
  mintersCmd
    .command("remove")
    .description("Remove a minter")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--minter <pubkey>", "Minter wallet address")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.removeMinter(new PublicKey(opts.minter));
      console.log(`✓ Minter removed: ${opts.minter}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

// blacklist subcommand (SSS-2)
const blacklistCmd = program.command("blacklist").description("Manage blacklist (SSS-2 only)");

addConnectionOpts(
  blacklistCmd
    .command("add")
    .description("Add address to blacklist")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--address <pubkey>", "Address to blacklist")
    .requiredOption("--reason <reason>", "Reason for blacklisting")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.compliance.blacklistAdd(new PublicKey(opts.address), opts.reason);
      console.log(`✓ Blacklisted: ${opts.address}`);
      console.log(`  Reason: ${opts.reason}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

addConnectionOpts(
  blacklistCmd
    .command("remove")
    .description("Remove address from blacklist")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--address <pubkey>", "Address to unblacklist")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.compliance.blacklistRemove(new PublicKey(opts.address));
      console.log(`✓ Removed from blacklist: ${opts.address}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

addConnectionOpts(
  blacklistCmd
    .command("check")
    .description("Check if address is blacklisted")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--address <pubkey>", "Address to check")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const blacklisted = await stable.compliance.isBlacklisted(new PublicKey(opts.address));
      const entry = blacklisted ? await stable.compliance.getBlacklistEntry(new PublicKey(opts.address)) : null;
      console.log(`Address: ${opts.address}`);
      console.log(`Blacklisted: ${blacklisted}`);
      if (entry) {
        console.log(`Reason: ${entry.reason}`);
        console.log(`By: ${entry.blacklistedBy.toBase58()}`);
      }
    })
).parseOptions;

// seize command (SSS-2)
addConnectionOpts(
  program
    .command("seize")
    .description("Seize tokens via permanent delegate (SSS-2 only)")
    .requiredOption("--mint <pubkey>", "Mint address")
    .requiredOption("--from <pubkey>", "Source token account")
    .requiredOption("--to <pubkey>", "Destination token account")
    .requiredOption("--amount <n>", "Amount to seize in base units")
    .action(async (opts) => {
      const keypair = loadKeypair(opts.keypair);
      const connection = getConnection(opts.url);
      const stable = await SolanaStablecoin.load(connection, keypair, new PublicKey(opts.mint));
      const sig = await stable.compliance.seize({
        from: new PublicKey(opts.from),
        to: new PublicKey(opts.to),
        amount: BigInt(opts.amount),
      });
      console.log(`✓ Seized ${opts.amount} tokens from ${opts.from}`);
      console.log(`  To: ${opts.to}`);
      console.log(`  Tx: ${sig}`);
    })
).parseOptions;

program.parse(process.argv);
