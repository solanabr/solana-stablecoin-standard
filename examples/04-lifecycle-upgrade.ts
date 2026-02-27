/**
 * Example 4: Complete Lifecycle - SSS-1 to SSS-2 Upgrade
 *
 * This example shows upgrading from SSS-1 (basic) to SSS-2 (compliant)
 * after initial deployment.
 */

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  SolanaStablecoin,
  RoleManager,
  ComplianceModule,
} from "@stbr/sss-token";

async function example4() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const authority = Keypair.generate();

  console.log("=== Example 4: SSS-1 → SSS-2 Upgrade ===\n");

  // Phase 1: SSS-1 Basic Setup
  console.log("--- Phase 1: SSS-1 Basic Setup ---\n");

  const stablecoin = new SolanaStablecoin(connection);
  const roles = new RoleManager(connection);

  console.log("Creating basic SSS-1 stablecoin...");
  const sss1Result = await stablecoin.initialize({
    name: "Upgradeable USD",
    symbol: "UUSD",
    decimals: 6,
    authority,
    enableTransferHook: false, // Start without
    enablePermanentDelegate: false,
  });

  const mint = sss1Result.data!.mint;
  console.log("✓ SSS-1 stablecoin created:", mint.toString());

  // Get state
  const state = await stablecoin.getState(sss1Result.data!.stablecoin);
  console.log("  Features:", state.data?.features);

  // Phase 2: Enable Compliance Features
  console.log("\n--- Phase 2: Enable SSS-2 Features ---\n");

  console.log("Enabling transfer hook...");
  await stablecoin.initialize({
    name: state.data!.name,
    symbol: state.data!.symbol,
    decimals: state.data!.decimals,
    authority,
    enableTransferHook: true,
    enablePermanentDelegate: true,
  });
  console.log("✓ Transfer hook enabled");

  const compliance = new ComplianceModule(connection);

  console.log("\nInitializing compliance module...");
  await compliance.initialize({
    stablecoin: mint,
    authority,
    transferFeeBasisPoints: 50, // 0.5%
    maxTransferFee: new BN(100 * 10 ** 6), // 100 tokens
    minTransferAmount: new BN(10_000), // 0.01 token
    blacklistEnabled: true,
  });
  console.log("✓ Compliance module initialized");

  const configPDA = compliance.getConfigPDA(mint);

  // Phase 3: Compliance Operations
  console.log("\n--- Phase 3: Compliance Operations ---\n");

  // Add compliance team
  const complianceOfficer = Keypair.generate();
  const blacklister = Keypair.generate();

  await roles.grantRole({
    mint,
    authority,
    target: complianceOfficer.publicKey,
    role: 8, // Pauser role
  });

  await roles.grantRole({
    mint,
    authority,
    target: blacklister.publicKey,
    role: 16, // Blacklister role
  });

  console.log("✓ Compliance roles assigned");

  // Blacklist example
  const badActor = Keypair.generate();
  await compliance.addToBlacklist({
    config: configPDA,
    authority,
    target: badActor.publicKey,
    reason: "Sanctions list",
  });
  console.log("✓ Address blacklisted by compliance officer");

  // Verification
  const isBlacklisted = await compliance.isBlacklisted(
    configPDA,
    badActor.publicKey
  );
  console.log(
    "\n  Verification - Bad actor status:",
    isBlacklisted ? "BLACKLISTED" : "OK"
  );

  const officerRoles = await roles.getRoles(mint, complianceOfficer.publicKey);
  console.log(
    "  Compliance officer roles:",
    roles.getRoleNames(officerRoles).join(", ")
  );

  console.log("\n✓ Example 4 complete - Upgrade successful!\n");
}

if (require.main === module) {
  example4().catch(console.error);
}

export { example4 };
