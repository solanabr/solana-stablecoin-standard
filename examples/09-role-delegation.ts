/**
 * Example 09: Role Delegation & Management
 *
 * Demonstrates RBAC role assignment and delegation
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  ROLE_MASTER,
  ROLE_MINTER,
  ROLE_BURNER,
  ROLE_PAUSER,
} from "../sdk/src";

async function main() {
  console.log("=== Example 09: Role Delegation & Management ===\n");

  // Setup
  const connection = new Connection("https://api.devnet.solana.com");
  const stablecoinSDK = new SolanaStablecoin(connection);
  const roleManager = new RoleManager(connection);

  // Mock keys
  const masterAuthority = Keypair.generate();
  const minterCandidate = Keypair.generate();
  const burnerCandidate = Keypair.generate();
  const pauserCandidate = Keypair.generate();

  const mint = new PublicKey("Mint111111111111111111111111111111111111111");

  console.log("Role Assignment Configuration");
  console.log("----------------------------------------");
  console.log(
    `Master Authority: ${masterAuthority.publicKey.toBase58().slice(0, 20)}...`
  );
  console.log(`\nCandidates:`);
  console.log(
    `  Minter:  ${minterCandidate.publicKey.toBase58().slice(0, 20)}...`
  );
  console.log(
    `  Burner:  ${burnerCandidate.publicKey.toBase58().slice(0, 20)}...`
  );
  console.log(
    `  Pauser:  ${pauserCandidate.publicKey.toBase58().slice(0, 20)}...`
  );

  // Step 1: Assign Minter Role
  console.log("\n\nStep 1: Assign Minter Role");
  console.log("----------------------------------------");

  const minterResult = await roleManager.assignRole(
    masterAuthority,
    mint,
    minterCandidate.publicKey,
    ROLE_MINTER
  );

  if (minterResult.success) {
    console.log("✅ Minter role assigned");
    console.log(`  Tx: ${minterResult.signature?.slice(0, 30)}...`);
  }

  // Step 2: Assign Burner Role
  console.log("\nStep 2: Assign Burner Role");
  console.log("----------------------------------------");

  const burnerResult = await roleManager.assignRole(
    masterAuthority,
    mint,
    burnerCandidate.publicKey,
    ROLE_BURNER
  );

  if (burnerResult.success) {
    console.log("✅ Burner role assigned");
    console.log(`  Tx: ${burnerResult.signature?.slice(0, 30)}...`);
  }

  // Step 3: Assign Pauser Role
  console.log("\nStep 3: Assign Pauser Role");
  console.log("----------------------------------------");

  const pauserResult = await roleManager.assignRole(
    masterAuthority,
    mint,
    pauserCandidate.publicKey,
    ROLE_PAUSER
  );

  if (pauserResult.success) {
    console.log("✅ Pauser role assigned");
    console.log(`  Tx: ${pauserResult.signature?.slice(0, 30)}...`);
  }

  // Step 4: Check Role Status
  console.log("\nStep 4: Verify Role Assignments");
  console.log("----------------------------------------");

  const minterRole = await roleManager.getRolePDA(
    minterCandidate.publicKey,
    mint
  );
  const burnerRole = await roleManager.getRolePDA(
    burnerCandidate.publicKey,
    mint
  );
  const pauserRole = await roleManager.getRolePDA(
    pauserCandidate.publicKey,
    mint
  );

  console.log(`Minter PDA:  ${minterRole.toBase58().slice(0, 20)}...`);
  console.log(`Burner PDA:  ${burnerRole.toBase58().slice(0, 20)}...`);
  console.log(`Pauser PDA:  ${pauserRole.toBase58().slice(0, 20)}...`);

  // Step 5: Revoke Pauser Role
  console.log("\nStep 5: Revoke Pauser Role (Emergency)");
  console.log("----------------------------------------");

  const revokeResult = await roleManager.revokeRole(
    masterAuthority,
    mint,
    pauserCandidate.publicKey,
    ROLE_PAUSER
  );

  if (revokeResult.success) {
    console.log("✅ Pauser role revoked");
    console.log(`  Tx: ${revokeResult.signature?.slice(0, 30)}...`);
    console.log("  Reason: Security review requirement");
  }

  // Summary
  console.log("\n\n=== Role Delegation Summary ===");
  console.log("----------------------------------------");
  console.log("Active Roles:");
  console.log(
    `  ✅ Minter:  ${minterCandidate.publicKey.toBase58().slice(0, 20)}...`
  );
  console.log(
    `  ✅ Burner:  ${burnerCandidate.publicKey.toBase58().slice(0, 20)}...`
  );
  console.log(`  ❌ Pauser:  REVOKED`);
  console.log("\nAll role changes logged and auditable on-chain.");
  console.log("\n=== Role Delegation Complete ===");
}

main().catch(console.error);
