#!/usr/bin/env node
/**
 * sss-token — CLI for managing Solana Stablecoin Standard tokens
 *
 * Usage:
 *   sss-token init --preset sss-1 --name "My USD" --symbol "MUSD" --uri "https://..."
 *   sss-token mint --mint <address> --to <address> --amount 1000000
 *   sss-token burn --mint <address> --from <address> --amount 1000000
 *   sss-token freeze --mint <address> --account <address>
 *   sss-token thaw --mint <address> --account <address>
 *   sss-token pause --mint <address>
 *   sss-token unpause --mint <address>
 *   sss-token status --mint <address>
 *   sss-token supply --mint <address>
 *   sss-token blacklist add --mint <address> --address <address>
 *   sss-token blacklist remove --mint <address> --address <address>
 *   sss-token minters list --mint <address>
 *   sss-token minters add --mint <address> --minter <address>
 *   sss-token seize --mint <address> --from <address> --to <address> --amount 1000000
 */

import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helper: load provider ──────────────────────────────────────────────────

function loadProvider(opts: { rpc?: string; keypair?: string }): AnchorProvider {
  const rpc = opts.rpc ?? process.env.ANCHOR_PROVIDER_URL ?? 'https://api.devnet.solana.com';
  const keypairPath = opts.keypair ??
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), '.config', 'solana', 'id.json');

  if (!fs.existsSync(keypairPath)) {
    console.error(`Keypair not found: ${keypairPath}`);
    console.error('Set --keypair flag or ANCHOR_WALLET environment variable');
    process.exit(1);
  }

  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf-8')) as number[];
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(rpc, 'confirmed');
  return new AnchorProvider(connection, new Wallet(keypair), { commitment: 'confirmed' });
}

function parseMint(addr: string): PublicKey {
  try {
    return new PublicKey(addr);
  } catch {
    console.error(`Invalid public key: ${addr}`);
    process.exit(1);
  }
}

function parseIntSafe(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n)) {
    console.error(`Invalid integer for ${name}: ${value}`);
    process.exit(1);
  }
  return n;
}

// ─── Main CLI ──────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('sss-token')
  .description('Solana Stablecoin Standard CLI')
  .version('0.1.0')
  .option('--rpc <url>', 'Solana RPC URL')
  .option('--keypair <path>', 'Path to keypair JSON file');

// ─── init ──────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a new SSS-1 or SSS-2 stablecoin')
  .requiredOption('--preset <preset>', 'Preset: sss-1 or sss-2')
  .requiredOption('--name <name>', 'Token name')
  .requiredOption('--symbol <symbol>', 'Token symbol (max 10 chars)')
  .requiredOption('--uri <uri>', 'Metadata URI')
  .option('--decimals <n>', 'Decimal places (default: 6)')
  .option('--max-supply <n>', 'Maximum supply in base units (0 = unlimited)')
  .option('--minter <address>', 'Initial minter (default: authority)')
  .option('--minter-quota <n>', 'Per-minter quota in base units (0 = unlimited)')
  .action(async (opts) => {
    const parentOpts = program.opts();
    const provider = loadProvider(parentOpts);

    const presetStr = opts.preset.toLowerCase();
    if (presetStr !== 'sss-1' && presetStr !== 'sss-2' && presetStr !== 'custom') {
      console.error('--preset must be sss-1, sss-2, or custom');
      process.exit(1);
    }
    const preset = presetStr === 'sss-1'
      ? StablecoinPreset.SSS1
      : presetStr === 'sss-2'
        ? StablecoinPreset.SSS2
        : StablecoinPreset.Custom;

    console.log(`Initializing ${opts.preset.toUpperCase()} stablecoin...`);
    console.log(`  Name: ${opts.name}`);
    console.log(`  Symbol: ${opts.symbol}`);
    console.log(`  Authority: ${provider.wallet.publicKey.toBase58()}`);

    try {
      const result = await SolanaStablecoin.initialize(provider, {
        name: opts.name,
        symbol: opts.symbol,
        uri: opts.uri,
        decimals: opts.decimals ? parseIntSafe(opts.decimals, 'decimals') : 6,
        maxSupply: opts.maxSupply ? new BN(opts.maxSupply) : new BN(0),
        preset,
        minter: opts.minter ? parseMint(opts.minter) : undefined,
        minterQuota: opts.minterQuota ? new BN(opts.minterQuota) : undefined,
      });

      console.log('\nStablecoin initialized successfully!');
      console.log('  Mint:', result.mint.toBase58());
      console.log('  Config PDA:', result.stablecoinConfig.toBase58());
      console.log('  Roles PDA:', result.rolesConfig.toBase58());
      console.log('  Signature:', result.signature);
    } catch (err) {
      console.error('Initialization failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── mint ──────────────────────────────────────────────────────────────────

program
  .command('mint')
  .description('Mint tokens to a recipient')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--to <address>', 'Destination token account')
  .requiredOption('--amount <n>', 'Amount in base units')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    const amount = new BN(opts.amount);

    console.log(`Minting ${opts.amount} tokens...`);
    try {
      const sig = await token.mint(parseMint(opts.to), amount);
      console.log('Minted! Signature:', sig);
    } catch (err) {
      console.error('Mint failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── burn ──────────────────────────────────────────────────────────────────

program
  .command('burn')
  .description('Burn tokens from a source account')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--from <address>', 'Source token account')
  .requiredOption('--amount <n>', 'Amount in base units')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    const amount = new BN(opts.amount);

    console.log(`Burning ${opts.amount} tokens...`);
    try {
      const sig = await token.burn(parseMint(opts.from), amount);
      console.log('Burned! Signature:', sig);
    } catch (err) {
      console.error('Burn failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── freeze / thaw ─────────────────────────────────────────────────────────

program
  .command('freeze')
  .description('Freeze a token account')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--account <address>', 'Token account to freeze')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const sig = await token.freeze(parseMint(opts.account));
      console.log('Frozen! Signature:', sig);
    } catch (err) {
      console.error('Freeze failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('thaw')
  .description('Thaw (unfreeze) a token account')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--account <address>', 'Token account to thaw')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const sig = await token.thaw(parseMint(opts.account));
      console.log('Thawed! Signature:', sig);
    } catch (err) {
      console.error('Thaw failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── pause / unpause ───────────────────────────────────────────────────────

program
  .command('pause')
  .description('Pause all transfers globally')
  .requiredOption('--mint <address>', 'Mint address')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const sig = await token.pause();
      console.log('Paused! Signature:', sig);
    } catch (err) {
      console.error('Pause failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program
  .command('unpause')
  .description('Unpause transfers')
  .requiredOption('--mint <address>', 'Mint address')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const sig = await token.unpause();
      console.log('Unpaused! Signature:', sig);
    } catch (err) {
      console.error('Unpause failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── status ────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show stablecoin configuration and status')
  .requiredOption('--mint <address>', 'Mint address')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const [config, roles, supply] = await Promise.all([
        token.getConfig(),
        token.getRoles(),
        token.getTotalSupply(),
      ]);

      console.log('\n─── Stablecoin Status ───────────────────────────────');
      console.log('Mint:             ', opts.mint);
      console.log('Preset:           ', ['SSS-1', 'SSS-2', 'Custom'][config.preset]);
      console.log('Paused:           ', config.paused);
      console.log('Decimals:         ', config.decimals);
      console.log('Max Supply:       ', config.maxSupply.toString() || 'Unlimited');
      console.log('Total Supply:     ', supply.toString());
      console.log('\n─── Roles ───────────────────────────────────────────');
      console.log('Master Authority:', roles.masterAuthority.toBase58());
      console.log('Minter:         ', roles.minter.toBase58());
      console.log('Minter Quota:   ', roles.minterQuota.toString() || 'Unlimited');
      console.log('Burner:         ', roles.burner.toBase58());
      console.log('Pauser:         ', roles.pauser.toBase58());
      if (config.permanentDelegateEnabled) {
        console.log('\n─── SSS-2 Compliance ────────────────────────────────');
        console.log('Blacklister:    ', roles.blacklister.toBase58());
        console.log('Seizer:         ', roles.seizer.toBase58());
      }
      console.log('─────────────────────────────────────────────────────\n');
    } catch (err) {
      console.error('Status check failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── supply ────────────────────────────────────────────────────────────────

program
  .command('supply')
  .description('Show total token supply')
  .requiredOption('--mint <address>', 'Mint address')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const supply = await token.getTotalSupply();
      console.log('Total supply:', supply.toString());
    } catch (err) {
      console.error('Failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── blacklist ─────────────────────────────────────────────────────────────

const blacklistCmd = program.command('blacklist').description('Manage the compliance blacklist (SSS-2 only)');

blacklistCmd
  .command('add')
  .description('Add an address to the blacklist')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--address <address>', 'Address to blacklist')
  .option('--reason <n>', 'Reason code (default: 0)')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    const reason = opts.reason ? parseIntSafe(opts.reason, 'reason') : 0;
    try {
      const sig = await token.compliance.blacklistAdd(parseMint(opts.address), reason);
      console.log('Blacklisted! Signature:', sig);
    } catch (err) {
      console.error('Blacklist add failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

blacklistCmd
  .command('remove')
  .description('Remove an address from the blacklist')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--address <address>', 'Address to remove')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const sig = await token.compliance.blacklistRemove(parseMint(opts.address));
      console.log('Removed from blacklist! Signature:', sig);
    } catch (err) {
      console.error('Blacklist remove failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

blacklistCmd
  .command('check')
  .description('Check if an address is blacklisted')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--address <address>', 'Address to check')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const isBlacklisted = await token.compliance.isBlacklisted(parseMint(opts.address));
      console.log(isBlacklisted ? 'BLACKLISTED' : 'NOT blacklisted');
    } catch (err) {
      console.error('Check failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── seize ─────────────────────────────────────────────────────────────────

program
  .command('seize')
  .description('Seize tokens using permanent delegate (SSS-2 only)')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--from <address>', 'Source token account')
  .requiredOption('--to <address>', 'Destination token account')
  .requiredOption('--amount <n>', 'Amount in base units')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    const amount = new BN(opts.amount);
    try {
      const sig = await token.compliance.seize(parseMint(opts.from), parseMint(opts.to), amount);
      console.log('Seized! Signature:', sig);
    } catch (err) {
      console.error('Seize failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── minters ───────────────────────────────────────────────────────────────

const mintersCmd = program.command('minters').description('Manage minter roles');

mintersCmd
  .command('list')
  .description('Show current minter configuration')
  .requiredOption('--mint <address>', 'Mint address')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const roles = await token.getRoles();
      console.log('Minter:', roles.minter.toBase58());
      console.log('Quota:', roles.minterQuota.toString() === '0' ? 'Unlimited' : roles.minterQuota.toString());
      console.log('Minted this epoch:', roles.mintedThisEpoch.toString());
    } catch (err) {
      console.error('Failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

mintersCmd
  .command('add')
  .description('Set a new minter (replaces current)')
  .requiredOption('--mint <address>', 'Mint address')
  .requiredOption('--minter <address>', 'New minter address')
  .option('--quota <n>', 'Optional quota in base units')
  .action(async (opts) => {
    const provider = loadProvider(program.opts());
    const token = SolanaStablecoin.load(provider, parseMint(opts.mint));
    try {
      const sig = await token.updateRoles({
        newMinter: parseMint(opts.minter),
        newMinterQuota: opts.quota ? new BN(opts.quota) : undefined,
      });
      console.log('Minter updated! Signature:', sig);
    } catch (err) {
      console.error('Failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

// ─── Parse and run ────────────────────────────────────────────────────────

program.parse(process.argv);

if (process.argv.length < 3) {
  program.help();
}
