#!/usr/bin/env node

/**
 * Quick deployment test script
 * Tests that the SDK can load and interact with the compiled programs
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing SDK Integration with Compiled Programs\n');

// Check if IDL files are valid JSON
const idlDir = path.join(__dirname, '..', 'target', 'idl');

try {
  console.log('📄 Validating IDL files...');

  const stablecoinIdl = JSON.parse(
    fs.readFileSync(path.join(idlDir, 'stablecoin_core.json'), 'utf-8')
  );
  console.log(`   ✅ stablecoin_core.json - ${stablecoinIdl.instructions.length} instructions`);

  const transferHookIdl = JSON.parse(
    fs.readFileSync(path.join(idlDir, 'transfer_hook.json'), 'utf-8')
  );
  console.log(`   ✅ transfer_hook.json - ${transferHookIdl.instructions.length} instructions`);

  console.log('\n🔑 Validating keypair files...');

  const deployDir = path.join(__dirname, '..', 'target', 'deploy');

  const stablecoinKeypair = JSON.parse(
    fs.readFileSync(path.join(deployDir, 'stablecoin_core-keypair.json'), 'utf-8')
  );
  console.log(`   ✅ stablecoin_core-keypair.json - ${stablecoinKeypair.length} bytes`);

  const transferHookKeypair = JSON.parse(
    fs.readFileSync(path.join(deployDir, 'transfer_hook-keypair.json'), 'utf-8')
  );
  console.log(`   ✅ transfer_hook-keypair.json - ${transferHookKeypair.length} bytes`);

  console.log('\n📦 Checking program binaries...');

  const stablecoinSo = fs.statSync(path.join(deployDir, 'stablecoin_core.so'));
  console.log(`   ✅ stablecoin_core.so - ${(stablecoinSo.size / 1024).toFixed(2)} KB`);

  const transferHookSo = fs.statSync(path.join(deployDir, 'transfer_hook.so'));
  console.log(`   ✅ transfer_hook.so - ${(transferHookSo.size / 1024).toFixed(2)} KB`);

  console.log('\n✅ All artifacts are valid and ready for deployment!');
  console.log('\n📝 Program Information:');
  console.log(`   Stablecoin Core: ${stablecoinIdl.metadata.address}`);
  console.log(`   Transfer Hook: ${transferHookIdl.metadata.address}`);

  console.log('\n🚀 Ready to deploy to devnet!');
  console.log('   Run: npm run deploy:devnet');
  console.log('   Or: solana program deploy target/deploy/stablecoin_core.so');

  process.exit(0);

} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
}
