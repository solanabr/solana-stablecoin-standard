#!/usr/bin/env node
// @ts-nocheck

/**
 * SSS-Token Privacy CLI Commands
 *
 * Commands for managing confidential transfers (SSS-3)
 *
 * Usage: sss-token privacy <command> [options]
 */

import { Command } from "commander";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { PrivacyModule } from "../../sdk/src/PrivacyModule";
import { SSS3_PRESET, createSSS3Params } from "../../sdk/src/sss3";

const program = new Command();

// Setup connection
const connection = new Connection(
  process.env.RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

// Helper to load keypair
function loadKeypair(keyPath: string): Keypair {
  const resolvedPath = path.resolve(
    keyPath.replace(/^~/, process.env.HOME || "")
  );
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Keypair file not found: ${resolvedPath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

// ============================================
// PRIVACY GROUP
// ============================================

const privacy = program
  .command("privacy")
  .description("SSS-3 Confidential Transfer Management");

// ============================================
// COMMAND 1: Initialize SSS-3
// ============================================

privacy
  .command("init")
  .description("Initialize SSS-3 with confidential transfers")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin mint address")
  .option(
    "--require-allowlist",
    "Require allowlist for confidential transfers",
    false
  )
  .option(
    "--max-balance <amount>",
    "Max confidential balance (0 = unlimited)",
    "0"
  )
  .option("--auditor <key>", "Auditor public key for compliance")
  .option(
    "-k, --keypair <path>",
    "Authority keypair",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      console.log("🔒 Initializing SSS-3 - Confidential Transfer Mode...\n");

      const keypair = loadKeypair(options.keypair);
      const stablecoin = new PublicKey(options.stablecoin);

      const privacy = new PrivacyModule(connection);

      const result = await privacy.enableConfidentialTransfers({
        stablecoin,
        authority: keypair,
        requireAllowlist: options.requireAllowlist,
        maxBalance:
          options.maxBalance === "0" ? new BN(0) : new BN(options.maxBalance),
        auditor: options.auditor ? new PublicKey(options.auditor) : undefined,
      });

      if (result.success) {
        console.log("✅ SSS-3 Confidential Transfers enabled!");
        console.log("\n📋 Configuration:");
        console.log(`  Stablecoin: ${stablecoin.toBase58()}`);
        console.log(`  Config PDA: ${result.data?.config.toBase58()}`);
        console.log(`  Transaction: ${result.signature}`);
        console.log(`\n⚙️  Settings:`);
        console.log(`  Require Allowlist: ${options.requireAllowlist}`);
        console.log(
          `  Max Balance: ${
            options.maxBalance === "0" ? "Unlimited" : options.maxBalance
          }`
        );
        if (options.auditor) console.log(`  Auditor: ${options.auditor}`);
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 2: Create Confidential Account
// ============================================

privacy
  .command("create-account")
  .description("Create confidential token account")
  .requiredOption("-m, --mint <address>", "Token mint")
  .option("-k, --keypair <path>", "Owner keypair", "~/.config/solana/id.json")
  .action(async (options) => {
    try {
      console.log("🏦 Creating Confidential Account...\n");

      const keypair = loadKeypair(options.keypair);
      const mint = new PublicKey(options.mint);

      const privacy = new PrivacyModule(connection);

      const result = await privacy.createConfidentialAccount({
        mint,
        owner: keypair,
      });

      if (result.success) {
        console.log("✅ Confidential account created!");
        console.log("\n📋 Account Details:");
        console.log(`  Mint: ${mint.toBase58()}`);
        console.log(`  Owner: ${keypair.publicKey.toBase58()}`);
        console.log(
          `  Confidential Account: ${result.data?.account.toBase58()}`
        );
        console.log(
          `  ElGamal Registry: ${result.data?.elgamalRegistry.toBase58()}`
        );
        console.log(`  Transaction: ${result.signature}`);
        console.log("\n🔐 IMPORTANT:");
        console.log("  Save your ElGamal keys securely!");
        console.log("  Lost keys = Lost access to funds");
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 3: Confidential Transfer
// ============================================

privacy
  .command("transfer")
  .description("Transfer tokens confidentially (zero-knowledge proof)")
  .requiredOption("-s, --source <address>", "Source confidential account")
  .requiredOption(
    "-d, --destination <address>",
    "Destination confidential account"
  )
  .requiredOption("-m, --mint <address>", "Token mint")
  .requiredOption("-a, --amount <number>", "Amount to transfer")
  .option("--decimals <n>", "Token decimals", "6")
  .option("-k, --keypair <path>", "Sender keypair", "~/.config/solana/id.json")
  .action(async (options) => {
    try {
      console.log("🔐 Executing Confidential Transfer...\n");
      console.log("⚡ Generating ZK Range Proof...\n");

      const keypair = loadKeypair(options.keypair);
      const mint = new PublicKey(options.mint);
      const source = new PublicKey(options.source);
      const destination = new PublicKey(options.destination);

      // Parse amount
      const [whole, frac = ""] = options.amount.split(".");
      const decimals = parseInt(options.decimals);
      const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
      const amount = new BN(whole || "0")
        .mul(new BN(10).pow(new BN(decimals)))
        .add(new BN(fraction));

      const privacy = new PrivacyModule(connection);

      const result = await privacy.confidentialTransfer({
        source,
        destination,
        mint,
        amount,
        authority: keypair,
      });

      if (result.success) {
        console.log("✅ Confidential transfer completed!");
        console.log("\n🔒 Zero-Knowledge Proof:");
        console.log("  Source: HIDDEN");
        console.log(`  Destination: ${destination.toBase58().slice(0, 8)}...`);
        console.log("  Amount: ENCRYPTED");
        console.log(`  Transaction: ${result.signature}`);
        console.log("\n✨ Amount remains private on-chain!");
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 4: Deposit to Confidential
// ============================================

privacy
  .command("deposit")
  .description("Deposit tokens into confidential account")
  .requiredOption("-t, --token <address>", "Public token account")
  .requiredOption("-c, --confidential <address>", "Confidential account")
  .requiredOption("-m, --mint <address>", "Token mint")
  .requiredOption("-a, --amount <number>", "Amount to deposit")
  .option("--decimals <n>", "Token decimals", "6")
  .option("-k, --keypair <path>", "Owner keypair", "~/.config/solana/id.json")
  .action(async (options) => {
    try {
      console.log("💰 Depositing to Confidential Account...\n");

      const keypair = loadKeypair(options.keypair);

      // Parse amount
      const [whole, frac = ""] = options.amount.split(".");
      const decimals = parseInt(options.decimals);
      const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
      const amount = new BN(whole || "0")
        .mul(new BN(10).pow(new BN(decimals)))
        .add(new BN(fraction));

      const privacy = new PrivacyModule(connection);

      const result = await privacy.depositToConfidential({
        tokenAccount: new PublicKey(options.token),
        confidentialAccount: new PublicKey(options.confidential),
        mint: new PublicKey(options.mint),
        amount,
        authority: keypair,
      });

      if (result.success) {
        console.log("✅ Deposited to confidential account!");
        console.log(`  Amount: ${options.amount}`);
        console.log(`  Transaction: ${result.signature}`);
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 5: Withdraw from Confidential
// ============================================

privacy
  .command("withdraw")
  .description("Withdraw tokens from confidential account")
  .requiredOption("-c, --confidential <address>", "Confidential account")
  .requiredOption("-t, --token <address>", "Public token account")
  .requiredOption("-m, --mint <address>", "Token mint")
  .requiredOption("-a, --amount <number>", "Amount to withdraw")
  .option("--decimals <n>", "Token decimals", "6")
  .option("-k, --keypair <path>", "Owner keypair", "~/.config/solana/id.json")
  .action(async (options) => {
    try {
      console.log("💸 Withdrawing from Confidential Account...\n");
      console.log("🔓 Decrypting balance proof...\n");

      const keypair = loadKeypair(options.keypair);

      // Parse amount
      const [whole, frac = ""] = options.amount.split(".");
      const decimals = parseInt(options.decimals);
      const fraction = frac.padEnd(decimals, "0").slice(0, decimals);
      const amount = new BN(whole || "0")
        .mul(new BN(10).pow(new BN(decimals)))
        .add(new BN(fraction));

      const privacy = new PrivacyModule(connection);

      // Mock decryption key - in production, load from secure storage
      const decryptionKey = Buffer.alloc(32);

      const result = await privacy.withdrawFromConfidential({
        confidentialAccount: new PublicKey(options.confidential),
        tokenAccount: new PublicKey(options.token),
        mint: new PublicKey(options.mint),
        amount,
        authority: keypair,
        decryptionKey,
      });

      if (result.success) {
        console.log("✅ Withdrawn from confidential account!");
        console.log(`  Amount: ${options.amount}`);
        console.log(`  Transaction: ${result.signature}`);
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 6: Add to Allowlist
// ============================================

privacy
  .command("allowlist:add")
  .description("Add address to confidential transfer allowlist")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin mint")
  .requiredOption("-a, --address <key>", "Address to add")
  .option("-r, --reason <text>", "Reason for adding", "Manual verification")
  .option("--expiry <timestamp>", "Expiry timestamp (0 = never)", "0")
  .option(
    "-k, --keypair <path>",
    "Authority keypair",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      console.log("✅ Adding to Allowlist...\n");

      const keypair = loadKeypair(options.keypair);

      const privacy = new PrivacyModule(connection);

      const result = await privacy.addToAllowlist({
        stablecoin: new PublicKey(options.stablecoin),
        address: new PublicKey(options.address),
        authority: keypair,
        reason: options.reason,
        expiry: new BN(options.expiry),
      });

      if (result.success) {
        console.log("✅ Address added to allowlist!");
        console.log(`  Address: ${options.address}`);
        console.log(`  Stablecoin: ${options.stablecoin}`);
        console.log(`  Entry PDA: ${result.data?.entry.toBase58()}`);
        console.log(`  Transaction: ${result.signature}`);
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 7: Remove from Allowlist
// ============================================

privacy
  .command("allowlist:remove")
  .description("Remove address from confidential transfer allowlist")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin mint")
  .requiredOption("-a, --address <key>", "Address to remove")
  .option(
    "-k, --keypair <path>",
    "Authority keypair",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      console.log("🗑️ Removing from Allowlist...\n");

      const keypair = loadKeypair(options.keypair);

      const privacy = new PrivacyModule(connection);

      const result = await privacy.removeFromAllowlist({
        stablecoin: new PublicKey(options.stablecoin),
        address: new PublicKey(options.address),
        authority: keypair,
      });

      if (result.success) {
        console.log("✅ Address removed from allowlist!");
        console.log(`  Address: ${options.address}`);
        console.log(`  Transaction: ${result.signature}`);
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 8: Check Allowlist
// ============================================

privacy
  .command("allowlist:check")
  .description("Check if address is on allowlist")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin mint")
  .requiredOption("-a, --address <key>", "Address to check")
  .action(async (options) => {
    try {
      console.log("🔍 Checking Allowlist Status...\n");

      const privacy = new PrivacyModule(connection);

      const result = await privacy.isAddressAllowed(
        new PublicKey(options.stablecoin),
        new PublicKey(options.address)
      );

      if (result.success) {
        const status = result.data?.isAllowed ? "✅ ALLOWED" : "❌ NOT ALLOWED";
        console.log(`\n${status}`);
        console.log(`\nAddress: ${options.address}`);
        console.log(`Stablecoin: ${options.stablecoin}`);

        if (result.data?.entry) {
          console.log(`\n📋 Entry Details:`);
          console.log(`  Reason: ${result.data.entry.reason || "N/A"}`);
          console.log(
            `  Added: ${new Date(
              result.data.entry.createdAt * 1000
            ).toISOString()}`
          );
          if (result.data.entry.expiry?.toNumber()) {
            console.log(
              `  Expires: ${new Date(
                result.data.entry.expiry.toNumber() * 1000
              ).toISOString()}`
            );
          }
        }
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 9: List Allowlist
// ============================================

privacy
  .command("allowlist:list")
  .description("List all allowlisted addresses")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin mint")
  .action(async (options) => {
    try {
      console.log("📋 Listing Allowlist...\n");

      const privacy = new PrivacyModule(connection);

      const result = await privacy.getAllowlist(
        new PublicKey(options.stablecoin)
      );

      if (result.success) {
        const addresses = result.data?.addresses || [];
        console.log(`✅ ${addresses.length} addresses found\n`);

        if (addresses.length > 0) {
          console.log("Address | Reason | Expiry");
          console.log("--------|--------|-------");

          addresses.forEach((entry, i) => {
            const shortAddr = `${entry.address
              .toBase58()
              .slice(0, 8)}...${entry.address.toBase58().slice(-8)}`;
            const expiry = entry.expiry
              ? new Date(entry.expiry * 1000).toLocaleDateString()
              : "Never";
            console.log(`${shortAddr} | ${entry.reason || "N/A"} | ${expiry}`);
          });
        }
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 10: Set Auditor
// ============================================

privacy
  .command("set-auditor")
  .description("Set auditor for regulatory compliance")
  .requiredOption("-c, --stablecoin <address>", "Stablecoin mint")
  .requiredOption("-a, --auditor <key>", "Auditor public key")
  .option(
    "-k, --keypair <path>",
    "Authority keypair",
    "~/.config/solana/id.json"
  )
  .action(async (options) => {
    try {
      console.log("👁️ Setting Auditor...\n");
      console.log("⚠️  Warning: Auditor can decrypt transactions\n");

      const keypair = loadKeypair(options.keypair);
      const auditorPubkey = Buffer.from(
        new PublicKey(options.auditor).toBuffer()
      );

      const privacy = new PrivacyModule(connection);

      const result = await privacy.setAuditor({
        stablecoin: new PublicKey(options.stablecoin),
        auditor: new PublicKey(options.auditor),
        auditorPubkey: auditorPubkey,
        authority: keypair,
      });

      if (result.success) {
        console.log("✅ Auditor set successfully!");
        console.log(`  Auditor: ${options.auditor}`);
        console.log(`  Transaction: ${result.signature}`);
        console.log("\n🔍 Auditor can now:");
        console.log("  - View transaction amounts");
        console.log("  - Cannot view account balances");
        console.log("  - Cannot transfer funds");
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 11: Get Confidential Account
// ============================================

privacy
  .command("account-info")
  .description("Get confidential account information")
  .requiredOption("-a, --account <address>", "Confidential account address")
  .action(async (options) => {
    try {
      console.log("🏦 Confidential Account Information\n");

      const privacy = new PrivacyModule(connection);

      const result = await privacy.getConfidentialAccount(
        new PublicKey(options.account)
      );

      if (result.success) {
        console.log("✅ Account found");
        console.log("\n📋 Details:");
        console.log(`  Owner: ${result.data?.owner.toBase58()}`);
        console.log(`  Mint: ${result.data?.mint.toBase58()}`);
        console.log("  Balance: ENCRYPTED");
        console.log("  (Requires decryption key to view)");
      } else {
        console.error("❌ Failed:", result.error);
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 12: Generate ElGamal Keys
// ============================================

privacy
  .command("generate-keys")
  .description("Generate ElGamal keypair for confidential transfers")
  .option("-o, --output <path>", "Output path for keys")
  .action(async (options) => {
    try {
      console.log("🔐 Generating ElGamal Keypair...\n");
      console.log("⚠️  IMPORTANT: Save these keys securely!\n");

      const { generateElGamalKeypair } = await import(
        "../../sdk/src/PrivacyModule"
      );
      const keys = generateElGamalKeypair();

      console.log("✅ Keys generated!\n");
      console.log("Public Key:", keys.publicKey.toString("base64"));
      console.log(
        "Private Key:",
        keys.privateKey.toString("hex").slice(0, 16) + "... [HIDDEN]"
      );

      if (options.output) {
        const keyData = {
          publicKey: keys.publicKey.toString("base64"),
          privateKey: keys.privateKey.toString("hex"),
          generatedAt: new Date().toISOString(),
          warning: "KEEP PRIVATE KEY SECURE!",
        };

        fs.writeFileSync(options.output, JSON.stringify(keyData, null, 2));
        console.log(`\n✅ Keys saved to: ${options.output}`);
      }

      console.log("\n🔒 Security Tips:");
      console.log("  - Store private key in secure vault");
      console.log("  - Never commit keys to git");
      console.log("  - Share public key only");
      console.log("  - Lost private key = Lost access to confidential funds");
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

// ============================================
// COMMAND 13: Decrypt Balance (with key)
// ============================================

privacy
  .command("decrypt")
  .description("Decrypt confidential balance (requires private key)")
  .requiredOption("-a, --account <address>", "Confidential account")
  .requiredOption("-k, --key <path>", "Path to ElGamal private key file")
  .action(async (options) => {
    try {
      console.log("🔓 Decrypting Balance...\n");
      console.log("⏳ Processing ElGamal decryption...\n");

      // Mock decryption - in production, use proper ElGamal library
      console.log("⚠️  Note: This is a mock implementation");
      console.log("  Real decryption requires bulletproofs-rs or similar\n");

      const privacy = new PrivacyModule(connection);
      const account = await privacy.getConfidentialAccount(
        new PublicKey(options.account)
      );

      if (account.success) {
        console.log("✅ Account found");
        console.log("\n🔐 Decrypted Balance:");
        console.log("  [REDACTED FOR PRIVACY]");
        console.log("\n📁 Account:");
        console.log(`  Address: ${options.account}`);
        console.log(`  Owner: ${account.data?.owner.toBase58()}`);
      } else {
        console.error("❌ Account not found");
        process.exit(1);
      }
    } catch (error: any) {
      console.error("❌ Error:", error.message);
      process.exit(1);
    }
  });

export default privacy;
