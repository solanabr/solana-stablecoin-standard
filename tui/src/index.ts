#!/usr/bin/env npx tsx
/**
 * sss-tui — Interactive Terminal UI for Solana Stablecoin Standard
 *
 * Provides a real-time dashboard for monitoring and managing SSS tokens:
 * - Token configuration overview (preset, decimals, pause status)
 * - Role assignments and quota tracking
 * - Oracle status and price feed data
 * - Supply monitoring with formatted display
 * - Quick-action buttons for common operations
 *
 * Usage:
 *   npx tsx tui/src/index.ts --mint <address> [--rpc <url>] [--keypair <path>]
 */

import * as blessed from 'blessed';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, Idl, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let mintArg = '';
let rpcUrl = 'https://api.devnet.solana.com';
let keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mint' && args[i + 1]) mintArg = args[++i];
  if (args[i] === '--rpc' && args[i + 1]) rpcUrl = args[++i];
  if (args[i] === '--keypair' && args[i + 1]) keypairPath = args[++i];
}

if (!mintArg) {
  console.error('Usage: sss-tui --mint <address> [--rpc <url>] [--keypair <path>]');
  process.exit(1);
}

// ─── PDA Seeds ───────────────────────────────────────────────────────────────

const SSS_PROGRAM_ID = new PublicKey('HcMZDUcHHayD4Nhrk2YEfFhBDbBjENzcWDo6TTfj2wFR');
const STABLECOIN_CONFIG_SEED = Buffer.from('stablecoin-config');
const ROLES_CONFIG_SEED = Buffer.from('roles-config');
const ORACLE_CONFIG_SEED = Buffer.from('oracle-config');

function findPda(seeds: Buffer[], programId = SSS_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

// ─── Provider Setup ──────────────────────────────────────────────────────────

function loadProvider(): AnchorProvider {
  if (!fs.existsSync(keypairPath)) {
    console.error(`Keypair not found: ${keypairPath}`);
    process.exit(1);
  }
  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf-8')) as number[];
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(rpcUrl, 'confirmed');
  return new AnchorProvider(connection, new Wallet(keypair), { commitment: 'confirmed' });
}

// ─── Data Types ──────────────────────────────────────────────────────────────

interface DashboardData {
  config: {
    mint: string;
    preset: string;
    paused: boolean;
    maxSupply: string;
    decimals: number;
    permanentDelegate: boolean;
    transferHook: boolean;
    confidentialTransfers: boolean;
    oracleEnabled: boolean;
  } | null;
  roles: {
    masterAuthority: string;
    minter: string;
    minterQuota: string;
    mintedThisEpoch: string;
    burner: string;
    blacklister: string;
    pauser: string;
    seizer: string;
  } | null;
  oracle: {
    priceFeed: string;
    pegCurrency: string;
    maxStalenessSecs: string;
    priceExponent: number;
    enabled: boolean;
    configuredBy: string;
    configuredAt: string;
  } | null;
  supply: string;
  lastUpdate: string;
  error: string | null;
}

// ─── Blessed UI ──────────────────────────────────────────────────────────────

const screen = blessed.screen({
  smartCSR: true,
  title: 'SSS Token Dashboard',
  fullUnicode: true,
});

// Header
const header = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: '{center}{bold}Solana Stablecoin Standard — Token Dashboard{/bold}{/center}',
  tags: true,
  style: { fg: 'white', bg: 'blue', bold: true },
});

// Config Box (top-left)
const configBox = blessed.box({
  top: 3,
  left: 0,
  width: '50%',
  height: 14,
  label: ' Token Configuration ',
  border: { type: 'line' },
  tags: true,
  style: {
    border: { fg: 'cyan' },
    label: { fg: 'cyan', bold: true },
  },
});

// Roles Box (top-right)
const rolesBox = blessed.box({
  top: 3,
  left: '50%',
  width: '50%',
  height: 14,
  label: ' Roles & Access Control ',
  border: { type: 'line' },
  tags: true,
  style: {
    border: { fg: 'green' },
    label: { fg: 'green', bold: true },
  },
});

// Oracle Box (middle-left)
const oracleBox = blessed.box({
  top: 17,
  left: 0,
  width: '50%',
  height: 10,
  label: ' Oracle Price Feed ',
  border: { type: 'line' },
  tags: true,
  style: {
    border: { fg: 'yellow' },
    label: { fg: 'yellow', bold: true },
  },
});

// Supply Box (middle-right)
const supplyBox = blessed.box({
  top: 17,
  left: '50%',
  width: '50%',
  height: 10,
  label: ' Supply & Metrics ',
  border: { type: 'line' },
  tags: true,
  style: {
    border: { fg: 'magenta' },
    label: { fg: 'magenta', bold: true },
  },
});

// Status Bar
const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: ' {bold}q{/bold}:quit  {bold}r{/bold}:refresh  {bold}p{/bold}:pause/unpause  Mint: ' + mintArg.slice(0, 20) + '...',
  tags: true,
  style: { fg: 'white', bg: 'gray' },
});

// Log Box
const logBox = blessed.box({
  top: 27,
  left: 0,
  width: '100%',
  height: '100%-28',
  label: ' Activity Log ',
  border: { type: 'line' },
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  style: {
    border: { fg: 'white' },
    label: { fg: 'white', bold: true },
  },
});

screen.append(header);
screen.append(configBox);
screen.append(rolesBox);
screen.append(oracleBox);
screen.append(supplyBox);
screen.append(statusBar);
screen.append(logBox);

// ─── Formatting ──────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function presetName(p: any): string {
  if (p?.sss1 !== undefined) return 'SSS-1 (Minimal)';
  if (p?.sss2 !== undefined) return 'SSS-2 (Compliant)';
  if (p?.sss3 !== undefined) return 'SSS-3 (Private)';
  if (p?.custom !== undefined) return 'Custom';
  return `Unknown (${JSON.stringify(p)})`;
}

function formatSupply(amount: string, decimals: number): string {
  const len = amount.length;
  if (len <= decimals) {
    return '0.' + '0'.repeat(decimals - len) + amount;
  }
  return amount.slice(0, len - decimals) + '.' + amount.slice(len - decimals);
}

function boolIcon(v: boolean): string {
  return v ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';
}

function pegCurrencyStr(arr: number[]): string {
  return String.fromCharCode(...arr.filter(b => b !== 0));
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  logBox.pushLine(`{gray-fg}[${ts}]{/gray-fg} ${msg}`);
  logBox.setScrollPerc(100);
  screen.render();
}

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchData(provider: AnchorProvider, mint: PublicKey): Promise<DashboardData> {
  const now = new Date().toISOString().slice(11, 19);
  try {
    const idlPath = path.join(__dirname, '..', '..', 'target', 'idl', 'solana_stablecoin_standard.json');
    let idl: Idl;
    if (fs.existsSync(idlPath)) {
      idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    } else {
      // Try the sdk's bundled IDL
      const sdkIdlPath = path.join(__dirname, '..', '..', 'sdk', 'idl', 'solana_stablecoin_standard.json');
      idl = JSON.parse(fs.readFileSync(sdkIdlPath, 'utf-8'));
    }

    const program = new Program(idl, provider);

    const [configPda] = findPda([STABLECOIN_CONFIG_SEED, mint.toBuffer()]);
    const [rolesPda] = findPda([ROLES_CONFIG_SEED, mint.toBuffer()]);
    const [oraclePda] = findPda([ORACLE_CONFIG_SEED, mint.toBuffer()]);

    // Fetch config
    const configAcct = await (program.account as any).stablecoinConfig.fetch(configPda);
    const rolesAcct = await (program.account as any).rolesConfig.fetch(rolesPda);

    // Fetch oracle (may not exist)
    let oracleAcct = null;
    try {
      oracleAcct = await (program.account as any).oracleConfig.fetch(oraclePda);
    } catch { /* oracle not configured */ }

    // Fetch supply
    const supplyInfo = await provider.connection.getTokenSupply(mint);

    return {
      config: {
        mint: configAcct.mint.toBase58(),
        preset: presetName(configAcct.preset),
        paused: configAcct.paused,
        maxSupply: configAcct.maxSupply.toString(),
        decimals: configAcct.decimals,
        permanentDelegate: configAcct.permanentDelegateEnabled,
        transferHook: configAcct.transferHookEnabled,
        confidentialTransfers: configAcct.confidentialTransfersEnabled ?? false,
        oracleEnabled: configAcct.oracleEnabled ?? false,
      },
      roles: {
        masterAuthority: rolesAcct.masterAuthority.toBase58(),
        minter: rolesAcct.minter.toBase58(),
        minterQuota: rolesAcct.minterQuota.toString(),
        mintedThisEpoch: rolesAcct.mintedThisEpoch.toString(),
        burner: rolesAcct.burner.toBase58(),
        blacklister: rolesAcct.blacklister.toBase58(),
        pauser: rolesAcct.pauser.toBase58(),
        seizer: rolesAcct.seizer.toBase58(),
      },
      oracle: oracleAcct ? {
        priceFeed: oracleAcct.priceFeed.toBase58(),
        pegCurrency: pegCurrencyStr(oracleAcct.pegCurrency),
        maxStalenessSecs: oracleAcct.maxStalenessSecs.toString(),
        priceExponent: oracleAcct.priceExponent,
        enabled: oracleAcct.enabled,
        configuredBy: oracleAcct.configuredBy.toBase58(),
        configuredAt: new Date(oracleAcct.configuredAt.toNumber() * 1000).toISOString(),
      } : null,
      supply: supplyInfo.value.amount,
      lastUpdate: now,
      error: null,
    };
  } catch (e: any) {
    return {
      config: null, roles: null, oracle: null, supply: '0',
      lastUpdate: now, error: e.message,
    };
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderDashboard(data: DashboardData) {
  if (data.error) {
    configBox.setContent(`{red-fg}Error: ${data.error}{/red-fg}`);
    screen.render();
    return;
  }

  const c = data.config!;
  configBox.setContent([
    ` {bold}Mint:{/bold}      ${shortAddr(c.mint)}`,
    ` {bold}Preset:{/bold}    ${c.preset}`,
    ` {bold}Decimals:{/bold}  ${c.decimals}`,
    ` {bold}Max Supply:{/bold} ${c.maxSupply === '0' ? 'Unlimited' : c.maxSupply}`,
    ` {bold}Paused:{/bold}    ${boolIcon(c.paused)}`,
    '',
    ` {bold}Features:{/bold}`,
    `   Permanent Delegate: ${boolIcon(c.permanentDelegate)}`,
    `   Transfer Hook:      ${boolIcon(c.transferHook)}`,
    `   Confidential:       ${boolIcon(c.confidentialTransfers)}`,
    `   Oracle:             ${boolIcon(c.oracleEnabled)}`,
  ].join('\n'));

  const r = data.roles!;
  rolesBox.setContent([
    ` {bold}Authority:{/bold}   ${shortAddr(r.masterAuthority)}`,
    ` {bold}Minter:{/bold}      ${shortAddr(r.minter)}`,
    `   Quota: ${r.minterQuota === '0' ? 'Unlimited' : r.minterQuota}`,
    `   Minted: ${r.mintedThisEpoch}`,
    ` {bold}Burner:{/bold}      ${shortAddr(r.burner)}`,
    ` {bold}Pauser:{/bold}      ${shortAddr(r.pauser)}`,
    ` {bold}Blacklister:{/bold} ${shortAddr(r.blacklister)}`,
    ` {bold}Seizer:{/bold}      ${shortAddr(r.seizer)}`,
  ].join('\n'));

  if (data.oracle) {
    const o = data.oracle;
    oracleBox.setContent([
      ` {bold}Status:{/bold}    ${boolIcon(o.enabled)}`,
      ` {bold}Currency:{/bold}  ${o.pegCurrency}`,
      ` {bold}Feed:{/bold}      ${shortAddr(o.priceFeed)}`,
      ` {bold}Exponent:{/bold}  ${o.priceExponent}`,
      ` {bold}Staleness:{/bold} ${o.maxStalenessSecs}s`,
      ` {bold}Set by:{/bold}    ${shortAddr(o.configuredBy)}`,
      ` {bold}Set at:{/bold}    ${o.configuredAt}`,
    ].join('\n'));
  } else {
    oracleBox.setContent([
      '',
      '  {gray-fg}No oracle configured{/gray-fg}',
      '',
      '  Use {bold}sss-token oracle set{/bold} to configure',
      '  a Pyth or Switchboard price feed',
    ].join('\n'));
  }

  const decimals = c?.decimals ?? 6;
  const formattedSupply = formatSupply(data.supply, decimals);
  supplyBox.setContent([
    '',
    `  {bold}Total Supply:{/bold}`,
    `  {green-fg}${formattedSupply}{/green-fg} tokens`,
    '',
    `  {bold}Raw:{/bold} ${data.supply}`,
    `  {bold}Decimals:{/bold} ${decimals}`,
    '',
    `  Last updated: ${data.lastUpdate}`,
  ].join('\n'));

  screen.render();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const provider = loadProvider();
  const mint = new PublicKey(mintArg);

  log('Starting SSS Token Dashboard...');
  log(`Mint: ${mintArg}`);
  log(`RPC: ${rpcUrl}`);

  // Initial fetch
  log('Fetching on-chain data...');
  const data = await fetchData(provider, mint);
  renderDashboard(data);
  if (data.error) {
    log(`{red-fg}Error: ${data.error}{/red-fg}`);
  } else {
    log('{green-fg}Data loaded successfully{/green-fg}');
  }

  // Auto-refresh every 10 seconds
  const refreshInterval = setInterval(async () => {
    log('Refreshing...');
    const fresh = await fetchData(provider, mint);
    renderDashboard(fresh);
    if (!fresh.error) {
      log('{green-fg}Refreshed{/green-fg}');
    }
  }, 10_000);

  // Key bindings
  screen.key(['q', 'C-c'], () => {
    clearInterval(refreshInterval);
    screen.destroy();
    process.exit(0);
  });

  screen.key(['r'], async () => {
    log('Manual refresh...');
    const fresh = await fetchData(provider, mint);
    renderDashboard(fresh);
    log('{green-fg}Done{/green-fg}');
  });

  screen.render();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
