#!/usr/bin/env node

/**
 * Deployment Verification Script
 * Verifies that all necessary build artifacts exist for deployment
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'target');
const DEPLOY_DIR = path.join(TARGET_DIR, 'deploy');
const IDL_DIR = path.join(TARGET_DIR, 'idl');

const REQUIRED_FILES = [
  // Compiled programs
  { path: path.join(DEPLOY_DIR, 'stablecoin_core.so'), type: 'Program Binary' },
  { path: path.join(DEPLOY_DIR, 'transfer_hook.so'), type: 'Program Binary' },

  // Keypairs
  { path: path.join(DEPLOY_DIR, 'stablecoin_core-keypair.json'), type: 'Program Keypair' },
  { path: path.join(DEPLOY_DIR, 'transfer_hook-keypair.json'), type: 'Program Keypair' },

  // IDL files
  { path: path.join(IDL_DIR, 'stablecoin_core.json'), type: 'IDL' },
  { path: path.join(IDL_DIR, 'transfer_hook.json'), type: 'IDL' },
];

console.log('🔍 Verifying Deployment Artifacts...\n');

let allPresent = true;
let totalSize = 0;

REQUIRED_FILES.forEach(({ path: filePath, type }) => {
  const exists = fs.existsSync(filePath);
  const status = exists ? '✅' : '❌';

  if (exists) {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    totalSize += stats.size;
    console.log(`${status} ${type}: ${path.basename(filePath)} (${sizeKB} KB)`);
  } else {
    console.log(`${status} ${type}: ${path.basename(filePath)} - MISSING`);
    allPresent = false;
  }
});

console.log(`\n📊 Total artifact size: ${(totalSize / 1024).toFixed(2)} KB`);

if (allPresent) {
  console.log('\n✅ All deployment artifacts present!');
  console.log('\n📝 Next steps:');
  console.log('   1. Ensure Solana CLI is installed and configured');
  console.log('   2. Set your cluster: solana config set --url devnet');
  console.log('   3. Airdrop SOL: solana airdrop 2');
  console.log('   4. Deploy: solana program deploy target/deploy/stablecoin_core.so');
  console.log('   5. Deploy: solana program deploy target/deploy/transfer_hook.so');
  console.log('\n💡 Or use the CLI: npm run deploy:devnet');
  process.exit(0);
} else {
  console.log('\n❌ Some artifacts are missing. Run: anchor build');
  process.exit(1);
}
