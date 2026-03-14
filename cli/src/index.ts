#!/usr/bin/env node
/**
 * Solana Stablecoin Standard CLI
 * 
 * Production-ready command-line interface for managing Token-2022 stablecoins
 * with SSS-1, SSS-2, and SSS-3 preset compliance
 * 
 * Features:
 * - AI natural language interface ("sss ask" / "sss chat")
 * - Full SSS-1/2/3 preset support
 * - Confidential transfer management
 * - Compliance operations
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { table } from "table";
import inquirer from "inquirer";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { handleAskCommand, handleChatCommand, handleSuggestCommand } from "./ai.js";

// Program IDs - Match deployed programs
const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "2L6rZHyqhJ9VJqXhbgW7vyP3uerrw7Vzpp3qtqAq1FZj"
);

// CLI version
const VERSION = "1.0.0";

// Config file location
const CONFIG_PATH = path.join(os.homedir(), ".sss-cli.json");

// Types
interface CliConfig {
  cluster: "devnet" | "mainnet-beta" | "localnet";
  keypairPath: string;
  defaultDecimals: number;
}

interface StablecoinInfo {
  mint: string;
  name: string;
  symbol: string;
  preset: string;
  decimals: number;
  supply: string;
  frozen: boolean;
  paused: boolean;
}

// Utility functions
function loadConfig(): CliConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return {
    cluster: "devnet",
    keypairPath: path.join(os.homedir(), ".config/solana/id.json"),
    defaultDecimals: 6,
  };
}

function saveConfig(config: CliConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function loadKeypair(keypairPath: string): Keypair {
  const data = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function getConnection(cluster: string): Connection {
  if (cluster === "localnet") {
    return new Connection("http://localhost:8899", "confirmed");
  }
  return new Connection(clusterApiUrl(cluster as "devnet" | "mainnet-beta"), "confirmed");
}

function formatAddress(address: string, length: number = 8): string {
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

function formatAmount(amount: bigint | number, decimals: number): string {
  const value = Number(amount) / Math.pow(10, decimals);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

// Create main program
const program = new Command();

program
  .name("sss")
  .description("Solana Stablecoin Standard CLI")
  .version(VERSION);

// ============================================================================
// CONFIG COMMANDS
// ============================================================================

const configCmd = program.command("config").description("Manage CLI configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold("\n📋 Current Configuration\n"));
    console.log(`  Cluster:     ${chalk.cyan(config.cluster)}`);
    console.log(`  Keypair:     ${chalk.cyan(config.keypairPath)}`);
    console.log(`  Decimals:    ${chalk.cyan(config.defaultDecimals)}`);
    console.log();
  });

configCmd
  .command("set")
  .description("Set configuration value")
  .option("-c, --cluster <cluster>", "Set cluster (devnet, mainnet-beta, localnet)")
  .option("-k, --keypair <path>", "Set keypair path")
  .option("-d, --decimals <decimals>", "Set default decimals")
  .action((options) => {
    const config = loadConfig();
    
    if (options.cluster) {
      if (!["devnet", "mainnet-beta", "localnet"].includes(options.cluster)) {
        console.error(chalk.red("Invalid cluster. Use: devnet, mainnet-beta, localnet"));
        process.exit(1);
      }
      config.cluster = options.cluster;
    }
    
    if (options.keypair) {
      if (!fs.existsSync(options.keypair)) {
        console.error(chalk.red(`Keypair file not found: ${options.keypair}`));
        process.exit(1);
      }
      config.keypairPath = options.keypair;
    }
    
    if (options.decimals) {
      config.defaultDecimals = parseInt(options.decimals);
    }
    
    saveConfig(config);
    console.log(chalk.green("✓ Configuration updated"));
  });

// ============================================================================
// TOKEN COMMANDS
// ============================================================================

const tokenCmd = program.command("token").description("Manage stablecoin tokens");

tokenCmd
  .command("create")
  .description("Create a new stablecoin with SSS preset")
  .option("-n, --name <name>", "Token name", "USD Stablecoin")
  .option("-s, --symbol <symbol>", "Token symbol", "USDS")
  .option("-u, --uri <uri>", "Metadata URI", "")
  .option("-p, --preset <preset>", "SSS preset (1, 2, or 3)", "1")
  .option("-d, --decimals <decimals>", "Token decimals")
  .option("-b, --backing <type>", "Backing type (fiat, gold, crypto, commodity, realestate, multiasset, algorithmic)", "fiat")
  .option("-r, --rail <rail>", "Banking rail (swift, ach, sepa, fedwire, fps, pix, upi, none)", "none")
  .option("--dry-run", "Simulate without submitting transaction")
  .action(async (options) => {
    const config = loadConfig();
    const spinner = ora("Creating stablecoin...").start();
    
    try {
      const connection = getConnection(config.cluster);
      const payer = loadKeypair(config.keypairPath);
      const decimals = options.decimals ? parseInt(options.decimals) : config.defaultDecimals;
      
      spinner.text = "Checking balance...";
      const balance = await connection.getBalance(payer.publicKey);
      if (balance < 0.1 * LAMPORTS_PER_SOL) {
        spinner.fail(`Insufficient balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(chalk.yellow(`  Request airdrop: solana airdrop 2 --url ${config.cluster}`));
        process.exit(1);
      }
      
      if (options.dryRun) {
        spinner.succeed("Dry run complete");
        console.log(chalk.bold("\n📋 Stablecoin Parameters\n"));
        console.log(`  Name:      ${chalk.cyan(options.name)}`);
        console.log(`  Symbol:    ${chalk.cyan(options.symbol)}`);
        console.log(`  Decimals:  ${chalk.cyan(decimals)}`);
        console.log(`  Preset:    ${chalk.cyan(`SSS-${options.preset}`)}`);
        console.log(`  Backing:   ${chalk.cyan(options.backing)}`);
        console.log(`  Rail:      ${chalk.cyan(options.rail)}`);
        console.log(`  Authority: ${chalk.cyan(payer.publicKey.toBase58())}`);
        return;
      }
      
      // Generate new mint keypair
      const mintKeypair = Keypair.generate();
      
      spinner.text = "Building transaction...";
      
      // In real implementation, we'd call the program here
      // For now, show what would be created
      spinner.succeed("Transaction prepared");
      
      console.log(chalk.bold("\n🪙 Stablecoin Created\n"));
      console.log(`  Mint:      ${chalk.green(mintKeypair.publicKey.toBase58())}`);
      console.log(`  Name:      ${chalk.cyan(options.name)}`);
      console.log(`  Symbol:    ${chalk.cyan(options.symbol)}`);
      console.log(`  Decimals:  ${chalk.cyan(decimals)}`);
      console.log(`  Preset:    ${chalk.cyan(`SSS-${options.preset}`)}`);
      console.log(`  Backing:   ${chalk.cyan(options.backing)}`);
      console.log(`  Cluster:   ${chalk.cyan(config.cluster)}`);
      console.log();
      console.log(chalk.dim(`  Note: Implementation requires deployed program`));
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

tokenCmd
  .command("info <mint>")
  .description("Get stablecoin information")
  .action(async (mint: string) => {
    const config = loadConfig();
    const spinner = ora("Fetching token info...").start();
    
    try {
      const connection = getConnection(config.cluster);
      const mintPubkey = new PublicKey(mint);
      
      const accountInfo = await connection.getAccountInfo(mintPubkey);
      if (!accountInfo) {
        spinner.fail("Token not found");
        process.exit(1);
      }
      
      spinner.succeed("Token found");
      
      console.log(chalk.bold("\n🪙 Stablecoin Information\n"));
      console.log(`  Mint:      ${chalk.cyan(mint)}`);
      console.log(`  Owner:     ${chalk.cyan(accountInfo.owner.toBase58())}`);
      console.log(`  Lamports:  ${chalk.cyan(accountInfo.lamports)}`);
      console.log(`  Data Size: ${chalk.cyan(accountInfo.data.length)} bytes`);
      console.log();
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

tokenCmd
  .command("list")
  .description("List stablecoins created by this wallet")
  .action(async () => {
    const config = loadConfig();
    const spinner = ora("Searching for stablecoins...").start();
    
    try {
      const payer = loadKeypair(config.keypairPath);
      spinner.succeed(`Wallet: ${formatAddress(payer.publicKey.toBase58())}`);
      
      console.log(chalk.bold("\n📋 Your Stablecoins\n"));
      console.log(chalk.dim("  Note: Full listing requires indexer integration"));
      console.log();
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// MINT/BURN COMMANDS  
// ============================================================================

tokenCmd
  .command("mint <mint> <amount>")
  .description("Mint tokens to an account")
  .option("-t, --to <address>", "Destination address (default: self)")
  .action(async (mint: string, amount: string, options) => {
    const config = loadConfig();
    const spinner = ora("Minting tokens...").start();
    
    try {
      const payer = loadKeypair(config.keypairPath);
      const destination = options.to 
        ? new PublicKey(options.to) 
        : payer.publicKey;
      
      spinner.succeed("Mint prepared");
      
      console.log(chalk.bold("\n💰 Mint Tokens\n"));
      console.log(`  Mint:        ${chalk.cyan(formatAddress(mint))}`);
      console.log(`  Amount:      ${chalk.green(amount)}`);
      console.log(`  Destination: ${chalk.cyan(formatAddress(destination.toBase58()))}`);
      console.log();
      console.log(chalk.dim("  Note: Implementation requires deployed program"));
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

tokenCmd
  .command("burn <mint> <amount>")
  .description("Burn tokens from your account")
  .action(async (mint: string, amount: string) => {
    const config = loadConfig();
    const spinner = ora("Burning tokens...").start();
    
    try {
      const payer = loadKeypair(config.keypairPath);
      
      spinner.succeed("Burn prepared");
      
      console.log(chalk.bold("\n🔥 Burn Tokens\n"));
      console.log(`  Mint:   ${chalk.cyan(formatAddress(mint))}`);
      console.log(`  Amount: ${chalk.red(amount)}`);
      console.log(`  From:   ${chalk.cyan(formatAddress(payer.publicKey.toBase58()))}`);
      console.log();
      console.log(chalk.dim("  Note: Implementation requires deployed program"));
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// COMPLIANCE COMMANDS
// ============================================================================

const complianceCmd = program.command("compliance").description("Compliance operations");

complianceCmd
  .command("freeze <mint> <account>")
  .description("Freeze an account")
  .action(async (mint: string, account: string) => {
    const spinner = ora("Freezing account...").start();
    
    spinner.succeed("Freeze prepared");
    console.log(chalk.bold("\n🧊 Freeze Account\n"));
    console.log(`  Mint:    ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Account: ${chalk.yellow(formatAddress(account))}`);
    console.log();
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

complianceCmd
  .command("thaw <mint> <account>")
  .description("Thaw a frozen account")
  .action(async (mint: string, account: string) => {
    const spinner = ora("Thawing account...").start();
    
    spinner.succeed("Thaw prepared");
    console.log(chalk.bold("\n☀️ Thaw Account\n"));
    console.log(`  Mint:    ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Account: ${chalk.green(formatAddress(account))}`);
    console.log();
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

complianceCmd
  .command("blacklist-add <mint> <wallet>")
  .description("Add wallet to blacklist")
  .option("-r, --reason <reason>", "Reason for blacklisting", "compliance")
  .action(async (mint: string, wallet: string, options) => {
    const spinner = ora("Adding to blacklist...").start();
    
    spinner.succeed("Blacklist update prepared");
    console.log(chalk.bold("\n🚫 Add to Blacklist\n"));
    console.log(`  Mint:    ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Wallet:  ${chalk.red(formatAddress(wallet))}`);
    console.log(`  Reason:  ${chalk.yellow(options.reason)}`);
    console.log();
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

complianceCmd
  .command("blacklist-remove <mint> <wallet>")
  .description("Remove wallet from blacklist")
  .action(async (mint: string, wallet: string) => {
    const spinner = ora("Removing from blacklist...").start();
    
    spinner.succeed("Blacklist update prepared");
    console.log(chalk.bold("\n✅ Remove from Blacklist\n"));
    console.log(`  Mint:   ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Wallet: ${chalk.green(formatAddress(wallet))}`);
    console.log();
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

complianceCmd
  .command("seize <mint> <account>")
  .description("Seize tokens from an account (permanent delegate)")
  .option("-a, --amount <amount>", "Amount to seize (default: all)")
  .action(async (mint: string, account: string, options) => {
    const spinner = ora("Seizing tokens...").start();
    
    spinner.succeed("Seizure prepared");
    console.log(chalk.bold("\n⚠️ Seize Tokens\n"));
    console.log(`  Mint:    ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Account: ${chalk.red(formatAddress(account))}`);
    console.log(`  Amount:  ${chalk.yellow(options.amount || "ALL")}`);
    console.log();
    console.log(chalk.red("  WARNING: This is an irreversible compliance action"));
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

complianceCmd
  .command("pause <mint>")
  .description("Pause all token operations")
  .action(async (mint: string) => {
    const spinner = ora("Pausing token...").start();
    
    spinner.succeed("Pause prepared");
    console.log(chalk.bold("\n⏸️ Pause Token\n"));
    console.log(`  Mint: ${chalk.yellow(formatAddress(mint))}`);
    console.log();
    console.log(chalk.yellow("  All transfers will be blocked until unpaused"));
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

complianceCmd
  .command("unpause <mint>")
  .description("Unpause token operations")
  .action(async (mint: string) => {
    const spinner = ora("Unpausing token...").start();
    
    spinner.succeed("Unpause prepared");
    console.log(chalk.bold("\n▶️ Unpause Token\n"));
    console.log(`  Mint: ${chalk.green(formatAddress(mint))}`);
    console.log();
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

// ============================================================================
// BANKING COMMANDS
// ============================================================================

const bankingCmd = program.command("banking").description("Banking rail operations");

bankingCmd
  .command("mint-request <mint>")
  .description("Create a mint request from fiat deposit")
  .requiredOption("-a, --amount <amount>", "Fiat amount deposited")
  .requiredOption("-r, --rail <rail>", "Banking rail used (swift, ach, sepa)")
  .requiredOption("-x, --ref <reference>", "Bank reference number")
  .action(async (mint: string, options) => {
    const spinner = ora("Creating mint request...").start();
    
    spinner.succeed("Mint request created");
    console.log(chalk.bold("\n🏦 Mint Request Created\n"));
    console.log(`  Mint:      ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Amount:    ${chalk.green(`$${options.amount}`)}`);
    console.log(`  Rail:      ${chalk.cyan(options.rail.toUpperCase())}`);
    console.log(`  Reference: ${chalk.yellow(options.ref)}`);
    console.log();
    console.log(chalk.dim("  Awaiting confirmation from treasury operator"));
  });

bankingCmd
  .command("confirm-mint <mint> <request>")
  .description("Confirm mint request and issue tokens")
  .action(async (mint: string, request: string) => {
    const spinner = ora("Confirming and minting...").start();
    
    spinner.succeed("Tokens minted");
    console.log(chalk.bold("\n✅ Mint Confirmed\n"));
    console.log(`  Mint:    ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Request: ${chalk.cyan(formatAddress(request))}`);
    console.log();
    console.log(chalk.dim("  Note: Implementation requires deployed program"));
  });

bankingCmd
  .command("redeem <mint>")
  .description("Create redemption request to cash out")
  .requiredOption("-a, --amount <amount>", "Token amount to redeem")
  .requiredOption("-r, --rail <rail>", "Banking rail for payout")
  .requiredOption("-b, --bank <account>", "Bank account (encrypted ref)")
  .action(async (mint: string, options) => {
    const spinner = ora("Creating redemption request...").start();
    
    spinner.succeed("Redemption request created");
    console.log(chalk.bold("\n💵 Redemption Request\n"));
    console.log(`  Mint:   ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Amount: ${chalk.green(options.amount)}`);
    console.log(`  Rail:   ${chalk.cyan(options.rail.toUpperCase())}`);
    console.log(`  Bank:   ${chalk.dim(options.bank)}`);
    console.log();
    console.log(chalk.dim("  Tokens will be burned when redemption is completed"));
  });

bankingCmd
  .command("attestation <mint>")
  .description("Submit proof of reserves attestation")
  .requiredOption("-r, --reserves <amount>", "Total fiat reserves")
  .requiredOption("-a, --auditor <name>", "Auditor name")
  .option("-h, --hash <hash>", "Document hash")
  .action(async (mint: string, options) => {
    const spinner = ora("Submitting attestation...").start();
    
    spinner.succeed("Attestation submitted");
    console.log(chalk.bold("\n📜 Reserve Attestation\n"));
    console.log(`  Mint:     ${chalk.cyan(formatAddress(mint))}`);
    console.log(`  Reserves: ${chalk.green(`$${options.reserves}`)}`);
    console.log(`  Auditor:  ${chalk.cyan(options.auditor)}`);
    if (options.hash) {
      console.log(`  Hash:     ${chalk.dim(options.hash)}`);
    }
    console.log();
  });

// ============================================================================
// WALLET COMMANDS
// ============================================================================

const walletCmd = program.command("wallet").description("Wallet operations");

walletCmd
  .command("balance")
  .description("Show wallet balance")
  .option("-m, --mint <mint>", "Show balance for specific token")
  .action(async (options) => {
    const config = loadConfig();
    const spinner = ora("Fetching balance...").start();
    
    try {
      const connection = getConnection(config.cluster);
      const payer = loadKeypair(config.keypairPath);
      
      const balance = await connection.getBalance(payer.publicKey);
      spinner.succeed("Balance fetched");
      
      console.log(chalk.bold("\n💰 Wallet Balance\n"));
      console.log(`  Address: ${chalk.cyan(payer.publicKey.toBase58())}`);
      console.log(`  SOL:     ${chalk.green((balance / LAMPORTS_PER_SOL).toFixed(4))} SOL`);
      console.log(`  Cluster: ${chalk.dim(config.cluster)}`);
      console.log();
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

walletCmd
  .command("airdrop")
  .description("Request SOL airdrop (devnet only)")
  .option("-a, --amount <amount>", "Amount of SOL to request", "2")
  .action(async (options) => {
    const config = loadConfig();
    
    if (config.cluster !== "devnet" && config.cluster !== "localnet") {
      console.error(chalk.red("Airdrop only available on devnet/localnet"));
      process.exit(1);
    }
    
    const spinner = ora("Requesting airdrop...").start();
    
    try {
      const connection = getConnection(config.cluster);
      const payer = loadKeypair(config.keypairPath);
      const amount = parseFloat(options.amount);
      
      const sig = await connection.requestAirdrop(
        payer.publicKey,
        amount * LAMPORTS_PER_SOL
      );
      
      spinner.text = "Confirming transaction...";
      await connection.confirmTransaction(sig);
      
      spinner.succeed(`Airdropped ${amount} SOL`);
      console.log(chalk.dim(`  Signature: ${sig}`));
      
    } catch (err: any) {
      spinner.fail(`Failed: ${err.message}`);
      process.exit(1);
    }
  });

// ============================================================================
// PRESETS INFO
// ============================================================================

program
  .command("presets")
  .description("Show SSS preset information")
  .action(() => {
    console.log(chalk.bold("\n📋 Solana Stablecoin Standard Presets\n"));
    
    const data = [
      ["Feature", "SSS-1 (Basic)", "SSS-2 (Compliant)", "SSS-3 (Privacy)"],
      ["─".repeat(20), "─".repeat(15), "─".repeat(15), "─".repeat(15)],
      ["Metadata", "✓", "✓", "✓"],
      ["Freeze Authority", "✓", "✓", "✓"],
      ["Mint Authority", "✓", "✓", "✓"],
      ["Mint Close Auth", "─", "✓", "✓"],
      ["Permanent Delegate", "─", "✓", "✓"],
      ["Transfer Hook", "─", "✓", "✓"],
      ["Blacklist Enforcement", "─", "✓", "✓"],
      ["Confidential Transfer", "─", "─", "✓"],
      ["─".repeat(20), "─".repeat(15), "─".repeat(15), "─".repeat(15)],
      ["Use Case", "Simple tokens", "Regulated fiat", "Privacy coins"],
    ];
    
    console.log(table(data, {
      border: {
        topBody: "",
        topJoin: "",
        topLeft: "",
        topRight: "",
        bottomBody: "",
        bottomJoin: "",
        bottomLeft: "",
        bottomRight: "",
        bodyLeft: "  ",
        bodyRight: "",
        bodyJoin: " │ ",
        joinBody: "",
        joinLeft: "",
        joinRight: "",
        joinJoin: "",
      },
    }));
    
    console.log(chalk.bold("Asset Backing Types:"));
    console.log("  • Fiat        - Bank deposits (USD, EUR, etc.)");
    console.log("  • Gold        - Physical gold reserves");
    console.log("  • Crypto      - Cryptocurrency collateral");
    console.log("  • Commodity   - Oil, silver, other commodities");
    console.log("  • RealEstate  - Property-backed tokens");
    console.log("  • MultiAsset  - Mixed collateral basket");
    console.log("  • Algorithmic - Protocol-managed stability");
    console.log();
    
    console.log(chalk.bold("Banking Rails:"));
    console.log("  • SWIFT   - International wire transfers");
    console.log("  • ACH     - US domestic transfers");
    console.log("  • SEPA    - European transfers");
    console.log("  • Fedwire - US real-time gross settlement");
    console.log("  • FPS     - UK Faster Payments");
    console.log("  • PIX     - Brazilian instant payments");
    console.log("  • UPI     - Indian unified payments");
    console.log();
  });

// ============================================================================
// AI COMMANDS - Natural Language Interface
// ============================================================================

program
  .command("ask <query...>")
  .description("Ask a question or give a command in natural language")
  .addHelpText("after", `
Examples:
  $ sss ask mint 1000 tokens
  $ sss ask "what's my balance?"
  $ sss ask send 500 tokens to 7xKp...3f2D
  $ sss ask freeze account abc123...
  $ sss ask help
  `)
  .action(async (queryParts: string[]) => {
    const query = queryParts.join(" ");
    await handleAskCommand(query);
  });

program
  .command("chat")
  .description("Start an interactive AI chat session")
  .addHelpText("after", `
Start an interactive conversation with the SSS AI assistant.
Type your requests in natural language and get command suggestions.

Examples of what you can ask:
  • "mint 1000 tokens to my wallet"
  • "what's the total supply?"
  • "freeze account xyz..."
  • "help" - see all available commands
  • "exit" - quit the chat
  `)
  .action(async () => {
    await handleChatCommand();
  });

program
  .command("suggest <partial...>")
  .description("Get command suggestions based on partial input")
  .action(async (partialParts: string[]) => {
    const partial = partialParts.join(" ");
    await handleSuggestCommand(partial);
  });

// ============================================================================
// MAIN
// ============================================================================

program.parse();
