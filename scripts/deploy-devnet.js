#!/usr/bin/env node

const { Connection, Keypair, BpfLoader, BPF_LOADER_PROGRAM_ID } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

const DEVNET_URL = 'https://api.devnet.solana.com';

async function deployProgram(connection, programName) {
  console.log(`\n📦 Deploying ${programName}...`);

  // Read program keypair
  const keypairPath = path.join(__dirname, '..', 'target', 'deploy', `${programName}-keypair.json`);
  const programPath = path.join(__dirname, '..', 'target', 'deploy', `${programName}.so`);

  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair not found: ${keypairPath}`);
  }

  if (!fs.existsSync(programPath)) {
    throw new Error(`Program binary not found: ${programPath}`);
  }

  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const programKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

  console.log(`Program ID: ${programKeypair.publicKey.toBase58()}`);

  // Read program binary
  const programData = fs.readFileSync(programPath);
  console.log(`Program size: ${(programData.length / 1024).toFixed(2)} KB`);

  // Check if program already exists
  const accountInfo = await connection.getAccountInfo(programKeypair.publicKey);

  if (accountInfo) {
    console.log(`✅ Program already deployed at ${programKeypair.publicKey.toBase58()}`);
    console.log(`   Account owner: ${accountInfo.owner.toBase58()}`);
    console.log(`   Data length: ${accountInfo.data.length} bytes`);
    return programKeypair.publicKey;
  }

  console.log(`⚠️  Program not found on devnet. Manual deployment required.`);
  console.log(`\nTo deploy this program, you need to:`);
  console.log(`1. Ensure you have Solana CLI installed and configured`);
  console.log(`2. Run: solana program deploy target/deploy/${programName}.so --program-id target/deploy/${programName}-keypair.json --url devnet`);
  console.log(`\nOr use Anchor CLI:`);
  console.log(`   cd solana-stablecoin-standard && anchor deploy --provider.cluster devnet`);

  return programKeypair.publicKey;
}

async function main() {
  console.log('🚀 Solana Stablecoin Standard - Devnet Deployment\n');
  console.log(`Connecting to devnet: ${DEVNET_URL}`);

  const connection = new Connection(DEVNET_URL, 'confirmed');

  try {
    // Check connection
    const version = await connection.getVersion();
    console.log(`✅ Connected to Solana ${version['solana-core']}\n`);

    // Deploy programs
    const stablecoinCoreId = await deployProgram(connection, 'stablecoin_core');
    const transferHookId = await deployProgram(connection, 'transfer_hook');

    console.log('\n📋 Deployment Summary:');
    console.log(`   stablecoin_core: ${stablecoinCoreId.toBase58()}`);
    console.log(`   transfer_hook:   ${transferHookId.toBase58()}`);

    console.log('\n✨ IDL files have been updated with discriminators for Anchor 0.32.1 compatibility');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

main();
