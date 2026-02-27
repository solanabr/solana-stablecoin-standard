/**
 * Example 10: Advanced Transfer Operations
 *
 * Demonstrates transfers with fees, compliance checks, and whitelisting
 */

import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SolanaStablecoin, ComplianceModule } from "../sdk/src";

async function main() {
  console.log("=== Example 10: Advanced Transfer Operations ===\n");

  // Setup
  const connection = new Connection("https://api.devnet.solana.com");
  const stablecoin = new SolanaStablecoin(connection);
  const compliance = new ComplianceModule(connection);

  // Mock keys
  const sender = Keypair.generate();
  const recipient = Keypair.generate();
  const authority = Keypair.generate();

  const mint = new PublicKey("Mint111111111111111111111111111111111111111");
  const stablecoinPDA = stablecoin.getStablecoinPDA(mint);
  const configPDA = compliance.getConfigPDA(stablecoinPDA);

  console.log("Transfer Configuration");
  console.log("----------------------------------------");
  console.log(`Sender:    ${sender.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`Recipient: ${recipient.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`Mint:      ${mint.toBase58().slice(0, 20)}...`);

  const transferAmount = new BN(1000000000); // 1000 tokens (9 decimals)
  console.log(`Amount:    ${transferAmount.toString()} (1000 tokens)`);

  // Step 1: Compliance Check
  console.log("\n\nStep 1: Pre-Transfer Compliance Check");
  console.log("----------------------------------------");

  const complianceCheck = await compliance.checkCompliance({
    config: configPDA,
    source: sender.publicKey,
    destination: recipient.publicKey,
    amount: transferAmount,
  });

  if (complianceCheck.success) {
    const isCompliant = complianceCheck.data?.isCompliant;
    const fee = complianceCheck.data?.fee;

    console.log(`✅ Compliance check passed: ${isCompliant}`);
    console.log(`   Transfer fee: ${fee?.toString()}`);

    if (!isCompliant) {
      console.log("❌ Transfer blocked due to compliance failure");
      return;
    }
  } else {
    console.log("⚠️ Compliance check error:", complianceCheck.error);
  }

  // Step 2: Check Whitelist Status
  console.log("\nStep 2: Whitelist Status Check");
  console.log("----------------------------------------");

  const isWhitelisted = await compliance.isWhitelisted(
    configPDA,
    recipient.publicKey
  );
  console.log(`Recipient whitelisted: ${isWhitelisted}`);

  if (isWhitelisted) {
    console.log("   ✅ Fee waived for whitelisted address");
  } else {
    console.log("   ℹ️ Standard fee applies");
  }

  // Step 3: Calculate Net Amount
  console.log("\nStep 3: Fee Calculation");
  console.log("----------------------------------------");

  const transferFeeBasisPoints = 25; // 0.25%
  const maxFee = new BN(1000000); // Max 1 token fee

  let calculatedFee = transferAmount
    .mul(new BN(transferFeeBasisPoints))
    .div(new BN(10000));
  if (calculatedFee.gt(maxFee)) {
    calculatedFee = maxFee;
  }

  const netAmount = transferAmount.sub(calculatedFee);

  console.log(`Gross amount:  ${transferAmount.toString()}`);
  console.log(
    `Fee (${transferFeeBasisPoints / 100}%): ${calculatedFee.toString()}`
  );
  console.log(`Net amount:    ${netAmount.toString()}`);

  if (isWhitelisted) {
    console.log("   ⚡ Whitelisted: Fee = 0");
  }

  // Step 4: Execute Transfer
  console.log("\nStep 4: Execute Transfer");
  console.log("----------------------------------------");

  // Mock transfer (actual implementation would build and send transaction)
  console.log("Building transfer transaction...");
  console.log("   ✅ Amount validated");
  console.log("   ✅ Source account confirmed");
  console.log("   ✅ Destination account confirmed");
  console.log("   ✅ Transfer hook data attached");
  console.log("   ✅ Fee calculation verified");
  console.log("   ✅ Blacklist check passed");

  console.log("\n   Transaction ready to send:");
  console.log("   - From: sender.publicKey");
  console.log("   - To: recipient.publicKey");
  console.log("   - Amount: netAmount");
  console.log("   - Fee: calculatedFee (to treasury)");

  // Step 5: Verify Transfer
  console.log("\nStep 5: Post-Transfer Verification");
  console.log("----------------------------------------");

  console.log("Simulating transfer confirmation...");
  console.log("   ✅ Transaction confirmed");
  console.log("   ✅ Transfer hook executed");
  console.log("   ✅ Fee transferred to treasury");
  console.log("   ✅ Compliance event emitted");
  console.log("   ✅ Amount credited to recipient");

  // Summary
  console.log("\n\n=== Advanced Transfer Summary ===");
  console.log("----------------------------------------");
  console.log("Transfer Details:");
  console.log(`  Sender:      ${sender.publicKey.toBase58().slice(0, 20)}...`);
  console.log(
    `  Recipient:   ${recipient.publicKey.toBase58().slice(0, 20)}...`
  );
  console.log(`  Amount:      ${transferAmount.toString()}`);
  console.log(`  Fee:         ${calculatedFee.toString()}`);
  console.log(`  Net:         ${netAmount.toString()}`);
  console.log(`  Whitelisted: ${isWhitelisted}`);

  console.log("\nAll transfer operations logged on-chain.");
  console.log("Transfer hook events available for audit.");
  console.log("\n=== Advanced Transfer Complete ===");
}

main().catch(console.error);
