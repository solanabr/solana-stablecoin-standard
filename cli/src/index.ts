#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import fs from 'fs';
import os from 'os';
import { run as runInteractive } from './interactive.js';
import { AnchorStablecoinClient } from '../../sdk/dist/anchor-client.js';

const program = new Command();

// Global state
let connection: Connection;
let wallet: Keypair;
let client: AnchorStablecoinClient;

program
  .name('sss')
  .description(chalk.hex('#14F195')('Solana Stablecoin Standard CLI') + chalk.gray(' - Make real on-chain transactions'))
  .version('1.0.0')
  .option('-c, --cluster <cluster>', 'Solana cluster (devnet, testnet, mainnet-beta)', 'devnet')
  .option('-k, --keypair <path>', 'Path to keypair file', '~/.config/solana/id.json')
  .action(async () => {
    // Default action when no command is specified
    await runInteractive();
  })
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();

    // Check if running interactive mode by looking at process arguments
    const args = process.argv;
    if (args.includes('interactive') || args.includes('ui')) {
      return;
    }

    // Initialize connection
    const rpcUrl = opts.cluster === 'devnet'
      ? 'https://api.devnet.solana.com'
      : opts.cluster === 'testnet'
      ? 'https://api.testnet.solana.com'
      : opts.cluster === 'mainnet-beta'
      ? 'https://api.mainnet-beta.solana.com'
      : 'http://localhost:8899';

    connection = new Connection(rpcUrl, 'confirmed');

    // Load wallet
    try {
      const keypairPath = opts.keypair.replace('~', os.homedir());

      if (!fs.existsSync(keypairPath)) {
        console.error(chalk.hex('#FF6B6B')(`✗ Keypair file not found at ${keypairPath}`));
        console.error(chalk.hex('#FFD700')('💡 Generate one with: solana-keygen new'));
        process.exit(1);
      }

      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));

      // Initialize Anchor client
      const anchorWallet = new Wallet(wallet);
      client = new AnchorStablecoinClient(connection, anchorWallet);

      console.log(chalk.hex('#9945FF')(`Network: ${opts.cluster}`));
      console.log(chalk.hex('#4ECDC4')(`Wallet:  ${wallet.publicKey.toBase58()}\n`));
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`✗ Error loading wallet: ${error.message}`));
      process.exit(1);
    }
  });

// ========== INTERACTIVE MODE ==========

program
  .command('interactive')
  .alias('ui')
  .description(chalk.hex('#14F195')('Launch interactive UI mode') + chalk.gray(' (recommended for beginners)'))
  .action(async () => {
    await runInteractive();
  });

// ========== INIT COMMAND ==========

program
  .command('init')
  .description('Initialize a new stablecoin')
  .requiredOption('-n, --name <name>', 'Token name')
  .requiredOption('-s, --symbol <symbol>', 'Token symbol')
  .option('-d, --decimals <decimals>', 'Token decimals', '6')
  .action(async (options) => {
    try {
      console.log(chalk.hex('#14F195')('🚀 Creating stablecoin on-chain...\n'));

      const result = await client.initialize({
        name: options.name,
        symbol: options.symbol,
        decimals: parseInt(options.decimals),
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Stablecoin created successfully!\n'));
      console.log(chalk.hex('#FFD700').bold('Details:'));
      console.log(`  ${chalk.hex('#9945FF')('Mint:')}        ${chalk.hex('#4ECDC4')(result.mint.toBase58())}`);
      console.log(`  ${chalk.hex('#9945FF')('Name:')}        ${chalk.hex('#14F195')(options.name)}`);
      console.log(`  ${chalk.hex('#9945FF')('Symbol:')}      ${chalk.hex('#14F195')(options.symbol)}`);
      console.log(`  ${chalk.hex('#9945FF')('Decimals:')}    ${chalk.hex('#14F195')(options.decimals)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(result.signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${result.signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);

      // Save config
      const configFile = {
        mint: result.mint.toBase58(),
        name: options.name,
        symbol: options.symbol,
        decimals: parseInt(options.decimals),
        cluster: cluster,
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync('.sss-config.json', JSON.stringify(configFile, null, 2));
      console.log(chalk.gray('\n💾 Config saved to .sss-config.json'));
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      if (error.logs) {
        console.error(chalk.gray('\n📋 Program logs:'));
        error.logs.forEach((log: string) => console.error(chalk.gray(`  ${log}`)));
      }
      process.exit(1);
    }
  });

// ========== MINT COMMAND ==========

program
  .command('mint <amount>')
  .description('Mint tokens')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (amount, options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.blue(`💰 Minting ${amount} tokens...\n`));

      const signature = await client.mint({
        mint: mintAddress,
        amount: parseInt(amount),
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Tokens minted successfully!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Amount:')}      ${chalk.hex('#14F195')(amount)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.red(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== BURN COMMAND ==========

program
  .command('burn <amount>')
  .description('Burn tokens')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (amount, options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#FF6B6B')(`🔥 Burning ${amount} tokens...\n`));

      const signature = await client.burn({
        mint: mintAddress,
        amount: parseInt(amount),
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Tokens burned successfully!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Amount:')}      ${chalk.hex('#FF6B6B')(amount)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== PAUSE COMMAND ==========

program
  .command('pause')
  .description('Pause all operations')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#FF6B6B')('⛔ Pausing operations...\n'));

      const signature = await client.pause({
        mint: mintAddress,
        authority: wallet,
      });

      console.log(chalk.hex('#FF6B6B').bold('✓ Operations paused!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== UNPAUSE COMMAND ==========

program
  .command('unpause')
  .description('Resume operations')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#14F195')('▶️  Resuming operations...\n'));

      const signature = await client.unpause({
        mint: mintAddress,
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Operations resumed!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== FREEZE COMMAND ==========

program
  .command('freeze <address>')
  .description('Freeze an account')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (address, options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#4ECDC4')('❄️  Freezing account...\n'));

      const signature = await client.freezeAccount({
        mint: mintAddress,
        target: new PublicKey(address),
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Account frozen!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Address:')}     ${chalk.hex('#4ECDC4')(address)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== THAW COMMAND ==========

program
  .command('thaw <address>')
  .description('Thaw a frozen account')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (address, options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#95E1D3')('🔓 Thawing account...\n'));

      const signature = await client.thawAccount({
        mint: mintAddress,
        target: new PublicKey(address),
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Account thawed!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Address:')}     ${chalk.hex('#4ECDC4')(address)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== BLACKLIST COMMANDS ==========

const blacklist = program.command('blacklist').description('Manage blacklist (SSS-2)');

blacklist
  .command('add <address>')
  .description('Add address to blacklist')
  .option('-r, --reason <reason>', 'Reason for blacklisting', 'Compliance violation')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (address, options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#9945FF')('🚫 Adding to blacklist...\n'));

      const signature = await client.addToBlacklist({
        mint: mintAddress,
        address: new PublicKey(address),
        reason: options.reason,
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Address blacklisted!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Address:')}     ${chalk.hex('#FF6B6B')(address)}`);
      console.log(`  ${chalk.hex('#9945FF')('Reason:')}      ${chalk.hex('#FFD700')(options.reason)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

blacklist
  .command('remove <address>')
  .description('Remove address from blacklist')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (address, options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#95E1D3')('🔓 Removing from blacklist...\n'));

      const signature = await client.removeFromBlacklist({
        mint: mintAddress,
        address: new PublicKey(address),
        authority: wallet,
      });

      console.log(chalk.hex('#14F195').bold('✓ Address removed from blacklist!\n'));
      console.log(`  ${chalk.hex('#9945FF')('Address:')}     ${chalk.hex('#4ECDC4')(address)}`);
      console.log(`  ${chalk.hex('#9945FF')('Transaction:')} ${chalk.gray(signature)}`);

      const cluster = program.opts().cluster;
      const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== STATUS COMMAND ==========

program
  .command('status')
  .description('Show stablecoin status')
  .option('-m, --mint <address>', 'Mint address (or use saved config)')
  .action(async (options) => {
    try {
      const mintAddress = options.mint ? new PublicKey(options.mint) : loadConfigMint();

      console.log(chalk.hex('#4ECDC4')('📊 Fetching on-chain status...\n'));

      const state = await client.getState(mintAddress);

      console.log(chalk.hex('#FFD700').bold('Stablecoin Status:'));
      console.log(chalk.hex('#9945FF')('─'.repeat(60)));
      console.log(`  ${chalk.hex('#9945FF')('Mint:')}        ${chalk.hex('#4ECDC4')(mintAddress.toBase58())}`);
      console.log(`  ${chalk.hex('#9945FF')('State PDA:')}   ${chalk.hex('#4ECDC4')(state.address)}`);
      console.log(`  ${chalk.hex('#9945FF')('Network:')}     ${chalk.hex('#14F195')(program.opts().cluster)}`);
      console.log(chalk.hex('#9945FF')('─'.repeat(60)));

      const explorerUrl = `https://explorer.solana.com/address/${mintAddress.toBase58()}?cluster=${program.opts().cluster}`;
      console.log(`\n${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}`);
      console.log(`  ${chalk.blue.underline(explorerUrl)}`);
    } catch (error: any) {
      console.error(chalk.hex('#FF6B6B')(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to load config
function loadConfigMint(): PublicKey {
  try {
    const configData = fs.readFileSync('.sss-config.json', 'utf-8');
    const config = JSON.parse(configData);
    return new PublicKey(config.mint);
  } catch (error) {
    console.error(chalk.hex('#FF6B6B')('✗ No stablecoin config found.'));
    console.error(chalk.hex('#FFD700')('💡 Run "sss init" first or use --mint <address>'));
    process.exit(1);
  }
}

program.parse();
