/**
 * Example 06: Batch Operations
 *
 * Demonstrates batch mint to multiple recipients
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SolanaStablecoin, MultisigModule } from "../sdk/src";

async function main() {
  console.log("=== Example 06: Batch Operations ===\n");

  // Setup
  const connection = new Connection("https://api.devnet.solana.com");
  const stablecoin = new SolanaStablecoin(connection);

  // Mock minter keypair
  const minter = Keypair.generate();
  const mint = new PublicKey("Mint111111111111111111111111111111111111111");

  // Batch recipients
  const recipients = [
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
  ];

  // Batch amounts
  const amounts = [
    new BN(1000000), // 1.00 token (6 decimals)
    new BN(2000000), // 2.00 tokens
    new BN(500000), // 0.50 tokens
  ];

  console.log("Batch mint configuration:");
  console.log(`  Recipients: ${recipients.length}`);
  console.log(
    `  Total amount: ${amounts
      .reduce((a, b) => a.add(b), new BN(0))
      .toString()}`
  );

  // Execute batch mint
  console.log("\nExecuting batch mint...");
  const result = await stablecoin.batchMint(minter, mint, recipients, amounts);

  if (result.success) {
    console.log("✅ Batch mint successful!");
    console.log(`  Signature: ${result.signature}`);
    console.log(`  Total recipients: ${result.data?.recipients}`);
    console.log(`  Total amount: ${result.data?.totalAmount}`);
  } else {
    console.log("❌ Batch mint failed:", result.error);
  }

  console.log("\n=== Batch Operations Complete ===");
}

main().catch(console.error);
