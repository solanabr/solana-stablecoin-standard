/**
 * Example 2: Minting with Role-Based Access Control
 *
 * This example shows how to mint tokens with minter quotas and role checks.
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SolanaStablecoin, RoleManager, ROLE_MINTER } from "@stbr/sss-token";

async function example2() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const authority = Keypair.generate();
  const recipient = Keypair.generate();

  console.log("=== Example 2: Minting with RBAC ===\n");

  // 1. Setup SDK
  const stablecoin = new SolanaStablecoin(connection);
  const roleManager = new RoleManager(connection);

  // 2. Create stablecoin
  console.log("Creating stablecoin...");
  const initResult = await stablecoin.initialize({
    name: "RBAC Test USD",
    symbol: "RTUSD",
    decimals: 6,
    authority,
  });

  if (!initResult.success) {
    console.error("Failed to create stablecoin:", initResult.error);
    return;
  }

  const mint = initResult.data!.mint;
  console.log("✓ Created mint:", mint.toString());

  // 3. Set up dedicated minter with quota
  const minter = Keypair.generate();
  console.log("\nGranting minter role...");

  // Grant MINTER role
  await roleManager.grantRole({
    mint,
    authority,
    target: minter.publicKey,
    role: ROLE_MINTER,
  });

  // Set quota: 1,000,000 tokens max
  await roleManager.setMinterQuota({
    mint,
    authority,
    minter: minter.publicKey,
    quota: new BN(1_000_000 * 10 ** 6), // 1M tokens with 6 decimals
  });

  // 4. Check roles
  const hasRole = await roleManager.isMinter(mint, minter.publicKey);
  console.log("✓ Minter role granted:", hasRole);

  const remainingQuota = await roleManager.getRemainingQuota(
    mint,
    minter.publicKey
  );
  console.log("  Remaining quota:", remainingQuota.toString(), "tokens");

  // 5. Mint tokens using minter
  console.log("\nMinting 100 tokens...");
  const mintResult = await stablecoin.mint({
    stablecoin: initResult.data!.stablecoin,
    minter: minter,
    recipient: recipient.publicKey,
    amount: new BN(100 * 10 ** 6), // 100 tokens
  });

  if (mintResult.success) {
    console.log("✓ Minted 100 tokens to", recipient.publicKey.toString());
  }

  // 6. Check updated quota
  const newRemaining = await roleManager.getRemainingQuota(
    mint,
    minter.publicKey
  );
  console.log("  Updated remaining quota:", newRemaining.toString(), "tokens");

  console.log("\n✓ Example 2 complete!\n");
}

if (require.main === module) {
  example2().catch(console.error);
}

export { example2 };
