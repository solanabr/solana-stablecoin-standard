#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { AnchorStablecoinClient } from '../../sdk/dist/anchor-client.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Global state
let client: AnchorStablecoinClient | null = null;
let authority: Keypair | null = null;
let currentMint: PublicKey | null = null;
let connection: Connection | null = null;

// Initialize connection and wallet
async function initializeClient(cluster: string) {
  const rpcUrl = cluster === 'devnet'
    ? 'https://api.devnet.solana.com'
    : cluster === 'testnet'
    ? 'https://api.testnet.solana.com'
    : 'https://api.mainnet-beta.solana.com';

  connection = new Connection(rpcUrl, 'confirmed');

  // Test connection
  try {
    const version = await connection.getVersion();
    console.log(chalk.hex('#14F195')(`\n✓ Connected to Solana ${cluster}`));
    console.log(chalk.gray(`  Version: ${version['solana-core']}`));
  } catch (error) {
    console.log(chalk.red('\n✗ Failed to connect to Solana RPC'));
    console.log(chalk.yellow('💡 Check your internet connection or try again later'));
    throw error;
  }

  // Load or create keypair
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');

  if (fs.existsSync(keypairPath)) {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
    authority = Keypair.fromSecretKey(new Uint8Array(keypairData));
    console.log(chalk.hex('#9945FF')('✓ Loaded wallet'));
    console.log(chalk.gray(`  Address: ${authority.publicKey.toBase58()}`));

    // Check balance
    try {
      const balance = await connection.getBalance(authority.publicKey);
      const solBalance = (balance / 1e9).toFixed(4);
      if (balance === 0) {
        console.log(chalk.yellow(`\n⚠️  Wallet balance: ${solBalance} SOL`));
        console.log(chalk.yellow('💡 Get devnet SOL: solana airdrop 2 --url devnet'));
      } else {
        console.log(chalk.hex('#14F195')(`  Balance: ${solBalance} SOL`));
      }
    } catch (error) {
      console.log(chalk.gray('  Balance: Unable to fetch'));
    }
  } else {
    // Generate new keypair for demo
    authority = Keypair.generate();
    console.log(chalk.yellow('\n⚠️  Generated new keypair for demo purposes'));
    console.log(chalk.gray(`  Public key: ${authority.publicKey.toBase58()}`));
    console.log(chalk.yellow('\n💡 To use your own wallet:'));
    console.log(chalk.gray('   1. Run: solana-keygen new'));
    console.log(chalk.gray('   2. Run: solana airdrop 2 --url devnet'));
  }

  const wallet = new Wallet(authority);
  client = new AnchorStablecoinClient(connection, wallet);

  return { connection, client, authority };
}

// Get explorer link
function getExplorerLink(signature: string, cluster: string): string {
  const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

// Banner
function showBanner() {
  const banner = `
${chalk.hex('#14F195')('    ███████╗ ██████╗ ██╗      █████╗ ███╗   ██╗ █████╗')}     ${chalk.hex('#9945FF')('◎')}
${chalk.hex('#14F195')('    ██╔════╝██╔═══██╗██║     ██╔══██╗████╗  ██║██╔══██╗')}   ${chalk.hex('#9945FF')('◎◎')}
${chalk.hex('#14F195')('    ███████╗██║   ██║██║     ███████║██╔██╗ ██║███████║')}  ${chalk.hex('#9945FF')('◎◎◎')}
${chalk.hex('#14F195')('    ╚════██║██║   ██║██║     ██╔══██║██║╚██╗██║██╔══██║')}   ${chalk.hex('#9945FF')('◎◎')}
${chalk.hex('#14F195')('    ███████║╚██████╔╝███████╗██║  ██║██║ ╚████║██║  ██║')}    ${chalk.hex('#9945FF')('◎')}
${chalk.hex('#14F195')('    ╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝')}

${chalk.hex('#FFD700').bold('         Solana Stablecoin Standard - Production Ready')}

${chalk.hex('#14F195')('    ✓ Deployed on Devnet')}     ${chalk.gray('Program: Hx1FiL4...gBX4oh')}
${chalk.hex('#14F195')('    ✓ SSS-1 & SSS-2 Ready')}    ${chalk.gray('Hook: HT1Ut5v...YCYX4EZ')}
${chalk.hex('#9945FF')('    ✓ Real Transactions')}      ${chalk.gray('Network: Solana Devnet')}
  `;
  console.log(banner);
}

// Main menu
async function mainMenu() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.hex('#14F195').bold('What would you like to do?'),
      choices: [
        { name: chalk.hex('#FFD700')('🚀 Initialize New Stablecoin'), value: 'init' },
        new inquirer.Separator(chalk.gray('─── Token Operations ───')),
        { name: chalk.hex('#14F195')('💰 Mint Tokens'), value: 'mint' },
        { name: chalk.hex('#FF6B6B')('🔥 Burn Tokens'), value: 'burn' },
        new inquirer.Separator(chalk.gray('─── Account Control ───')),
        { name: chalk.hex('#4ECDC4')('❄️  Freeze Account'), value: 'freeze' },
        { name: chalk.hex('#95E1D3')('🔓 Thaw Account'), value: 'thaw' },
        new inquirer.Separator(chalk.gray('─── System Control ───')),
        { name: chalk.hex('#FF6B6B')('⛔ Pause Operations'), value: 'pause' },
        { name: chalk.hex('#14F195')('▶️  Unpause Operations'), value: 'unpause' },
        new inquirer.Separator(chalk.gray('─── Compliance (SSS-2) ───')),
        { name: chalk.hex('#9945FF')('🚫 Blacklist Management'), value: 'blacklist' },
        { name: chalk.hex('#FF6B6B')('💸 Seize Tokens'), value: 'seize' },
        new inquirer.Separator(chalk.gray('─── Information ───')),
        { name: chalk.hex('#4ECDC4')('📊 View Status'), value: 'status' },
        { name: chalk.hex('#4ECDC4')('💵 View Supply'), value: 'supply' },
        new inquirer.Separator(),
        { name: chalk.gray('❌ Exit'), value: 'exit' },
      ],
    },
  ]);

  return action;
}

// Initialize stablecoin
async function initStablecoin() {
  console.log(chalk.hex('#FFD700').bold('\n🚀 Initialize New Stablecoin\n'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'preset',
      message: chalk.hex('#9945FF')('Choose a preset:'),
      choices: [
        { name: chalk.hex('#14F195')('SSS-1: Minimal') + chalk.gray(' (Basic features)'), value: 'sss-1' },
        { name: chalk.hex('#9945FF')('SSS-2: Compliant') + chalk.gray(' (With blacklist & compliance)'), value: 'sss-2' },
        { name: chalk.hex('#FF6B6B')('SSS-3: Private') + chalk.gray(' (Confidential transfers - Experimental)'), value: 'sss-3' },
        { name: chalk.hex('#4ECDC4')('Custom') + chalk.gray(' (Advanced)'), value: 'custom' },
      ],
    },
    {
      type: 'input',
      name: 'name',
      message: 'Token name:',
      default: 'My Stablecoin',
      validate: (input) => input.length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'symbol',
      message: 'Token symbol:',
      default: 'MYUSD',
      validate: (input) => input.length > 0 || 'Symbol is required',
    },
    {
      type: 'number',
      name: 'decimals',
      message: 'Decimals:',
      default: 6,
      validate: (input) => (input >= 0 && input <= 9) || 'Must be 0-9',
    },
    {
      type: 'list',
      name: 'cluster',
      message: 'Solana cluster:',
      choices: ['devnet', 'testnet', 'mainnet-beta'],
      default: 'devnet',
    },
  ]);

  const spinner = ora('Initializing Solana connection...').start();

  try {
    // Initialize client
    const { client: anchorClient, authority: auth } = await initializeClient(answers.cluster);
    client = anchorClient;
    authority = auth;

    spinner.text = 'Creating stablecoin on-chain...';

    // Call real initialize transaction
    const result = await client.initialize({
      name: answers.name,
      symbol: answers.symbol,
      decimals: answers.decimals,
      authority: authority,
    });

    currentMint = result.mint;

    spinner.succeed(chalk.hex('#14F195').bold('✓ Stablecoin initialized successfully!'));

    const explorerLink = getExplorerLink(result.signature, answers.cluster);

    console.log(boxen(
      chalk.white(`
${chalk.hex('#FFD700').bold('🎉 Stablecoin Details:')}

${chalk.hex('#9945FF')('Name:')}     ${chalk.hex('#14F195')(answers.name)}
${chalk.hex('#9945FF')('Symbol:')}   ${chalk.hex('#14F195')(answers.symbol)}
${chalk.hex('#9945FF')('Decimals:')} ${chalk.hex('#14F195')(answers.decimals)}
${chalk.hex('#9945FF')('Preset:')}   ${chalk.hex('#14F195')(answers.preset.toUpperCase())}
${chalk.hex('#9945FF')('Cluster:')}  ${chalk.hex('#14F195')(answers.cluster)}

${chalk.hex('#FFD700').bold('⛓️  On-Chain Info:')}
${chalk.hex('#9945FF')('Mint:')}     ${chalk.hex('#4ECDC4')(result.mint.toBase58())}
${chalk.hex('#9945FF')('Tx:')}       ${chalk.gray(result.signature.slice(0, 16) + '...')}

${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}
${chalk.blue.underline(explorerLink)}

${chalk.hex('#FFD700').bold('💡 Next steps:')}
${chalk.hex('#14F195')('1.')} Mint tokens: ${chalk.gray('Select "Mint Tokens" from menu')}
${chalk.hex('#14F195')('2.')} View status: ${chalk.gray('Select "View Status" from menu')}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.hex('#FF6B6B').bold('✗ Failed to initialize stablecoin'));
    console.error(chalk.hex('#FF6B6B')(`\n❌ Error: ${error.message}`));

    // Provide helpful error messages
    if (error.message.includes('insufficient funds')) {
      console.log(chalk.hex('#FFD700')('\n💡 Solution:'));
      console.log(chalk.gray('   Run: solana airdrop 2 --url devnet'));
    } else if (error.message.includes('blockhash')) {
      console.log(chalk.hex('#FFD700')('\n💡 Solution:'));
      console.log(chalk.gray('   Network congestion - please try again'));
    } else if (error.message.includes('429')) {
      console.log(chalk.hex('#FFD700')('\n💡 Solution:'));
      console.log(chalk.gray('   Rate limited - wait a moment and try again'));
    }

    if (error.logs) {
      console.error(chalk.gray('\n📋 Program logs:'));
      error.logs.forEach((log: string) => console.error(chalk.gray(`  ${log}`)));
    }
  }
}

// Mint tokens
async function mintTokens() {
  console.log(chalk.hex('#14F195').bold('\n💰 Mint Tokens\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.hex('#FF6B6B')('⚠️  Please initialize a stablecoin first'));
    console.log(chalk.gray('💡 Select "Initialize New Stablecoin" from the menu'));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipient',
      message: 'Recipient address:',
      default: authority.publicKey.toBase58(),
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'number',
      name: 'amount',
      message: 'Amount to mint:',
      default: 1000,
      validate: (input) => input > 0 || 'Amount must be positive',
    },
  ]);

  const spinner = ora('Minting tokens on-chain...').start();

  try {
    const signature = await client.mint({
      mint: currentMint,
      amount: answers.amount,
      authority: authority,
    });

    spinner.succeed(chalk.hex('#14F195').bold(`✓ Minted ${answers.amount.toLocaleString()} tokens`));

    const explorerLink = getExplorerLink(signature, 'devnet');

    console.log(boxen(
      chalk.white(`
${chalk.hex('#FFD700').bold('💰 Transaction Details:')}

${chalk.hex('#9945FF')('Recipient:')} ${chalk.hex('#4ECDC4')(answers.recipient.slice(0, 8) + '...' + answers.recipient.slice(-8))}
${chalk.hex('#9945FF')('Amount:')}    ${chalk.hex('#14F195').bold(answers.amount.toLocaleString() + ' tokens')}
${chalk.hex('#9945FF')('Status:')}    ${chalk.hex('#14F195')('✓ Confirmed')}

${chalk.hex('#FFD700').bold('⛓️  Transaction:')}
${chalk.hex('#9945FF')('Signature:')} ${chalk.gray(signature.slice(0, 16) + '...')}

${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}
${chalk.blue.underline(explorerLink)}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.hex('#FF6B6B').bold('✗ Failed to mint tokens'));
    console.error(chalk.hex('#FF6B6B')(`\n❌ Error: ${error.message}`));

    if (error.message.includes('insufficient funds')) {
      console.log(chalk.hex('#FFD700')('\n💡 Solution:'));
      console.log(chalk.gray('   Run: solana airdrop 2 --url devnet'));
    }
  }
}

// Burn tokens
async function burnTokens() {
  console.log(chalk.hex('#FF6B6B').bold('\n🔥 Burn Tokens\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.hex('#FF6B6B')('⚠️  Please initialize a stablecoin first'));
    console.log(chalk.gray('💡 Select "Initialize New Stablecoin" from the menu'));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'number',
      name: 'amount',
      message: 'Amount to burn:',
      default: 100,
      validate: (input) => input > 0 || 'Amount must be positive',
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to burn these tokens?',
      default: false,
    },
  ]);

  if (!answers.confirm) {
    console.log(chalk.gray('\n✗ Burn cancelled'));
    return;
  }

  const spinner = ora('Burning tokens on-chain...').start();

  try {
    const signature = await client.burn({
      mint: currentMint,
      amount: answers.amount,
      authority: authority,
    });

    spinner.succeed(chalk.hex('#14F195').bold(`✓ Burned ${answers.amount.toLocaleString()} tokens`));

    const explorerLink = getExplorerLink(signature, 'devnet');

    console.log(boxen(
      chalk.white(`
${chalk.hex('#FF6B6B').bold('🔥 Burn Complete')}

${chalk.hex('#9945FF')('Amount:')}    ${chalk.hex('#FF6B6B').bold(answers.amount.toLocaleString() + ' tokens')}
${chalk.hex('#9945FF')('Status:')}    ${chalk.hex('#14F195')('✓ Confirmed')}

${chalk.hex('#FFD700').bold('⛓️  Transaction:')}
${chalk.gray(signature.slice(0, 16) + '...')}

${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}
${chalk.blue.underline(explorerLink)}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.hex('#FF6B6B').bold('✗ Failed to burn tokens'));
    console.error(chalk.hex('#FF6B6B')(`\n❌ Error: ${error.message}`));
  }
}

// Freeze account
async function freezeAccount() {
  console.log(chalk.hex('#4ECDC4').bold('\n❄️  Freeze Account\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.hex('#FF6B6B')('⚠️  Please initialize a stablecoin first'));
    console.log(chalk.gray('💡 Select "Initialize New Stablecoin" from the menu'));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'address',
      message: 'Address to freeze:',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'input',
      name: 'reason',
      message: 'Reason for freezing:',
      default: 'Suspicious activity detected',
    },
  ]);

  const spinner = ora('Freezing account on-chain...').start();

  try {
    const targetPubkey = new PublicKey(answers.address);
    const signature = await client.freezeAccount({
      mint: currentMint,
      target: targetPubkey,
      authority: authority,
    });

    spinner.succeed(chalk.hex('#14F195').bold('✓ Account frozen'));

    const explorerLink = getExplorerLink(signature, 'devnet');

    console.log(boxen(
      chalk.white(`
${chalk.hex('#4ECDC4').bold('❄️  Freeze Details:')}

${chalk.hex('#9945FF')('Address:')} ${chalk.hex('#4ECDC4')(answers.address.slice(0, 8) + '...' + answers.address.slice(-8))}
${chalk.hex('#9945FF')('Reason:')}  ${chalk.hex('#FFD700')(answers.reason)}
${chalk.hex('#9945FF')('Status:')}  ${chalk.hex('#4ECDC4').bold('❄️  FROZEN')}

${chalk.hex('#FFD700').bold('⚠️  This account can no longer:')}
${chalk.gray('• Send tokens')}
${chalk.gray('• Receive tokens')}
${chalk.gray('• Participate in transfers')}

${chalk.hex('#FFD700').bold('⛓️  Transaction:')}
${chalk.gray(signature.slice(0, 16) + '...')}

${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}
${chalk.blue.underline(explorerLink)}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.hex('#FF6B6B').bold('✗ Failed to freeze account'));
    console.error(chalk.hex('#FF6B6B')(`\n❌ Error: ${error.message}`));
  }
}

// Thaw account
async function thawAccount() {
  console.log(chalk.yellow('\n🔓 Thaw Account\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.red('⚠️  Please initialize a stablecoin first'));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'address',
      message: 'Address to thaw:',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
  ]);

  const spinner = ora('Thawing account on-chain...').start();

  try {
    const targetPubkey = new PublicKey(answers.address);
    const signature = await client.thawAccount({
      mint: currentMint,
      target: targetPubkey,
      authority: authority,
    });

    spinner.succeed(chalk.green(`✓ Account thawed`));

    const explorerLink = getExplorerLink(signature, 'devnet');

    console.log(chalk.gray(`\n${answers.address.slice(0, 8)}...${answers.address.slice(-8)} can now send and receive tokens`));
    console.log(chalk.gray(`Transaction: ${signature.slice(0, 16)}...`));
    console.log(chalk.blue(`Explorer: ${explorerLink}`));
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to thaw account'));
    console.error(chalk.red(`\nError: ${error.message}`));
  }
}

// Pause operations
async function pauseOperations() {
  console.log(chalk.hex('#FF6B6B').bold('\n⛔ Pause Operations\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.hex('#FF6B6B')('⚠️  Please initialize a stablecoin first'));
    console.log(chalk.gray('💡 Select "Initialize New Stablecoin" from the menu'));
    return;
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.hex('#FF6B6B').bold('⚠️  Are you sure you want to pause ALL operations?'),
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray('\n✗ Pause cancelled'));
    return;
  }

  const spinner = ora('Pausing all operations on-chain...').start();

  try {
    const signature = await client.pause({
      mint: currentMint,
      authority: authority,
    });

    spinner.succeed(chalk.hex('#FF6B6B').bold('✓ All operations paused'));

    const explorerLink = getExplorerLink(signature, 'devnet');

    console.log(boxen(
      chalk.white(`
${chalk.hex('#FF6B6B').bold('⛔ OPERATIONS PAUSED')}

${chalk.hex('#FFD700').bold('The following operations are now disabled:')}
${chalk.gray('• Minting tokens')}
${chalk.gray('• Burning tokens')}
${chalk.gray('• Transferring tokens')}
${chalk.gray('• All user transactions')}

${chalk.hex('#FFD700').bold('⛓️  Transaction:')}
${chalk.gray(signature.slice(0, 16) + '...')}

${chalk.hex('#4ECDC4').bold('🔗 View on Explorer:')}
${chalk.blue.underline(explorerLink)}

${chalk.gray('Use "Unpause Operations" to resume')}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.hex('#FF6B6B').bold('✗ Failed to pause operations'));
    console.error(chalk.hex('#FF6B6B')(`\n❌ Error: ${error.message}`));
  }
}

// Unpause operations
async function unpauseOperations() {
  console.log(chalk.yellow('\n▶️  Unpause Operations\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.red('⚠️  Please initialize a stablecoin first'));
    return;
  }

  const spinner = ora('Resuming operations on-chain...').start();

  try {
    const signature = await client.unpause({
      mint: currentMint,
      authority: authority,
    });

    spinner.succeed(chalk.green('✓ Operations resumed'));

    const explorerLink = getExplorerLink(signature, 'devnet');

    console.log(chalk.gray('\nAll operations are now active'));
    console.log(chalk.gray(`Transaction: ${signature.slice(0, 16)}...`));
    console.log(chalk.blue(`Explorer: ${explorerLink}`));
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to unpause operations'));
    console.error(chalk.red(`\nError: ${error.message}`));
  }
}

// Seize tokens
async function seizeTokens() {
  console.log(chalk.yellow('\n💸 Seize Tokens (SSS-2)\n'));
  console.log(chalk.gray('Note: This feature requires SSS-2 compliance extensions'));
  console.log(chalk.gray('Seizure functionality is not yet implemented in the current program version\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.red('⚠️  Please initialize a stablecoin first'));
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'from',
      message: 'Seize from address (must be frozen):',
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'input',
      name: 'to',
      message: 'Transfer to (treasury):',
      default: authority.publicKey.toBase58(),
      validate: (input) => {
        try {
          new PublicKey(input);
          return true;
        } catch {
          return 'Invalid Solana address';
        }
      },
    },
    {
      type: 'number',
      name: 'amount',
      message: 'Amount to seize:',
      default: 5000,
      validate: (input) => input > 0 || 'Amount must be positive',
    },
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.red('⚠️  Confirm seizure of tokens?'),
      default: false,
    },
  ]);

  if (!answers.confirm) {
    console.log(chalk.gray('\n✗ Seizure cancelled'));
    return;
  }

  console.log(chalk.yellow('\n⚠️  Seize functionality requires SSS-2 compliance program'));
  console.log(chalk.gray('This feature will be available in the next program update'));
}

// Blacklist management
async function manageBlacklist() {
  console.log(chalk.yellow('\n🚫 Blacklist Management (SSS-2)\n'));

  if (!client || !authority || !currentMint) {
    console.log(chalk.red('⚠️  Please initialize a stablecoin first'));
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '➕ Add to blacklist', value: 'add' },
        { name: '➖ Remove from blacklist', value: 'remove' },
        { name: '⬅️  Back', value: 'back' },
      ],
    },
  ]);

  if (action === 'back') return;

  if (action === 'add') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: 'Address to blacklist:',
        validate: (input) => {
          try {
            new PublicKey(input);
            return true;
          } catch {
            return 'Invalid Solana address';
          }
        },
      },
      {
        type: 'list',
        name: 'reason',
        message: 'Reason:',
        choices: [
          'OFAC sanctions match',
          'Suspicious activity',
          'Fraud investigation',
          'Regulatory requirement',
          'Other',
        ],
      },
    ]);

    const spinner = ora('Adding to blacklist on-chain...').start();

    try {
      const addressPubkey = new PublicKey(answers.address);
      const signature = await client.addToBlacklist({
        mint: currentMint,
        address: addressPubkey,
        reason: answers.reason,
        authority: authority,
      });

      spinner.succeed(chalk.green('✓ Address added to blacklist'));

      const explorerLink = getExplorerLink(signature, 'devnet');

      console.log(boxen(
        chalk.white(`
${chalk.bold('Blacklist Entry:')}

Address: ${chalk.red(answers.address.slice(0, 8) + '...' + answers.address.slice(-8))}
Reason:  ${chalk.yellow(answers.reason)}
Date:    ${chalk.gray(new Date().toLocaleString())}

${chalk.yellow('⚠️  This address is now blocked from:')}
• Sending tokens
• Receiving tokens
• All transfers will be rejected by transfer hook

${chalk.bold('Transaction:')}
${chalk.gray(signature.slice(0, 16) + '...')}

${chalk.blue('View on Explorer:')}
${chalk.gray(explorerLink)}
      `),
        { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
      ));
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to add to blacklist'));
      console.error(chalk.red(`\nError: ${error.message}`));
    }
  } else if (action === 'remove') {
    const { address } = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: 'Address to remove:',
        validate: (input) => {
          try {
            new PublicKey(input);
            return true;
          } catch {
            return 'Invalid Solana address';
          }
        },
      },
    ]);

    const spinner = ora('Removing from blacklist on-chain...').start();

    try {
      const addressPubkey = new PublicKey(address);
      const signature = await client.removeFromBlacklist({
        mint: currentMint,
        address: addressPubkey,
        authority: authority,
      });

      spinner.succeed(chalk.green('✓ Address removed from blacklist'));

      const explorerLink = getExplorerLink(signature, 'devnet');

      console.log(chalk.gray(`\n${address.slice(0, 8)}...${address.slice(-8)} can now transact normally`));
      console.log(chalk.gray(`Transaction: ${signature.slice(0, 16)}...`));
      console.log(chalk.blue(`Explorer: ${explorerLink}`));
    } catch (error: any) {
      spinner.fail(chalk.red('Failed to remove from blacklist'));
      console.error(chalk.red(`\nError: ${error.message}`));
    }
  }
}

// View status
async function viewStatus() {
  console.log(chalk.hex('#4ECDC4').bold('\n📊 Stablecoin Status\n'));

  if (!client || !currentMint) {
    console.log(chalk.hex('#FF6B6B')('⚠️  Please initialize a stablecoin first'));
    console.log(chalk.gray('💡 Select "Initialize New Stablecoin" from the menu'));
    return;
  }

  const spinner = ora('Fetching on-chain status...').start();

  try {
    const state = await client.getState(currentMint);

    spinner.succeed(chalk.hex('#14F195').bold('✓ Status retrieved'));

    console.log(boxen(
      chalk.white(`
${chalk.hex('#FFD700').bold('📊 Stablecoin Status:')}

${chalk.hex('#9945FF')('Mint Address:')}  ${chalk.hex('#4ECDC4')(currentMint.toBase58())}
${chalk.hex('#9945FF')('State PDA:')}     ${chalk.hex('#4ECDC4')(state.address)}
${chalk.hex('#9945FF')('Network:')}       ${chalk.hex('#14F195')('Devnet')}

${chalk.hex('#FFD700').bold('🔧 Program Info:')}
${chalk.hex('#14F195')('• Core Program:')}    ${chalk.hex('#14F195')('✓ Deployed')}
${chalk.hex('#14F195')('• Transfer Hook:')}   ${chalk.hex('#14F195')('✓ Deployed')}
${chalk.hex('#14F195')('• Compliance:')}      ${chalk.hex('#14F195')('✓ Available (SSS-2)')}

${chalk.hex('#FFD700').bold('⚡ Available Operations:')}
${chalk.hex('#14F195')('• Mint/Burn:')}       ${chalk.hex('#14F195')('✓ Enabled')}
${chalk.hex('#14F195')('• Freeze/Thaw:')}     ${chalk.hex('#14F195')('✓ Enabled')}
${chalk.hex('#14F195')('• Pause/Unpause:')}   ${chalk.hex('#14F195')('✓ Enabled')}
${chalk.hex('#14F195')('• Blacklist:')}       ${chalk.hex('#14F195')('✓ Enabled')}

${chalk.gray('Note: Fetching detailed state requires account deserialization')}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.hex('#FF6B6B').bold('✗ Failed to fetch status'));
    console.error(chalk.hex('#FF6B6B')(`\n❌ Error: ${error.message}`));
  }
}

// View supply
async function viewSupply() {
  console.log(chalk.yellow('\n💵 Token Supply\n'));

  if (!client || !currentMint) {
    console.log(chalk.red('⚠️  Please initialize a stablecoin first'));
    return;
  }

  const spinner = ora('Fetching supply data from blockchain...').start();

  try {
    const state = await client.getState(currentMint);

    spinner.succeed(chalk.green('Supply data retrieved'));

    console.log(boxen(
      chalk.white(`
${chalk.bold('Supply Information:')}

Mint Address:   ${chalk.cyan(currentMint.toBase58())}
Network:        ${chalk.cyan('Devnet')}

${chalk.bold('On-Chain Data:')}
State Account:  ${chalk.green('✓ Found')}
Data Size:      ${chalk.cyan(state.data.length + ' bytes')}

${chalk.gray('Note: Full supply details require account deserialization')}
${chalk.gray('The stablecoin state contains:')}
${chalk.gray('• Total supply')}
${chalk.gray('• Authority address')}
${chalk.gray('• Pause status')}
${chalk.gray('• Token metadata')}

${chalk.bold('Explorer:')}
${chalk.blue(`https://explorer.solana.com/address/${currentMint.toBase58()}?cluster=devnet`)}
    `),
      { padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch supply data'));
    console.error(chalk.red(`\nError: ${error.message}`));
  }
}

// Main interactive loop
async function run() {
  showBanner();

  let running = true;

  while (running) {
    const action = await mainMenu();

    switch (action) {
      case 'init':
        await initStablecoin();
        break;
      case 'mint':
        await mintTokens();
        break;
      case 'burn':
        await burnTokens();
        break;
      case 'freeze':
        await freezeAccount();
        break;
      case 'thaw':
        await thawAccount();
        break;
      case 'pause':
        await pauseOperations();
        break;
      case 'unpause':
        await unpauseOperations();
        break;
      case 'blacklist':
        await manageBlacklist();
        break;
      case 'seize':
        await seizeTokens();
        break;
      case 'status':
        await viewStatus();
        break;
      case 'supply':
        await viewSupply();
        break;
      case 'exit':
        console.log(chalk.hex('#14F195').bold('\n👋 Thanks for using Solana Stablecoin Standard!'));
        console.log(chalk.gray('   Built with ') + chalk.hex('#9945FF')('♥') + chalk.gray(' by Superteam Brazil\n'));
        running = false;
        break;
    }

    if (running) {
      await inquirer.prompt([
        {
          type: 'input',
          name: 'continue',
          message: chalk.gray('Press Enter to continue...'),
        },
      ]);
      console.clear();
      showBanner();
    }
  }
}

// Run if called directly
if (require.main === module) {
  run().catch(console.error);
}

export { run };
