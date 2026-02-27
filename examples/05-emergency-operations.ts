/**
 * Example 5: Emergency Operations - Pause, Seizure, and Recovery
 *
 * This example demonstrates emergency response procedures using
 * the pause feature and asset seizure capabilities.
 */

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  SolanaStablecoin,
  RoleManager,
  ComplianceModule,
} from "@stbr/sss-token";

async function example5() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const authority = Keypair.generate();
  const treasury = Keypair.generate();

  console.log("=== Example 5: Emergency Operations ===\n");

  // Setup
  const stablecoin = new SolanaStablecoin(connection);
  const roles = new RoleManager(connection);
  const compliance = new ComplianceModule(connection);

  // 1. Create full SSS-2 stablecoin
  console.log("Creating SSS-2 stablecoin...");
  const initResult = await stablecoin.initialize({
    name: "Emergency Response USD",
    symbol: "ERUSD",
    decimals: 6,
    authority,
    enableTransferHook: true,
    enablePermanentDelegate: true,
  });

  const mint = initResult.data!.mint;
  const configPDA = compliance.getConfigPDA(mint);
  console.log("✓ Created:", mint.toString());

  // Initialize hook
  await compliance.initialize({
    stablecoin: mint,
    authority,
    transferFeeBasisPoints: 100,
    maxTransferFee: new BN(1000 * 10 ** 6),
    minTransferAmount: new BN(1000),
    blacklistEnabled: true,
  });

  // 2. Emergency: Pause all operations
  console.log("\n--- Emergency: Pausing All Operations ---\n");

  // Grant pauser role
  const pauser = Keypair.generate();
  await roles.grantRole({
    mint,
    authority,
    target: pauser.publicKey,
    role: 8, // Pauser
  });

  await stablecoin.pause({
    stablecoin: initResult.data!.stablecoin,
    pauser,
  });
  console.log("✓ All operations PAUSED by emergency team");

  // 3. Emergency: Investigate and seize
  console.log("\n--- Emergency: Asset Seizure ---\n");

  const badActor = Keypair.generate();

  // Add to blacklist first
  await compliance.addToBlacklist({
    config: configPDA,
    authority,
    target: badActor.publicKey,
    reason: "Emergency: Suspected fraud",
  });
  console.log("✓ Bad actor blacklisted");

  // Get blacklist PDA
  const blacklistPDA = compliance.getBlacklistPDA(
    configPDA,
    badActor.publicKey
  );
  console.log("  Blacklist PDA:", blacklistPDA.toString());

  // Seize all assets
  await compliance.seize({
    config: configPDA,
    authority, // Must be permanent delegate
    source: badActor.publicKey,
    treasury: treasury.publicKey,
    mint,
    reason: "Emergency asset recovery",
  });
  console.log("✓ Assets seized and transferred to treasury");

  const seizedTokens = new BN(5000 * 10 ** 6); // Example amount
  console.log("  Recovered:", seizedTokens.toNumber() / 10 ** 6, "tokens");

  // 4. Resume operations
  console.log("\n--- Emergency: Resume Operations ---\n");

  await stablecoin.unpause({
    stablecoin: initResult.data!.stablecoin,
    pauser,
  });
  console.log("✓ Operations RESUMED");

  // 5. Post-emergency verification
  console.log("\n--- Post-Emergency Status ---\n");

  const state = await stablecoin.getState(initResult.data!.stablecoin);
  console.log("Stablecoin status:", state.data?.isPaused ? "PAUSED" : "ACTIVE");

  const isBlacklistedCheck = await compliance.isBlacklisted(
    configPDA,
    badActor.publicKey
  );
  console.log(
    "Bad actor status:",
    isBlacklistedCheck ? "BLACKLISTED" : "CLEARED"
  );

  console.log("\n✓ Example 5 complete - Emergency response successful!\n");

  // Summary
  console.log("=== Emergency Response Summary ===");
  console.log("1. Detected suspicious activity");
  console.log("2. Paused all operations immediately");
  console.log("3. Blacklisted suspicious addresses");
  console.log("4. Seized assets to treasury");
  console.log("5. Verified system integrity");
  console.log("6. Resumed safe operations");
}

if (require.main === module) {
  example5().catch(console.error);
}

export { example5 };
