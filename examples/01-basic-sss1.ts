/**
 * Example 1: Basic SSS-1 Stablecoin Creation
 *
 * This example shows how to create a minimal stablecoin with basic RBAC.
 */

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import {
  SolanaStablecoin,
  RoleManager,
  ROLE_MINTER,
  ROLE_BURNER,
} from "@stbr/sss-token";

async function example1() {
  // Setup
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const authority = Keypair.generate();

  console.log("=== Example 1: Basic SSS-1 Stablecoin ===\n");

  // 1. Initialize SDK
  const stablecoin = new SolanaStablecoin(connection);

  // 2. Create stablecoin
  console.log("Creating stablecoin...");
  const result = await stablecoin.initialize({
    name: "Example USD",
    symbol: "EUSD",
    decimals: 6,
    authority,
    enableTransferHook: false,
    enablePermanentDelegate: false,
  });

  if (!result.success) {
    console.error("Failed:", result.error);
    return;
  }

  console.log("✓ Stablecoin created");
  console.log("  Mint:", result.data?.mint.toString());
  console.log("  State:", result.data?.stablecoin.toString());

  // 3. Get PDAs
  const mint = result.data!.mint;
  const stablecoinPDA = stablecoin.getStablecoinPDA(mint);
  const rolePDA = stablecoin.getRolePDA(authority.publicKey, mint);

  console.log("\n  PDAs:");
  console.log("  - Stablecoin:", stablecoinPDA.toString());
  console.log("  - Role:", rolePDA.toString());

  console.log("\n✓ Example 1 complete!\n");
}

// Run if executed directly
if (require.main === module) {
  example1().catch(console.error);
}

export { example1 };
