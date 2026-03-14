#!/usr/bin/env node
/**
 * Devnet deployment wrapper for Anchor programs.
 *
 * This delegates deployment to `anchor deploy`, which correctly uses the
 * upgradeable loader and the program keypairs in `target/deploy`.
 */

import { spawnSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const PROGRAM_DIR = '/workspaces/SSS/target/deploy';

async function main() {
  const stablecoinPath = path.join(PROGRAM_DIR, 'sss_stablecoin.so');
  const hookPath = path.join(PROGRAM_DIR, 'sss_transfer_hook.so');

  if (!fs.existsSync(stablecoinPath)) {
    console.error(`❌ Program binary not found: ${stablecoinPath}`);
    console.log('   Please run: anchor build');
    process.exit(1);
  }
  
  if (!fs.existsSync(hookPath)) {
    console.error(`❌ Program binary not found: ${hookPath}`);
    console.log('   Please run: anchor build');
    process.exit(1);
  }

  const result = spawnSync(
    'anchor',
    ['deploy', '--provider.cluster', 'devnet', '--provider.url', DEVNET_RPC],
    {
      cwd: '/workspaces/SSS',
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main().catch(console.error);
