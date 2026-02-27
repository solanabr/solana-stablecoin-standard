/**
 * Example 3: SSS-2 Compliance with Blacklist and Seizure
 *
 * This example shows SSS-2 compliance features including blacklist
 * enforcement and asset seizure.
 */

import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SolanaStablecoin, ComplianceModule } from "@stbr/sss-token";

async function example3() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const authority = Keypair.generate();
  const badActor = Keypair.generate();
  const treasury = Keypair.generate();

  console.log("=== Example 3: SSS-2 Compliance Features ===\n");

  // 1. Setup SDK
  const stablecoin = new SolanaStablecoin(connection);
  const compliance = new ComplianceModule(connection);

  // 2. Create SSS-2 stablecoin
  console.log("Creating SSS-2 compliant stablecoin...");
  const initResult = await stablecoin.initialize({
    name: "Compliant USD",
    symbol: "CUSD",
    decimals: 6,
    authority,
    enableTransferHook: true,
    enablePermanentDelegate: true,
  });

  if (!initResult.success) {
    console.error("Failed:", initResult.error);
    return;
  }

  const mint = initResult.data!.mint;
  const configPDA = compliance.getConfigPDA(mint);
  console.log("✓ Stablecoin created");
  console.log("  Config PDA:", configPDA.toString());

  // 3. Initialize transfer hook
  console.log("\nInitializing transfer hook...");
  await compliance.initialize({
    stablecoin: mint,
    authority,
    transferFeeBasisPoints: 100, // 1%
    maxTransferFee: new BN(1000 * 10 ** 6), // 1000 tokens max fee
    minTransferAmount: new BN(1000), // 0.001 token min
    blacklistEnabled: true,
  });
  console.log("✓ Transfer hook initialized");

  // 4. Add bad actor to blacklist
  console.log("\nAdding bad actor to blacklist...");
  await compliance.addToBlacklist({
    config: configPDA,
    authority,
    target: badActor.publicKey,
    reason: "Suspicious activity detected",
  });

  // 5. Verify blacklist
  const isBlacklisted = await compliance.isBlacklisted(
    configPDA,
    badActor.publicKey
  );
  console.log(
    "✓ Blacklist status:",
    isBlacklisted ? "BLACKLISTED" : "NOT BLACKLISTED"
  );

  // 6. Check compliance before transfer
  console.log("\nChecking transfer compliance (bad actor -> recipient)...");
  const checkResult = await compliance.checkTransfer({
    config: configPDA,
    source: badActor.publicKey,
    destination: treasury.publicKey,
    amount: new BN(1000 * 10 ** 6),
  });

  if (checkResult.data?.isCompliant) {
    console.log("✓ Compliant: Transfer would be allowed");
  } else {
    console.log("✗ Non-compliant: Transfer would be BLOCKED");
  }

  // 7. Calculate fees
  console.log("\nFee calculation examples:");
  const feeStandard = compliance.calculateFee({
    amount: new BN(1000 * 10 ** 6), // 1000 tokens
    config: {
      transferFeeBasisPoints: 100,
      maxTransferFee: new BN(1000 * 10 ** 6),
      minTransferAmount: new BN(1000),
    },
    isWhitelisted: false,
    isDelegate: false,
  });
  console.log(
    "  Standard (1000 tokens): fee =",
    feeStandard.fee.toNumber() / 10 ** 6,
    "tokens"
  );

  const feeWhitelisted = compliance.calculateFee({
    amount: new BN(1000 * 10 ** 6),
    config: {
      transferFeeBasisPoints: 100,
      maxTransferFee: new BN(1000 * 10 ** 6),
      minTransferAmount: new BN(1000),
    },
    isWhitelisted: true,
    isDelegate: false,
  });
  console.log(
    "  Whitelisted (1000 tokens): fee =",
    feeWhitelisted.fee.toNumber(),
    "(zero)"
  );

  console.log("\n✓ Example 3 complete!\n");
}

if (require.main === module) {
  example3().catch(console.error);
}

export { example3 };
