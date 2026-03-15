#!/usr/bin/env node
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { program } from 'commander';

// ── Config ──────────────────────────────────────────────────────
// Default program ID - can be overridden via --program flag or SSS_PROGRAM_ID env var
let STABLECOIN_PROGRAM_ID = new PublicKey('GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y');

function findConfigPDA(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stablecoin-config'), mint.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

function findRolePDA(config, user) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('role'), config.toBuffer(), user.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

function findBlacklistPDA(mint, user) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('blacklist'), mint.toBuffer(), user.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

const ROLES = { 1: 'Minter', 2: 'Burner', 4: 'Pauser', 8: 'Blacklister', 16: 'Seizer' };
const PRESETS = { 0: 'SSS-1 Minimal', 1: 'SSS-2 Compliant', 2: 'Custom' };

// ── Account Parsing ─────────────────────────────────────────────
// IDL layout: bump(u8), mint(pubkey), authority(pubkey), preset(u8),
// features(FeatureFlags: 4 bools), paused(bool), defaultAccountFrozen(bool),
// totalMinted(u64), totalBurned(u64), decimals(u8),
// name([u8;32]), symbol([u8;10]), transferHookProgram(pubkey),
// createdAt(u64), updatedAt(u64), reserved([u8;128])
function parseConfig(data) {
  const buf = Buffer.from(data);
  let o = 8; // skip Anchor discriminator

  const bump = buf[o++];                                                // u8
  const mint = new PublicKey(buf.slice(o, o + 32)); o += 32;           // pubkey
  const authority = new PublicKey(buf.slice(o, o + 32)); o += 32;      // pubkey
  const preset = buf[o++];                                              // Preset enum (u8)

  // FeatureFlags: 4 bools (freezeAuthority, permanentDelegate, transferHook, confidentialTransfers)
  const freezeAuthority = !!buf[o++];
  const permanentDelegate = !!buf[o++];
  const transferHook = !!buf[o++];
  const confidentialTransfers = !!buf[o++];

  const paused = !!buf[o++];                                            // bool
  const defaultAccountFrozen = !!buf[o++];                              // bool

  const totalMinted = Number(buf.readBigUInt64LE(o)); o += 8;          // u64
  const totalBurned = Number(buf.readBigUInt64LE(o)); o += 8;          // u64
  const decimals = buf[o++];                                            // u8

  // name: [u8; 32]
  const name = buf.slice(o, o + 32).toString('utf8').replace(/\0+$/, ''); o += 32;
  // symbol: [u8; 10]
  const symbol = buf.slice(o, o + 10).toString('utf8').replace(/\0+$/, ''); o += 10;

  const isSSS2 = preset === 1;
  const features = {
    canMint: true,
    canBurn: true,
    canFreeze: freezeAuthority,
    canPause: true,
    hasRoles: true,
    hasBlacklist: isSSS2,
    hasSeize: isSSS2 && permanentDelegate,
    hasTransferHook: transferHook,
  };

  return { authority, mint, preset, features, paused, totalMinted, totalBurned, decimals, name, symbol, bump };
}

// ── CLI Args ────────────────────────────────────────────────────
program
  .option('-m, --mint <address>', 'Stablecoin mint address')
  .option('-r, --rpc <url>', 'RPC endpoint', process.env.SSS_RPC_URL || clusterApiUrl('devnet'))
  .option('-i, --interval <ms>', 'Refresh interval', process.env.SSS_POLL_INTERVAL || '5000')
  .option('-p, --program <id>', 'Stablecoin program ID', process.env.SSS_PROGRAM_ID || 'GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y')
  .parse();

const opts = program.opts();
if (!opts.mint) {
  console.error('Usage: sss-tui --mint <MINT_ADDRESS>');
  process.exit(1);
}

// Override program ID from CLI if provided
const PROGRAM_ID_OVERRIDE = new PublicKey(opts.program);
STABLECOIN_PROGRAM_ID = PROGRAM_ID_OVERRIDE;

const connection = new Connection(opts.rpc, 'confirmed');
const mint = new PublicKey(opts.mint);
const [configPDA] = findConfigPDA(mint);
const refreshMs = parseInt(opts.interval);

// ── Blessed Screen ──────────────────────────────────────────────
const screen = blessed.screen({
  smartCSR: true,
  title: 'SSS Admin Dashboard',
  fullUnicode: true,
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen });

// ── Layout ──────────────────────────────────────────────────────
const headerBox = grid.set(0, 0, 1, 12, blessed.box, {
  content: '',
  tags: true,
  style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
  border: { type: 'line' },
});

const supplyDonut = grid.set(1, 0, 4, 4, contrib.donut, {
  label: ' Supply ',
  radius: 14,
  arcWidth: 5,
  remainColor: 'black',
  yPadding: 1,
  border: { type: 'line', fg: 'cyan' },
});

const configTable = grid.set(1, 4, 4, 4, contrib.table, {
  label: ' Configuration ',
  keys: true,
  fg: 'white',
  columnSpacing: 2,
  columnWidth: [16, 24],
  border: { type: 'line', fg: 'cyan' },
  style: { header: { fg: 'cyan', bold: true }, cell: { fg: 'white' } },
});

const featuresBox = grid.set(1, 8, 4, 4, blessed.box, {
  label: ' Features ',
  tags: true,
  border: { type: 'line', fg: 'cyan' },
  style: { fg: 'white', border: { fg: 'cyan' } },
  padding: { left: 1, top: 0 },
});

const activityLog = grid.set(5, 0, 5, 8, contrib.log, {
  label: ' Activity Log ',
  fg: 'green',
  tags: true,
  border: { type: 'line', fg: 'cyan' },
  style: { border: { fg: 'cyan' } },
  bufferLength: 50,
});

const statusBox = grid.set(5, 8, 5, 4, blessed.box, {
  label: ' Status ',
  tags: true,
  border: { type: 'line', fg: 'cyan' },
  style: { fg: 'white', border: { fg: 'cyan' } },
  padding: { left: 1, top: 0 },
});

const helpBar = grid.set(10, 0, 2, 12, blessed.box, {
  content: '',
  tags: true,
  border: { type: 'line', fg: 'gray' },
  style: { fg: 'gray', border: { fg: 'gray' } },
  padding: { left: 1 },
});

// ── Data State ──────────────────────────────────────────────────
let config = null;
let mintInfo = null;
let lastSupply = 0;
let pollCount = 0;
let lastError = null;
let supplyHistory = [];

function shortAddr(addr) {
  const s = addr.toString();
  return s.slice(0, 6) + '...' + s.slice(-4);
}

function fmtAmount(raw, decimals) {
  return (raw / Math.pow(10, decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ── Render Functions ────────────────────────────────────────────
function renderHeader() {
  const preset = config ? PRESETS[config.preset] || 'Unknown' : '...';
  const tokenLabel = config?.name ? `${config.name} (${config.symbol})` : preset;
  const status = config?.paused ? '{red-fg}⏸ PAUSED{/}' : '{green-fg}● ACTIVE{/}';
  const time = new Date().toLocaleTimeString();
  headerBox.setContent(
    `  {bold}{cyan-fg}◎ Solana Stablecoin Standard{/}  │  ${tokenLabel}  │  ${status}  │  ${time}  │  Poll #${pollCount}  │  {gray-fg}Devnet{/}`
  );
}

function renderSupply() {
  if (!config || !mintInfo) {
    supplyDonut.setData([{ label: 'Loading', percent: 0, color: 'gray' }]);
    return;
  }

  const supply = Number(mintInfo.supply);
  const minted = config.totalMinted;
  const burned = config.totalBurned;
  const supplyPct = minted > 0 ? Math.round((supply / minted) * 100) : 100;
  const burnedPct = 100 - supplyPct;

  supplyDonut.setData([
    { label: `Supply: ${fmtAmount(supply, config.decimals)}`, percent: supplyPct, color: 'green' },
    { label: `Burned: ${fmtAmount(burned, config.decimals)}`, percent: burnedPct || 1, color: 'red' },
  ]);
}

function renderConfig() {
  if (!config) {
    configTable.setData({ headers: ['Field', 'Value'], data: [['Loading...', '...']] });
    return;
  }

  const data = [
    ['Preset', PRESETS[config.preset] || 'Unknown'],
    ['Name', config.name || '—'],
    ['Symbol', config.symbol || '—'],
    ['Authority', shortAddr(config.authority)],
    ['Mint', shortAddr(config.mint)],
    ['Decimals', config.decimals.toString()],
    ['Total Minted', fmtAmount(config.totalMinted, config.decimals)],
    ['Total Burned', fmtAmount(config.totalBurned, config.decimals)],
    ['Paused', config.paused ? 'YES' : 'No'],
  ];

  configTable.setData({ headers: ['Field', 'Value'], data });
}

function renderFeatures() {
  if (!config) {
    featuresBox.setContent('{gray-fg}Loading...{/}');
    return;
  }

  const f = config.features;
  const line = (name, enabled) =>
    enabled ? `{green-fg}✓{/} ${name}` : `{gray-fg}✗ ${name}{/}`;

  featuresBox.setContent([
    line('Mint', f.canMint),
    line('Burn', f.canBurn),
    line('Freeze', f.canFreeze),
    line('Pause', f.canPause),
    line('Roles', f.hasRoles),
    line('Blacklist', f.hasBlacklist),
    line('Seize', f.hasSeize),
    line('Transfer Hook', f.hasTransferHook),
  ].join('\n'));
}

function renderStatus() {
  const supply = mintInfo ? Number(mintInfo.supply) : 0;
  const delta = supply - lastSupply;
  const deltaStr = delta > 0 ? `{green-fg}+${fmtAmount(delta, config?.decimals || 6)}{/}` :
                   delta < 0 ? `{red-fg}${fmtAmount(delta, config?.decimals || 6)}{/}` :
                   '{gray-fg}No change{/}';

  const lines = [
    `{bold}Live Supply{/}`,
    `${fmtAmount(supply, config?.decimals || 6)}`,
    '',
    `{bold}Since Last Poll{/}`,
    deltaStr,
    '',
    `{bold}Mint Authority{/}`,
    mintInfo?.mintAuthority ? shortAddr(new PublicKey(mintInfo.mintAuthority)) : '—',
    '',
    `{bold}Freeze Authority{/}`,
    mintInfo?.freezeAuthority ? shortAddr(new PublicKey(mintInfo.freezeAuthority)) : '—',
  ];

  if (lastError) {
    lines.push('', `{red-fg}Error: ${lastError}{/}`);
  }

  statusBox.setContent(lines.join('\n'));
}

function renderHelp() {
  helpBar.setContent(
    '{bold}Keybindings:{/}  {cyan-fg}r{/} Refresh  │  {cyan-fg}l{/} View Log  │  {cyan-fg}c{/} Check Address  │  {cyan-fg}q{/}/Esc Quit\n' +
    `{gray-fg}Mint: ${mint.toBase58()}{/}`
  );
}

function renderAll() {
  renderHeader();
  renderSupply();
  renderConfig();
  renderFeatures();
  renderStatus();
  renderHelp();
  screen.render();
}

// ── Data Fetching ───────────────────────────────────────────────
async function fetchData() {
  pollCount++;
  lastError = null;

  try {
    // Fetch config
    const configInfo = await connection.getAccountInfo(configPDA);
    if (configInfo) {
      config = parseConfig(configInfo.data);
    }

    // Fetch mint info
    const mInfo = await getMint(connection, mint, undefined, TOKEN_2022_PROGRAM_ID);
    const prevSupply = mintInfo ? Number(mintInfo.supply) : 0;
    mintInfo = {
      supply: mInfo.supply,
      decimals: mInfo.decimals,
      mintAuthority: mInfo.mintAuthority?.toBase58(),
      freezeAuthority: mInfo.freezeAuthority?.toBase58(),
    };

    // Track supply changes
    const newSupply = Number(mInfo.supply);
    if (prevSupply > 0 && newSupply !== prevSupply) {
      const diff = newSupply - prevSupply;
      const action = diff > 0 ? '{green-fg}MINT{/}' : '{red-fg}BURN{/}';
      activityLog.log(`${new Date().toLocaleTimeString()} │ ${action} │ ${fmtAmount(Math.abs(diff), config?.decimals || 6)} tokens`);
    }

    lastSupply = prevSupply;
  } catch (e) {
    lastError = e.message?.slice(0, 60);
    activityLog.log(`{red-fg}${new Date().toLocaleTimeString()} │ ERROR │ ${lastError}{/}`);
  }

  renderAll();
}

// ── Input Handling ──────────────────────────────────────────────
screen.key(['q', 'C-c', 'escape'], () => {
  process.exit(0);
});

screen.key(['r'], () => {
  activityLog.log(`{cyan-fg}${new Date().toLocaleTimeString()} │ Manual refresh triggered{/}`);
  fetchData();
});

screen.key(['c'], () => {
  // Prompt for address to check blacklist
  const prompt = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 8,
    border: { type: 'line', fg: 'cyan' },
    style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    label: ' Check Blacklist Status ',
  });

  prompt.input('Enter wallet address:', '', async (err, value) => {
    if (err || !value) return;
    try {
      const user = new PublicKey(value.trim());
      const [blPDA] = findBlacklistPDA(mint, user);
      const info = await connection.getAccountInfo(blPDA);
      if (info) {
        activityLog.log(`{red-fg}${new Date().toLocaleTimeString()} │ BLACKLIST │ ${shortAddr(user)} is BLACKLISTED{/}`);
      } else {
        activityLog.log(`{green-fg}${new Date().toLocaleTimeString()} │ BLACKLIST │ ${shortAddr(user)} is CLEAR{/}`);
      }
    } catch {
      activityLog.log(`{yellow-fg}${new Date().toLocaleTimeString()} │ Invalid address{/}`);
    }
    screen.render();
  });
});

// ── Bootstrap ───────────────────────────────────────────────────
activityLog.log(`{cyan-fg}Starting SSS Admin TUI...{/}`);
activityLog.log(`{gray-fg}Mint: ${mint.toBase58()}{/}`);
activityLog.log(`{gray-fg}Config PDA: ${configPDA.toBase58()}{/}`);
activityLog.log(`{gray-fg}Polling every ${refreshMs / 1000}s{/}`);
activityLog.log('');

renderAll();
fetchData();
setInterval(fetchData, refreshMs);
