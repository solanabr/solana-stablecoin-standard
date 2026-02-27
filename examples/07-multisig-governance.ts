/**
 * Example 07: Multisig Governance
 *
 * Demonstrates multisig proposal flow
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { MultisigModule } from "../sdk/src";

async function main() {
  console.log("=== Example 07: Multisig Governance ===\n");

  // Setup
  const connection = new Connection("https://api.devnet.solana.com");
  const multisig = new MultisigModule(connection);

  // Generate mock keypairs
  const authority = Keypair.generate();
  const signer1 = Keypair.generate();
  const signer2 = Keypair.generate();
  const signer3 = Keypair.generate();

  const stablecoin = new PublicKey(
    "Stable1111111111111111111111111111111111111"
  );

  console.log("Step 1: Initialize Multisig Config");
  console.log("----------------------------------------");

  const threshold = 2; // Need 2 of 3 signatures
  const signers = [signer1.publicKey, signer2.publicKey, signer3.publicKey];

  console.log(`Authority: ${authority.publicKey.toBase58().slice(0, 20)}...`);
  console.log(`Signers: ${signers.length}`);
  console.log(`Threshold: ${threshold} of ${signers.length}`);

  const initResult = await multisig.initializeMultisig(
    authority,
    stablecoin,
    threshold,
    signers
  );

  if (initResult.success) {
    console.log("✅ Multisig config initialized");
    console.log(`  Config: ${initResult.data?.multisigConfig}`);
  }

  console.log("\nStep 2: Create Proposal");
  console.log("----------------------------------------");

  const instructionData = Buffer.from("mock-instruction-data");
  const expiresIn = 86400; // 24 hours

  const proposalResult = await multisig.createProposal(
    signer1,
    stablecoin,
    instructionData,
    expiresIn
  );

  if (proposalResult.success) {
    console.log("✅ Proposal created");
    console.log(`  Proposal: ${proposalResult.data?.proposal}`);
    console.log(`  Expires in: ${proposalResult.data?.expiresIn}s`);
  }

  console.log("\nStep 3: Approve Proposal (Signer 1)");
  console.log("----------------------------------------");

  const proposal = new PublicKey(proposalResult.data?.proposal);
  const approve1 = await multisig.approveProposal(
    signer1,
    stablecoin,
    proposal
  );

  if (approve1.success) {
    console.log("✅ Signer 1 approved");
  }

  console.log("\nStep 4: Approve Proposal (Signer 2)");
  console.log("----------------------------------------");

  const approve2 = await multisig.approveProposal(
    signer2,
    stablecoin,
    proposal
  );

  if (approve2.success) {
    console.log("✅ Signer 2 approved");
    console.log("  Threshold met! (2 of 2)");
  }

  console.log("\nStep 5: Check Proposal Status");
  console.log("----------------------------------------");

  const status = await multisig.getProposalStatus(proposal);

  if (status.success) {
    console.log(
      `Approvals: ${status.data?.approvals} of ${status.data?.threshold}`
    );
    console.log(`Executed: ${status.data?.executed}`);
    console.log(`Expired: ${status.data?.expired}`);
  }

  console.log("\nStep 6: Execute Proposal");
  console.log("----------------------------------------");

  const execute = await multisig.executeProposal(signer1, stablecoin, proposal);

  if (execute.success) {
    console.log("✅ Proposal executed!");
    console.log(`  Executor: ${execute.data?.executor}`);
  }

  console.log("\n=== Multisig Governance Complete ===");
}

main().catch(console.error);
