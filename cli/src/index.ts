#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env at the very entrypoint
dotenv.config({ path: resolve(process.cwd(), '.env') });

const program = new Command();

program
  .name('sss')
  .description('Solana Stablecoin Standards (SSS) Operator CLI')
  .version('1.0.0');

// Register Global Options defined in PRD Section 10.1
program
  .option(
    '-n, --network <cluster>',
    'Solana cluster to connect to (devnet, testnet, mainnet-beta, localnet)',
    process.env.SOLANA_NETWORK || 'devnet'
  )
  .option(
    '-k, --keypair <path>',
    'Path to the operator keypair file',
    process.env.OPERATOR_KEYPAIR_PATH
  )
  .option('-m, --mint <pubkey>', 'Global mint address to apply commands against')
  .option('--json', 'Output results in raw JSON format')
  .option('--verbose', 'Enable verbose logging output');

program.parse(process.argv);
