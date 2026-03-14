#!/usr/bin/env node
/**
 * Deploy SSS programs to Devnet using Solana web3.js
 */

const {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const DEVNET_RPC = 'https://api.devnet.solana.com';
const KEYPAIR_PATH = '/workspaces/SSS/deploy-keypair.json';

async function deployProgram(connection, payer, programBinary, programName) {
  console.log(`\n📦 Deploying ${programName}...`);
  console.log(`   Size: ${programBinary.length} bytes`);
  
  // Generate program keypair
  const programKeypair = Keypair.generate();
  console.log(`   Program ID: ${programKeypair.publicKey.toBase58()}`);
  
  // Calculate rent
  const lamports = await connection.getMinimumBalanceForRentExemption(programBinary.length);
  console.log(`   Rent: ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  
  // Create account transaction
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: programKeypair.publicKey,
      lamports,
      space: programBinary.length,
      programId: SystemProgram.programId,
    })
  );
  
  // Send transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer, programKeypair],
    { commitment: 'confirmed' }
  );
  
  console.log(`   ✓ Transaction: ${signature}`);
  console.log(`   ✓ Program ID: ${programKeypair.publicKey.toBase58()}`);
  
  return {
    programId: programKeypair.publicKey.toBase58(),
    signature,
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('SSS STABLECOIN - DEVNET DEPLOYMENT');
  console.log('='.repeat(70));
  
  // Load keypair
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`\n🔑 Deployer: ${payer.publicKey.toBase58()}`);
  
  // Connect to devnet
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  
  if (balance < 5 * LAMPORTS_PER_SOL) {
    console.error('❌ Insufficient balance. Need at least 5 SOL.');
    process.exit(1);
  }
  
  // Since we can't easily build the BPF programs in this environment,
  // we'll deploy placeholder programs or use a different approach
  console.log('\n⚠️  Note: Building BPF programs requires additional tooling.');
  console.log('   This script demonstrates the deployment process.');
  console.log('   For actual deployment, use: anchor deploy');
  
  // Generate and save program IDs for documentation
  const stablecoinKeypair = Keypair.generate();
  const hookKeypair = Keypair.generate();
  
  console.log('\n📋 Generated Program IDs (for documentation):');
  console.log(`   sss-stablecoin:    ${stablecoinKeypair.publicKey.toBase58()}`);
  console.log(`   sss-transfer-hook: ${hookKeypair.publicKey.toBase58()}`);
  
  // Save deployment info
  const deploymentInfo = {
    network: 'devnet',
    timestamp: new Date().toISOString(),
    deployer: payer.publicKey.toBase58(),
    balance: balance / LAMPORTS_PER_SOL,
    programs: {
      sssStablecoin: {
        programId: stablecoinKeypair.publicKey.toBase58(),
        status: 'PENDING_DEPLOYMENT',
        note: 'Run "anchor deploy" with proper tooling',
      },
      sssTransferHook: {
        programId: hookKeypair.publicKey.toBase58(),
        status: 'PENDING_DEPLOYMENT',
        note: 'Run "anchor deploy" with proper tooling',
      },
    },
    instructions: [
      '1. Install Anchor CLI: cargo install --git https://github.com/coral-xyz/anchor avm',
      '2. Install version: cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force',
      '3. Build: anchor build',
      '4. Deploy: anchor deploy --provider.cluster devnet',
    ],
  };
  
  fs.writeFileSync(
    '/workspaces/SSS/.deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log('\n' + '='.repeat(70));
  console.log('⚠️  DEPLOYMENT PENDING - TOOLING REQUIRED');
  console.log('='.repeat(70));
  console.log('\nTo complete deployment, run the following on a machine with Anchor CLI:');
  console.log('\n   anchor build');
  console.log('   anchor deploy --provider.cluster devnet');
  console.log('\n💾 Deployment info saved to: .deployment-info.json');
  console.log('='.repeat(70));
}

main().catch(console.error);
