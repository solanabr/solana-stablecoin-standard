#!/usr/bin/env node
// @ts-nocheck

/**
 * SSS Token Admin CLI
 *
 * Commands untuk operator stablecoin
 * Usage: sss-token <command> [options]
 */

import { Command } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { SolanaStablecoin } from "../../sdk/dist/SolanaStablecoin";
import { BN } from "@coral-xyz/anchor";

const program = new Command();

// Load config
const configPath = path.join(
  process.env.HOME || "",
  ".sss-token",
  "config.json"
);
let config: any = {};
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (e) {
  console.warn("Could not load config");
}

// Setup connection
const connection = new Connection(
  config.rpcUrl || process.env.RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

// Helper to load keypair
function loadKeypair(keyPath: string): Keypair {
  const resolvedPath = path.resolve(keyPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Keypair file not found: ${resolvedPath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// ============================================
// INITIALIZE COMMAND
// ============================================

program
  .command("init")
  .description("Initialize a new stablecoin")
  .requiredOption("-n, --name <name>", "Token name")
  .requiredOption("-s, --symbol <symbol>", "Token symbol")
  .option("-d, --decimals <n>", "Decimals (default: 6)", "6")
  .option(
    "--sss2",
    "Enable SSS-2 features (transfer hook + permanent delegate)"
  )
  .option(
    "-k, --keypair <path>",
    "Authority keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      const result = await sdk.initialize({
        name: options.name,
        symbol: options.symbol,
        decimals: parseInt(options.decimals),
        authority: keypair,
        enableTransferHook: options.sss2,
        enablePermanentDelegate: options.sss2,
      });

      if (result.success) {
        console.log("✅ Stablecoin initialized successfully!");
        console.log("");
        console.log("Mint:", result.data?.mint.toBase58());
        console.log("Stablecoin PDA:", result.data?.stablecoin.toBase58());
        console.log("Transaction:", result.signature);
        console.log("");
        console.log("Save these addresses for future operations:");
        console.log(
          `  export STABLECOIN_MINT="${result.data?.mint.toBase58()}"`
        );
        console.log(
          `  export STABLECOIN_PDA="${result.data?.stablecoin.toBase58()}"`
        );
      } else {
        console.error("❌ Initialization failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// MINT COMMAND
// ============================================

program
  .command("mint")
  .description("Mint tokens to a recipient")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .requiredOption("-r, --recipient <address>", "Recipient address")
  .requiredOption("-a, --amount <amount>", "Amount (in base units)")
  .option("-d, --decimals <n>", "Decimals for human-readable amount", "6")
  .option(
    "-k, --keypair <path>",
    "Minter keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      // Parse amount
      let amount: BN;
      if (options.amount.includes(".")) {
        // Human-readable amount
        const [whole, frac] = options.amount.split(".");
        const decimals = parseInt(options.decimals);
        const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
        const wholeBN = new BN(whole || "0");
        const fractionBN = new BN(fraction);
        amount = wholeBN.mul(new BN(10).pow(new BN(decimals))).add(fractionBN);
      } else {
        amount = new BN(options.amount);
      }

      const result = await sdk.mint({
        stablecoin: new PublicKey(options.stablecoin),
        minter: keypair,
        recipient: new PublicKey(options.recipient),
        amount,
      });

      if (result.success) {
        console.log("✅ Tokens minted successfully!");
        console.log("Transaction:", result.signature);
      } else {
        console.error("❌ Mint failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// BURN COMMAND
// ============================================

program
  .command("burn")
  .description("Burn tokens from an account")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .requiredOption("-a, --account <address>", "Token account to burn from")
  .requiredOption("--amount <amount>", "Amount (in base units)")
  .option(
    "-k, --keypair <path>",
    "Burner keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      const result = await sdk.burn({
        stablecoin: new PublicKey(options.stablecoin),
        burner: keypair,
        tokenAccount: new PublicKey(options.account),
        amount: new BN(options.amount),
      });

      if (result.success) {
        console.log("✅ Tokens burned successfully!");
        console.log("Transaction:", result.signature);
      } else {
        console.error("❌ Burn failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// FREEZE/THAW COMMANDS
// ============================================

program
  .command("freeze")
  .description("Freeze a token account")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .requiredOption("-a, --account <address>", "Token account to freeze")
  .option(
    "-k, --keypair <path>",
    "Pauser keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      const result = await sdk.freeze({
        stablecoin: new PublicKey(options.stablecoin),
        pauser: keypair,
        tokenAccount: new PublicKey(options.account),
      });

      if (result.success) {
        console.log("✅ Account frozen successfully!");
        console.log("Transaction:", result.signature);
      } else {
        console.error("❌ Freeze failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("thaw")
  .description("Thaw (unfreeze) a token account")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .requiredOption("-a, --account <address>", "Token account to thaw")
  .option(
    "-k, --keypair <path>",
    "Pauser keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      const result = await sdk.thaw({
        stablecoin: new PublicKey(options.stablecoin),
        pauser: keypair,
        tokenAccount: new PublicKey(options.account),
      });

      if (result.success) {
        console.log("✅ Account thawed successfully!");
        console.log("Transaction:", result.signature);
      } else {
        console.error("❌ Thaw failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// PAUSE/UNPAUSE COMMANDS
// ============================================

program
  .command("pause")
  .description("Pause all stablecoin operations")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .option(
    "-k, --keypair <path>",
    "Pauser keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      const result = await sdk.pause({
        stablecoin: new PublicKey(options.stablecoin),
        pauser: keypair,
      });

      if (result.success) {
        console.log("✅ Contract paused!");
        console.log("Transaction:", result.signature);
        console.log(
          "⚠️  WARNING: All mint/burn/transfer operations are now blocked!"
        );
      } else {
        console.error("❌ Pause failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

program
  .command("unpause")
  .description("Unpause stablecoin operations")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .option(
    "-k, --keypair <path>",
    "Pauser keypair path",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      const keypair = loadKeypair(options.keypair);
      const wallet = { payer: keypair } as any;

      const sdk = new SolanaStablecoin(connection, wallet);

      const result = await sdk.unpause({
        stablecoin: new PublicKey(options.stablecoin),
        pauser: keypair,
      });

      if (result.success) {
        console.log("✅ Contract unpaused!");
        console.log("Transaction:", result.signature);
        console.log("✅ Operations are now allowed");
      } else {
        console.error("❌ Unpause failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// STATUS COMMAND
// ============================================

program
  .command("status")
  .description("Get stablecoin status")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .action(async (options) => {
    try {
      const sdk = new SolanaStablecoin(connection, {} as any);

      const result = await sdk.getState(new PublicKey(options.stablecoin));

      if (result.success) {
        const state = result.data;
        console.log("═══════════════════════════════════════");
        console.log("        STABLECOIN STATUS");
        console.log("═══════════════════════════════════════");
        console.log("");
        console.log(`Name:          ${state.name}`);
        console.log(`Symbol:        ${state.symbol}`);
        console.log(`Decimals:      ${state.decimals}`);
        console.log(`Total Supply:  ${state.totalSupply.toString()}`);
        console.log(`Authority:     ${state.authority.toBase58()}`);
        console.log(`Mint:          ${state.mint.toBase58()}`);
        console.log("");
        console.log(
          `Status:        ${state.isPaused ? "🔴 PAUSED" : "🟢 ACTIVE"}`
        );
        console.log(
          `Features:      ${
            sdk.decodeFeatures(state.features).join(", ") || "None"
          }`
        );
        console.log("");
        console.log("═══════════════════════════════════════");
      } else {
        console.error("❌ Failed to get status:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// MINERS COMMAND
// ============================================

program
  .command("minters")
  .description("List active minters")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .action(async (options) => {
    console.log("Fetching minters...");
    // Implementation would query the RPC for minter accounts
    console.log("Feature: Query all minter accounts by filter");
  });

// ============================================
// HOLDERS COMMAND
// ============================================

program
  .command("holders")
  .description("List token holders")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA (mint)")
  .option("--min-balance <amount>", "Minimum balance filter (in base units)")
  .action(async (options) => {
    try {
      const mint = new PublicKey(options.stablecoin);

      // Get all token accounts
      const accounts = await connection.getProgramAccounts(
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        {
          filters: [
            { dataSize: 165 },
            { memcmp: { offset: 0, bytes: mint.toBase58() } },
          ],
        }
      );

      console.log("═══════════════════════════════════════");
      console.log(`        TOKEN HOLDERS (${accounts.length})`);
      console.log("═══════════════════════════════════════");
      console.log("");

      let totalBalance = 0;
      const holders: { owner: string; balance: number }[] = [];

      for (const { account } of accounts) {
        // Parse account data
        const data = account.data;
        const balance = data.readBigUInt64LE(64);
        const ownerBytes = data.slice(32, 64);
        const owner = new PublicKey(ownerBytes).toBase58();

        const balanceNum = Number(balance);
        totalBalance += balanceNum;

        const minBalance = options.minBalance
          ? parseInt(options.minBalance)
          : 0;
        if (balanceNum >= minBalance) {
          holders.push({ owner, balance: balanceNum });
        }
      }

      // Sort by balance descending
      holders.sort((a, b) => b.balance - a.balance);

      holders.slice(0, 50).forEach((h, i) => {
        console.log(
          `${i + 1}. ${h.owner.slice(0, 8)}...${h.owner.slice(
            -8
          )}  ${h.balance.toLocaleString()}`
        );
      });

      if (holders.length > 50) {
        console.log(`\n... and ${holders.length - 50} more`);
      }

      console.log("");
      console.log(`Total Supply: ${totalBalance.toLocaleString()}`);
      console.log("═══════════════════════════════════════");
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// AUDIT LOG COMMAND
// ============================================

program
  .command("audit")
  .description("View audit log")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin PDA")
  .option("--action <type>", "Filter by action type (mint, burn, freeze, etc.)")
  .option("--from <date>", "Start date (YYYY-MM-DD)")
  .option("--to <date>", "End date (YYYY-MM-DD)")
  .action(async (options) => {
    console.log("Fetching audit log...");
    console.log("This feature requires the backend API to be running");
    // Implementation would query the API
  });

// ============================================
// CONFIG COMMAND
// ============================================

program
  .command("config")
  .description("Configure CLI settings")
  .option("--set-rpc <url>", "Set RPC endpoint")
  .option("--set-keypair <path>", "Set default keypair path")
  .action((options) => {
    const config: any = {};

    if (options.setRpc) {
      config.rpcUrl = options.setRpc;
    }

    if (options.setKeypair) {
      config.keypairPath = options.setKeypair;
    }

    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Configuration saved to", configPath);
  });

// ============================================
// MAIN
// ============================================

program
  .version("0.1.0")
  .description("SSS Token Admin CLI")
  .addHelpText(
    "after",
    `
Examples:
  $ sss-token init -n "My USD" -s MUSD
  $ sss-token mint -c <STABLECOIN_PDA> -r <RECIPIENT> -a 1000
  $ sss-token status -c <STABLECOIN_PDA>
  $ sss-token holders -c <MINT> --min-balance 100000
  $ sss-token config --set-rpc https://api.mainnet-beta.solana.com
`
  );

program.parse();

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
