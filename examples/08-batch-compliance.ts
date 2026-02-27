/**
 * Example 08: Batch Compliance Operations
 *
 * Demonstrates batch blacklist management
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { ComplianceModule } from "../sdk/src";

async function main() {
  console.log("=== Example 08: Batch Compliance Operations ===\n");

  // Setup
  const connection = new Connection("https://api.devnet.solana.com");
  const compliance = new ComplianceModule(connection);

  // Mock authority
  const authority = Keypair.generate();
  const stablecoin = new PublicKey(
    "Stable1111111111111111111111111111111111111"
  );
  const config = compliance.getConfigPDA(stablecoin);

  console.log("Batch Blacklist Configuration");
  console.log("----------------------------------------");
  console.log(`Authority: ${authority.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`Config: ${config.toBase58().slice(0, 20)}...`);

  // Generate suspicious addresses
  const suspiciousAddresses = [
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
  ];

  const reasons = [
    "Suspicious activity detected",
    "Known scam address",
    "Compliance violation",
    "Sanctions list match",
    "Fraud investigation",
  ];

  console.log(`\nAddresses to blacklist: ${suspiciousAddresses.length}`);
  suspiciousAddresses.forEach((addr, i) => {
    console.log(
      `  ${i + 1}. ${addr.toBase58().slice(0, 20)}... - ${reasons[i]}`
    );
  });

  // Execute batch blacklist
  console.log("\nExecuting batch blacklist...");
  const result = await compliance.batchBlacklist(
    authority,
    config,
    suspiciousAddresses,
    reasons
  );

  if (result.success) {
    console.log("✅ Batch blacklist successful!");
    console.log(`  Signature: ${result.signature}`);
    console.log(`  Count: ${result.data?.count}`);
    console.log(`  Authority: ${result.data?.authority}`);
  } else {
    console.log("❌ Batch blacklist failed:", result.error);
  }

  console.log("\n=== Batch Compliance Complete ===");
}

main().catch(console.error);
