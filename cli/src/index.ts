#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import toml from 'toml';
import os from 'os';

// Import from local SDK (built version)
import { SolanaStablecoin, Presets } from '../../sdk/dist/index.js';

const program = new Command();

// Global options
let connection: Connection;
let wallet: Keypair;

program
  .name('sss-token')
  .description('CLI tool for Solana Stablecoin Standard')
  .version('1.0.0')
  .option('-c, --cluster <cluster>', 'Solana cluster', 'devnet')
  .option('-k, --keypair <path>', 'Path to keypair file', '~/.config/solana/id.json')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    
    // Initialize connection
    const cluster = opts.cluster === 'mainnet' ? 'mainnet-beta' : opts.cluster;
    connection = new Connection(
      opts.cluster === 'localhost' 
        ? 'http://localhost:8899'
        : clusterApiUrl(cluster as any)
    );
    
    // Load wallet
    try {
      const keypairPath = opts.keypair.replace('~', os.homedir());
      
      if (!fs.existsSync(keypairPath)) {
        console.error(chalk.red(`Error: Keypair file not found at ${keypairPath}`));
        console.error(chalk.yellow('Generate one with: solana-keygen new'));
        process.exit(1);
      }
      
      const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
      
      console.log(chalk.gray(`Cluster: ${opts.cluster}`));
      console.log(chalk.gray(`Wallet: ${wallet.publicKey.toBase58()}\n`));
    } catch (error: any) {
      console.error(chalk.red(`Error loading wallet: ${error.message}`));
      process.exit(1);
    }
  });

// ========== INIT COMMAND ==========

program
  .command('init')
  .description('Initialize a new stablecoin')
  .option('--preset <preset>', 'Preset (sss-1, sss-2, sss-3)')
  .option('--custom <path>', 'Path to custom config file (TOML/JSON)')
  .option('--name <name>', 'Token name')
  .option('--symbol <symbol>', 'Token symbol')
  .option('--decimals <decimals>', 'Token decimals', '6')
  .option('--uri <uri>', 'Metadata URI', '')
  .action(async (options) => {
    try {
      let config: any = {};
      
      if (options.custom) {
        // Load custom config
        const configPath = path.resolve(options.custom);
        const configData = fs.readFileSync(configPath, 'utf-8');
        
        if (configPath.endsWith('.toml')) {
          config = toml.parse(configData);
        } else {
          config = JSON.parse(configData);
        }
      } else if (options.preset) {
        // Use preset
        config = {
          preset: options.preset,
          name: options.name,
          symbol: options.symbol,
          decimals: parseInt(options.decimals),
          uri: options.uri,
        };
      } else {
        console.error(chalk.red('Error: Must specify --preset or --custom'));
        process.exit(1);
      }
      
      console.log(chalk.blue('Creating stablecoin...'));
      
      const stablecoin = await SolanaStablecoin.create(connection, {
        ...config,
        authority: wallet,
      });
      
      console.log(chalk.green('✓ Stablecoin created successfully!'));
      console.log(chalk.gray(`Mint: ${stablecoin.mintAddress.toBase58()}`));
      
      // Save config
      const configFile = {
        mint: stablecoin.mintAddress.toBase58(),
        name: config.name,
        symbol: config.symbol,
        decimals: config.decimals,
        preset: config.preset || 'custom',
        cluster: program.opts().cluster,
      };
      
      fs.writeFileSync(
        '.sss-token.json',
        JSON.stringify(configFile, null, 2)
      );
      
      console.log(chalk.gray('Config saved to .sss-token.json'));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== MINT COMMAND ==========

program
  .command('mint <recipient> <amount>')
  .description('Mint tokens to a recipient')
  .action(async (recipient, amount) => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue(`Minting ${amount} tokens...`));
      
      const signature = await stablecoin.mint({
        recipient: new PublicKey(recipient),
        amount: new BN(amount),
        minter: wallet,
      });
      
      console.log(chalk.green('✓ Tokens minted successfully!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== BURN COMMAND ==========

program
  .command('burn <amount>')
  .description('Burn tokens')
  .option('--account <address>', 'Token account to burn from')
  .action(async (amount, options) => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue(`Burning ${amount} tokens...`));
      
      const signature = await stablecoin.burn({
        amount: new BN(amount),
        burner: wallet,
        tokenAccount: new PublicKey(options.account),
      });
      
      console.log(chalk.green('✓ Tokens burned successfully!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== FREEZE COMMAND ==========

program
  .command('freeze <address>')
  .description('Freeze an account')
  .action(async (address) => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue(`Freezing account...`));
      
      const signature = await stablecoin.freezeAccount({
        tokenAccount: new PublicKey(address),
        authority: wallet,
      });
      
      console.log(chalk.green('✓ Account frozen successfully!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== THAW COMMAND ==========

program
  .command('thaw <address>')
  .description('Thaw a frozen account')
  .action(async (address) => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue(`Thawing account...`));
      
      const signature = await stablecoin.thawAccount({
        tokenAccount: new PublicKey(address),
        authority: wallet,
      });
      
      console.log(chalk.green('✓ Account thawed successfully!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== PAUSE COMMAND ==========

program
  .command('pause')
  .description('Pause all operations')
  .action(async () => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue('Pausing operations...'));
      
      const signature = await stablecoin.pause(wallet);
      
      console.log(chalk.green('✓ Operations paused!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== UNPAUSE COMMAND ==========

program
  .command('unpause')
  .description('Resume operations')
  .action(async () => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue('Resuming operations...'));
      
      const signature = await stablecoin.unpause(wallet);
      
      console.log(chalk.green('✓ Operations resumed!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== STATUS COMMAND ==========

program
  .command('status')
  .description('Show stablecoin status')
  .action(async () => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      const info = await stablecoin.getInfo();
      
      console.log(chalk.bold('\nStablecoin Status:'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Name:              ${info.name}`);
      console.log(`Symbol:            ${info.symbol}`);
      console.log(`Mint:              ${info.mint.toBase58()}`);
      console.log(`Decimals:          ${info.decimals}`);
      console.log(`Total Supply:      ${info.totalSupply.toString()}`);
      console.log(`Total Minted:      ${info.totalMinted.toString()}`);
      console.log(`Total Burned:      ${info.totalBurned.toString()}`);
      console.log(`Paused:            ${info.isPaused ? 'Yes' : 'No'}`);
      console.log(`Compliance:        ${info.complianceEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`Authority:         ${info.authority.toBase58()}`);
      console.log(chalk.gray('─'.repeat(50)));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== SUPPLY COMMAND ==========

program
  .command('supply')
  .description('Show total supply')
  .action(async () => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      const supply = await stablecoin.getTotalSupply();
      
      console.log(chalk.bold(`Total Supply: ${supply.toString()}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== BLACKLIST COMMANDS ==========

const blacklist = program.command('blacklist').description('Manage blacklist (SSS-2)');

blacklist
  .command('add <address>')
  .description('Add address to blacklist')
  .option('--reason <reason>', 'Reason for blacklisting', 'Compliance violation')
  .action(async (address, options) => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue('Adding to blacklist...'));
      
      const signature = await stablecoin.compliance.blacklistAdd(
        new PublicKey(address),
        options.reason,
        wallet
      );
      
      console.log(chalk.green('✓ Address blacklisted!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

blacklist
  .command('remove <address>')
  .description('Remove address from blacklist')
  .action(async (address) => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      console.log(chalk.blue('Removing from blacklist...'));
      
      const signature = await stablecoin.compliance.blacklistRemove(
        new PublicKey(address),
        wallet
      );
      
      console.log(chalk.green('✓ Address removed from blacklist!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

blacklist
  .command('list')
  .description('List all blacklisted addresses')
  .action(async () => {
    try {
      const config = loadConfig();
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      const blacklisted = await stablecoin.compliance.listBlacklisted();
      
      console.log(chalk.bold(`\nBlacklisted Addresses (${blacklisted.length}):`));
      console.log(chalk.gray('─'.repeat(50)));
      
      for (const address of blacklisted) {
        console.log(address.toBase58());
      }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// ========== SEIZE COMMAND ==========

program
  .command('seize <address>')
  .description('Seize tokens from frozen account (SSS-2)')
  .option('--to <address>', 'Destination address (treasury)')
  .option('--amount <amount>', 'Amount to seize (optional, defaults to full balance)')
  .action(async (address, options) => {
    try {
      const config = loadConfig();
      
      if (!options.to) {
        console.error(chalk.red('Error: --to address is required'));
        process.exit(1);
      }
      
      // Note: This would use the actual SDK in production
      console.log(chalk.yellow('Note: SDK integration pending'));
      console.log(chalk.blue(`Would seize tokens from ${address} to ${options.to}`));
      
      /* Production code:
      const stablecoin = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint)
      );
      
      const amount = options.amount 
        ? new BN(options.amount)
        : await stablecoin.getBalance(new PublicKey(address));
      
      console.log(chalk.blue(`Seizing ${amount.toString()} tokens...`));
      
      const signature = await stablecoin.compliance.seize({
        fromAccount: new PublicKey(address),
        toAccount: new PublicKey(options.to),
        amount,
        seizer: wallet,
      });
      
      console.log(chalk.green('✓ Tokens seized!'));
      console.log(chalk.gray(`Transaction: ${signature}`));
      */
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to load config
function loadConfig(): any {
  try {
    const configData = fs.readFileSync('.sss-token.json', 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(chalk.red('Error: No stablecoin config found. Run "sss-token init" first.'));
    process.exit(1);
  }
}

program.parse();
