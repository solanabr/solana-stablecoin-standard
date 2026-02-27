/**
 * SSS INSTITUTIONAL TERMINAL [BETA]
 *
 * To run:
 * 1. npm install
 * 2. Maximize your terminal window.
 * 3. node admin_tui.js [--rpc URL] [--mint MINT_ADDRESS]
 */

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { Connection, PublicKey } = require('@solana/web3.js');
const { BorshAccountsCoder } = require('@coral-xyz/anchor');
const idl = require('./idl/sss_token.json');

// --- CLI ARGS ---
const args = process.argv.slice(2);
const rpcIdx = args.indexOf('--rpc');
const mintIdx = args.indexOf('--mint');
const RPC_URL = rpcIdx >= 0 ? args[rpcIdx + 1] : (process.env.RPC_URL || 'https://api.devnet.solana.com');
const MINT = mintIdx >= 0 ? args[mintIdx + 1] : (process.env.MINT || '9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv');
const PROGRAM_ID = '5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4';

const connection = new Connection(RPC_URL, 'confirmed');
const coder = new BorshAccountsCoder(idl);

// --- 1. SCREEN SETUP ---
const screen = blessed.screen({
  smartCSR: true,
  title: 'SSS | Institutional Stablecoin Operator',
  cursor: { artificial: true, shape: 'block', blink: true, color: 'white' }
});

const colors = {
  bg: 'black',
  text: '#e0e0e0',
  accent: '#ffb300',
  secondary: '#00bcd4',
  border: '#424242',
  danger: '#e53935',
  success: '#43a047'
};

// --- 2. PDA HELPERS ---
function getConfigPda(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('config'), new PublicKey(mint).toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

function getRoleRegistryPda(configPda) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('roles'), configPda.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

function getReserveAttestationPda(configPda, index) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('reserve'), configPda.toBuffer(), buf],
    new PublicKey(PROGRAM_ID)
  );
}

// --- 3. DATA FETCHING ---
async function fetchConfig(mint) {
  try {
    const [configPda] = getConfigPda(mint);
    const info = await connection.getAccountInfo(configPda);
    if (!info) return null;
    const decoded = coder.decode('StablecoinConfig', info.data);
    return {
      name: decoded.name,
      symbol: decoded.symbol,
      uri: decoded.uri,
      decimals: decoded.decimals,
      preset: Object.keys(decoded.preset)[0],
      enablePermanentDelegate: decoded.enablePermanentDelegate,
      enableTransferHook: decoded.enableTransferHook,
      defaultAccountFrozen: decoded.defaultAccountFrozen,
      enableConfidentialTransfers: decoded.enableConfidentialTransfers,
      isPaused: decoded.isPaused,
      totalMinted: Number(decoded.totalMinted),
      totalBurned: Number(decoded.totalBurned),
      currentSupply: Number(decoded.totalMinted) - Number(decoded.totalBurned),
      attestationIndex: Number(decoded.reserveAttestationIndex),
      auditLogIndex: Number(decoded.auditLogIndex),
      masterAuthority: decoded.masterAuthority.toBase58(),
      mint: decoded.mint.toBase58(),
      createdAt: Number(decoded.createdAt),
      updatedAt: Number(decoded.updatedAt),
    };
  } catch (e) {
    return null;
  }
}

async function fetchRoles(configPda) {
  try {
    const [rolesPda] = getRoleRegistryPda(configPda);
    const info = await connection.getAccountInfo(rolesPda);
    if (!info) return null;
    const decoded = coder.decode('RoleRegistry', info.data);
    return {
      masterAuthority: decoded.masterAuthority.toBase58(),
      pauser: decoded.pauser.toBase58(),
      blacklister: decoded.blacklister.toBase58(),
      seizer: decoded.seizer.toBase58(),
    };
  } catch (e) {
    return null;
  }
}

async function fetchMinters(configPda) {
  try {
    const programId = new PublicKey(PROGRAM_ID);
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: 113 },
        { memcmp: { offset: 9, bytes: configPda.toBase58() } }
      ]
    });
    return accounts.map(({ pubkey, account }) => {
      try {
        const decoded = coder.decode('MinterInfo', account.data);
        return {
          address: decoded.minter.toBase58(),
          isActive: decoded.isActive,
          mintQuota: Number(decoded.mintQuota),
          totalMinted: Number(decoded.totalMinted),
          remaining: Number(decoded.mintQuota) - Number(decoded.totalMinted),
          createdAt: Number(decoded.createdAt),
        };
      } catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function fetchBlacklist(configPda) {
  try {
    const programId = new PublicKey(PROGRAM_ID);
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 9, bytes: configPda.toBase58() } }
      ]
    });
    const results = [];
    for (const { account } of accounts) {
      try {
        const decoded = coder.decode('BlacklistEntry', account.data);
        results.push({
          address: decoded.blockedAddress.toBase58(),
          reason: decoded.reason,
          blacklistedBy: decoded.blacklistedBy.toBase58(),
          timestamp: Number(decoded.blacklistedAt),
        });
      } catch { /* not a blacklist entry */ }
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function fetchAttestations(configPda, count) {
  const results = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    try {
      const [pda] = getReserveAttestationPda(configPda, i);
      const info = await connection.getAccountInfo(pda);
      if (!info) continue;
      const decoded = coder.decode('ReserveAttestation', info.data);
      results.push({
        index: Number(decoded.index),
        reserveHash: '0x' + Buffer.from(decoded.reserveHash).toString('hex').slice(0, 8) + '...',
        totalReservesUsd: Number(decoded.totalReservesUsd),
        totalOutstanding: Number(decoded.totalOutstanding),
        attestedBy: decoded.attestedBy.toBase58(),
        uri: decoded.attestationUri,
        timestamp: Number(decoded.timestamp),
      });
    } catch { /* skip */ }
  }
  return results;
}

async function fetchHolders(mint) {
  try {
    const mintPk = new PublicKey(mint);
    const result = await connection.getTokenLargestAccounts(mintPk);
    const total = result.value.reduce((sum, a) => sum + (a.uiAmount || 0), 0);
    return result.value.map((acct, i) => ({
      rank: i + 1,
      address: acct.address.toBase58(),
      balance: acct.uiAmount || 0,
      pct: total > 0 ? ((acct.uiAmount || 0) / total * 100).toFixed(1) : '0.0',
    }));
  } catch (e) {
    return [];
  }
}

async function fetchTransactions(address, limit) {
  try {
    const sigs = await connection.getSignaturesForAddress(address, { limit });
    return sigs.map(s => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      err: s.err,
    }));
  } catch (e) {
    return [];
  }
}

// --- 4. LIVE DATA STATE ---
let liveData = {
  config: null,
  roles: null,
  minters: [],
  blacklist: [],
  attestations: [],
  holders: [],
  transactions: [],
  lastRefresh: null,
  error: null,
  loading: false,
};

const REFRESH_INTERVAL = 10000;
let refreshTimer = null;
let nextRefreshAt = null;

async function refreshData() {
  liveData.loading = true;
  updateStatusBar();
  screen.render();
  try {
    const [configPda] = getConfigPda(MINT);

    const [config, roles, minters, transactions] = await Promise.all([
      fetchConfig(MINT),
      fetchRoles(configPda),
      fetchMinters(configPda),
      fetchTransactions(configPda, 20),
    ]);

    liveData.config = config;
    liveData.roles = roles;
    liveData.minters = minters;
    liveData.transactions = transactions;

    // Holders fetch separately (different address)
    try {
      const mintPk = new PublicKey(MINT);
      const result = await connection.getTokenLargestAccounts(mintPk);
      const total = result.value.reduce((sum, a) => sum + (a.uiAmount || 0), 0);
      liveData.holders = result.value.map((acct, i) => ({
        rank: i + 1,
        address: acct.address.toBase58(),
        balance: acct.uiAmount || 0,
        pct: total > 0 ? ((acct.uiAmount || 0) / total * 100).toFixed(1) : '0.0',
      }));
    } catch { liveData.holders = []; }

    if (config) {
      liveData.attestations = await fetchAttestations(configPda, config.attestationIndex);
      liveData.blacklist = await fetchBlacklist(configPda);

      // Update global state
      state.config.name = config.name;
      state.config.symbol = config.symbol;
      state.config.decimals = config.decimals;
      state.config.preset = config.preset;
      state.isPaused = config.isPaused;
      state.supply = {
        current: config.currentSupply,
        minted: config.totalMinted,
        burned: config.totalBurned,
      };
      state.mintAddress = config.mint;
    }

    liveData.lastRefresh = new Date();
    liveData.error = null;
    nextRefreshAt = Date.now() + REFRESH_INTERVAL;
  } catch (err) {
    liveData.error = err.message;
  } finally {
    liveData.loading = false;
    updateTopNav();
    updateStatusBar();
    renderTabContent();
  }
}

function startAutoRefresh() {
  refreshData();
  refreshTimer = setInterval(refreshData, REFRESH_INTERVAL);
}

// --- 5. GLOBAL STATE ---
let state = {
  wallet: 'Read-Only',
  config: { preset: 'UNINITIALIZED', name: '', symbol: '', decimals: 6 },
  mintAddress: MINT,
  isPaused: false,
  supply: { current: 0, minted: 0, burned: 0 },
  activeTab: 0,
  frozenAccounts: [],
};

// --- 6. HELPERS ---
function getContentBounds() {
  return {
    top: 6,
    left: 27,
    width: screen.width - 29,
    height: screen.height - 10,
  };
}

function showMessage(title, text, timeout) {
  timeout = timeout || 3000;
  const msg = blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '50%',
    height: 'shrink',
    border: { type: 'line', fg: colors.accent },
    label: ` ${title} `,
    style: { bg: colors.bg, fg: colors.text, border: { fg: colors.accent } },
    tags: true,
  });
  msg.display(text, timeout, () => {
    msg.destroy();
    screen.render();
  });
  screen.render();
}

function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || 'N/A';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function formatTimestamp(ts) {
  if (!ts) return 'N/A';
  const d = new Date(ts * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function formatUsd(amount, decimals) {
  decimals = decimals || 6;
  return (amount / Math.pow(10, decimals)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- 7. UI CONTAINERS ---

// A. Splash Screen
const splashScreen = blessed.box({
  parent: screen,
  top: 'center', left: 'center', width: '60%', height: '50%',
  style: { bg: colors.bg, fg: colors.text },
  hidden: false
});

// B. Preset Picker Screen
const presetScreen = blessed.box({
  parent: screen,
  top: 'center', left: 'center', width: '80%', height: '60%',
  border: { type: 'line', fg: colors.border },
  style: { bg: colors.bg, fg: colors.text },
  hidden: true
});

// C. Main Dashboard
const dashContainer = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: '100%', hidden: true });

const topNav = blessed.box({
  parent: dashContainer, top: 0, left: 0, width: '100%', height: 3,
  border: { type: 'line', fg: colors.border },
  style: { bg: colors.bg, fg: colors.text },
  content: ' Loading Network Data...',
  tags: true
});

const TAB_ITEMS = [
  '01. Overview',
  '02. Supply Ops',
  '03. Blacklist',
  '04. Attestations',
  '05. Roles & Access',
  '06. Minters',
  '07. Freeze / Thaw',
  '08. Token Holders',
  '09. Transfer History',
  '10. Config & Settings',
  '11. Compliance',
  '12. System Logs',
];

const sideMenu = blessed.list({
  parent: dashContainer, top: 3, left: 0, width: 25, height: '100%-4',
  border: { type: 'line', fg: colors.border },
  style: { bg: colors.bg, fg: colors.text, selected: { bg: colors.accent, fg: 'black', bold: true } },
  keys: true, mouse: true,
  items: TAB_ITEMS,
});

const mainContent = blessed.box({
  parent: dashContainer, top: 3, left: 25, width: '100%-25', height: '100%-4',
  border: { type: 'line', fg: colors.border },
  style: { bg: colors.bg, fg: colors.text }
});

const statusBar = blessed.box({
  parent: dashContainer, bottom: 0, left: 0, width: '100%', height: 1,
  style: { bg: colors.accent, fg: 'black', bold: true },
  content: ' STATUS: CONNECTING...'
});

// --- 8. STATUS BAR ---
function updateStatusBar() {
  const mintShort = MINT.slice(0, 4) + '...' + MINT.slice(-4);
  const lastTime = liveData.lastRefresh ? liveData.lastRefresh.toLocaleTimeString() : '--:--:--';
  const countdown = nextRefreshAt ? Math.max(0, Math.round((nextRefreshAt - Date.now()) / 1000)) : '?';
  const loadingStr = liveData.loading ? 'SYNCING' : 'LIVE';
  const errStr = liveData.error ? ' | ERR: ' + liveData.error.slice(0, 30) : '';
  const pauseStr = state.isPaused ? ' | PAUSED' : '';

  statusBar.setContent(
    ` STATUS: ${loadingStr} | RPC: DEVNET | MINT: ${mintShort} | Last: ${lastTime} | Next: ${countdown}s${pauseStr}${errStr} | [Q] Quit [TAB] Nav [R] Refresh`
  );
}

function updateTopNav() {
  const name = state.config.name || 'Unknown';
  const symbol = state.config.symbol || '???';
  const preset = state.config.preset || 'N/A';
  const mintShort = shortAddr(state.mintAddress);

  topNav.setContent(
    ` {bold}ASSET:{/bold} ${name} (${symbol}) | ` +
    `{bold}MINT:{/bold} ${mintShort} | ` +
    `{bold}PRESET:{/bold} ${preset} | ` +
    `{bold}STATUS:{/bold} ${state.isPaused ? '{red-fg}HALTED{/red-fg}' : '{green-fg}LIVE{/green-fg}'} | ` +
    `{bold}MODE:{/bold} Read-Only`
  );
}

// --- 9. ONBOARDING FLOW ---
function renderSplash() {
  const logo = `
   ██████╗  ██████╗  ██████╗
  ██╔════╝ ██╔════╝ ██╔════╝
  ███████╗ ███████╗ ███████╗
  ╚════██║ ╚════██║ ╚════██║
  ███████║ ███████║ ███████║
  ╚══════╝ ╚══════╝ ╚══════╝
  INSTITUTIONAL STABLECOIN STANDARD
  `;

  blessed.text({
    parent: splashScreen, top: 2, left: 'center', align: 'center',
    content: logo, style: { fg: colors.accent, bold: true }
  });

  blessed.text({
    parent: splashScreen, top: 12, left: 'center', align: 'center',
    content: 'Welcome to the SSS Terminal.\nInstitutional Stablecoin Standard for Solana.',
    style: { fg: colors.text }
  });

  const btn = blessed.button({
    parent: splashScreen, top: 16, left: 'center', width: 30, height: 3,
    content: '[ ENTER DEPLOYMENT WIZARD ]', align: 'center', valign: 'middle',
    style: { bg: colors.border, fg: colors.text, focus: { bg: colors.accent, fg: 'black' } },
    mouse: true, keys: true
  });

  btn.focus();
  btn.on('press', () => {
    splashScreen.children.slice().forEach(c => c.destroy());
    splashScreen.hide();
    presetScreen.show();
    renderPresetPicker();
  });
}

function renderPresetPicker() {
  blessed.text({
    parent: presetScreen, top: 1, left: 2,
    content: 'STEP 1: SELECT ARCHITECTURE PRESET', style: { fg: colors.accent, bold: true }
  });

  const list = blessed.list({
    parent: presetScreen, top: 4, left: 2, width: '40%', height: '80%',
    items: ['> SSS-1: Minimal Stablecoin', '> SSS-2: Compliant Stablecoin', '> SSS-3: Custom Configuration'],
    style: { selected: { bg: colors.secondary, fg: 'black', bold: true }, fg: colors.text },
    keys: true, mouse: true
  });

  const details = blessed.box({
    parent: presetScreen, top: 4, left: '45%', width: '50%', height: '80%',
    border: { type: 'line', fg: colors.border },
    padding: 1, style: { fg: colors.text }
  });

  list.on('select item', (item, index) => {
    if (index === 0) details.setContent('SSS-1: MINIMAL\n\nFor internal DAO treasuries and ecosystem settlement.\n\n+ Mint Authority\n+ Freeze Authority\n+ Metadata\n- No Transfer Hooks\n- No Seize Capabilities');
    if (index === 1) details.setContent('SSS-2: COMPLIANT (INSTITUTIONAL)\n\nFor regulated USDC/USDT-class tokens. Strict adherence.\n\n+ All SSS-1 Features\n+ Permanent Delegate (Seize Capable)\n+ Transfer Hooks (On-chain Blacklist)\n+ Default Account Frozen state optional.');
    if (index === 2) details.setContent('SSS-3: CUSTOM CONFIGURATION\n\nFull control over every extension and authority.\n\n+ All SSS-2 Features\n+ Custom Transfer Hook Logic\n+ Configurable Freeze Defaults\n+ Custom Fee Structures\n+ Manual Authority Assignment');
    screen.render();
  });

  list.on('select', (item, index) => {
    const presets = ['SSS1', 'SSS2', 'SSS3'];
    state.config.preset = presets[index] || 'SSS3';
    state.config.name = 'Loading...';
    state.config.symbol = '...';

    presetScreen.children.slice().forEach(c => c.destroy());
    presetScreen.hide();
    dashContainer.show();
    initDashboard();
  });

  list.focus();
  list.emit('select item', null, 0);
}

// --- 10. DASHBOARD INIT ---
function initDashboard() {
  updateTopNav();
  updateStatusBar();
  sideMenu.focus();

  sideMenu.on('select', (item, index) => {
    state.activeTab = index;
    renderTabContent();
  });

  screen.key(['tab'], () => {
    if (screen.focused === sideMenu) {
      const firstChild = mainContent.children[0];
      if (firstChild && firstChild.focus) firstChild.focus();
    } else {
      sideMenu.focus();
    }
    screen.render();
  });

  // Quick tab switching: 1-9, 0, -, =
  const tabKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
  tabKeys.forEach((key, idx) => {
    screen.key([key], () => {
      if (screen.focused && screen.focused.type === 'textbox') return;
      state.activeTab = idx;
      sideMenu.select(idx);
      renderTabContent();
    });
  });

  screen.key(['r'], () => {
    if (screen.focused && screen.focused.type === 'textbox') return;
    refreshData();
  });

  startAutoRefresh();
  renderTabContent();
}

// --- 11. TAB SYSTEM ---
let screenContribWidgets = [];

function clearMainContent() {
  mainContent.children.slice().forEach(child => child.destroy());
  screenContribWidgets.forEach(w => { try { screen.remove(w); } catch(e) {} });
  screenContribWidgets = [];
}

function renderTabContent() {
  clearMainContent();
  const index = state.activeTab;

  blessed.text({
    parent: mainContent, top: 0, left: 2,
    content: `[ ${TAB_ITEMS[index].toUpperCase()} ]`,
    style: { fg: colors.accent, bold: true }
  });

  switch (index) {
    case 0: renderOverviewTab(); break;
    case 1: renderSupplyTab(); break;
    case 2: renderBlacklistTab(); break;
    case 3: renderAttestationsTab(); break;
    case 4: renderRolesTab(); break;
    case 5: renderMintersTab(); break;
    case 6: renderFreezeThawTab(); break;
    case 7: renderTokenHoldersTab(); break;
    case 8: renderTransferHistoryTab(); break;
    case 9: renderConfigTab(); break;
    case 10: renderComplianceTab(); break;
    case 11: renderSystemLogsTab(); break;
    default: renderPlaceholderTab();
  }

  screen.render();
}

// --- 12. TAB RENDERERS ---

// === TAB 0: OVERVIEW ===
function renderOverviewTab() {
  const cfg = liveData.config;
  const dec = cfg ? cfg.decimals : 6;

  // Supply Widget
  const supplyBox = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '45%', height: 8,
    border: { type: 'line', fg: colors.border },
    label: ' Total Supply '
  });

  const currentSupply = cfg ? formatUsd(cfg.currentSupply, dec) : '...';
  const totalMinted = cfg ? formatUsd(cfg.totalMinted, dec) : '...';
  const totalBurned = cfg ? formatUsd(cfg.totalBurned, dec) : '...';

  blessed.text({
    parent: supplyBox, top: 1, left: 2, tags: true,
    content:
      `{bold}Current:{/bold}  ${currentSupply}\n` +
      `{green-fg}Minted:{/green-fg}   ${totalMinted}\n` +
      `{red-fg}Burned:{/red-fg}   ${totalBurned}`,
    style: { fg: colors.text }
  });

  // Features Widget
  const featuresBox = blessed.box({
    parent: mainContent, top: 2, left: '50%', width: '45%', height: 8,
    border: { type: 'line', fg: colors.border },
    label: ' Protocol Features ',
    tags: true
  });

  const yn = (v) => v ? '{green-fg}ENABLED{/green-fg}' : '{red-fg}DISABLED{/red-fg}';
  const ftext = cfg
    ? ` Permanent Delegate : ${yn(cfg.enablePermanentDelegate)}\n` +
      ` Transfer Hooks     : ${yn(cfg.enableTransferHook)}\n` +
      ` Conf. Transfers    : ${yn(cfg.enableConfidentialTransfers)}\n` +
      ` Default Frozen     : ${yn(cfg.defaultAccountFrozen)}`
    : ' Loading feature flags...';

  blessed.text({ parent: featuresBox, top: 1, left: 2, content: ftext, tags: true, style: { fg: colors.text } });

  // Sparkline: mint/burn activity from recent transactions
  const sparkBox = blessed.box({
    parent: mainContent, top: 11, left: 2, width: '95%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Recent Activity (last 7 data points) ',
    style: { fg: colors.text }
  });

  const txCount = liveData.transactions.length;
  const points = [];
  for (let i = 0; i < 7; i++) {
    points.push(Math.max(1, Math.floor(txCount / 7) + (i < txCount % 7 ? 1 : 0)));
  }
  const blocks = [' ', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
  const maxP = Math.max(...points, 1);
  let sparkline = ' ';
  points.forEach(p => {
    const idx = Math.round((p / maxP) * (blocks.length - 1));
    sparkline += `{${colors.accent}-fg}${blocks[idx]}{/${colors.accent}-fg} `;
  });

  blessed.text({
    parent: sparkBox, top: 1, left: 2, tags: true,
    content: sparkline + `\n\n Transactions fetched: ${txCount}`,
    style: { fg: colors.text }
  });

  // Summary stats
  const statsBox = blessed.box({
    parent: mainContent, top: 19, left: 2, width: '95%', height: '100%-20',
    border: { type: 'line', fg: colors.border },
    label: ' Quick Stats ',
    tags: true
  });

  const minterCount = liveData.minters.length;
  const blCount = liveData.blacklist.length;
  const attCount = liveData.attestations.length;
  const holderCount = liveData.holders.length;

  blessed.text({
    parent: statsBox, top: 1, left: 2, tags: true,
    content:
      ` {bold}Minters:{/bold} ${minterCount}  |  ` +
      `{bold}Blacklisted:{/bold} ${blCount}  |  ` +
      `{bold}Attestations:{/bold} ${attCount}  |  ` +
      `{bold}Token Holders:{/bold} ${holderCount}  |  ` +
      `{bold}Preset:{/bold} ${cfg ? cfg.preset : 'N/A'}`,
    style: { fg: colors.text }
  });
}

// === TAB 1: SUPPLY OPS ===
function renderSupplyTab() {
  const cfg = liveData.config;
  const dec = cfg ? cfg.decimals : 6;

  // Supply summary at top
  const summaryBox = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '95%', height: 4,
    border: { type: 'line', fg: colors.border },
    label: ' Supply Summary ', tags: true
  });

  const current = cfg ? formatUsd(cfg.currentSupply, dec) : '...';
  const minted = cfg ? formatUsd(cfg.totalMinted, dec) : '...';
  const burned = cfg ? formatUsd(cfg.totalBurned, dec) : '...';
  blessed.text({
    parent: summaryBox, top: 1, left: 2, tags: true,
    content: ` Current: {bold}${current}{/bold}  |  Minted: {green-fg}${minted}{/green-fg}  |  Burned: {red-fg}${burned}{/red-fg}`,
    style: { fg: colors.text }
  });

  // Mint Form
  const mintForm = blessed.form({
    parent: mainContent, top: 7, left: 2, width: '45%', height: 12,
    border: { type: 'line', fg: colors.border }, label: ' Execute Mint '
  });
  blessed.text({ parent: mintForm, top: 1, left: 2, content: 'Recipient Address:' });
  const addrInput = blessed.textbox({
    parent: mintForm, name: 'recipientAddress', top: 2, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  blessed.text({ parent: mintForm, top: 4, left: 2, content: 'Amount:' });
  const amtInput = blessed.textbox({
    parent: mintForm, name: 'amount', top: 5, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  const mintSubmitBtn = blessed.button({
    parent: mintForm, top: 8, left: 2, width: 20, height: 1,
    content: ' [ SUBMIT MINT ] ', style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });

  mintSubmitBtn.on('press', () => {
    showMessage('Read-Only', 'Mint operations require a connected wallet.\nThis TUI is in read-only mode.', 3000);
  });

  // Burn Form
  const burnForm = blessed.form({
    parent: mainContent, top: 7, left: '50%', width: '45%', height: 12,
    border: { type: 'line', fg: colors.danger }, label: ' Execute Burn '
  });
  blessed.text({ parent: burnForm, top: 1, left: 2, content: 'Source Account:' });
  blessed.textbox({
    parent: burnForm, name: 'sourceAddress', top: 2, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  blessed.text({ parent: burnForm, top: 4, left: 2, content: 'Burn Amount:' });
  blessed.textbox({
    parent: burnForm, name: 'burnAmount', top: 5, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  const burnSubmitBtn = blessed.button({
    parent: burnForm, top: 8, left: 2, width: 20, height: 1,
    content: ' [ SUBMIT BURN ] ', style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });

  burnSubmitBtn.on('press', () => {
    showMessage('Read-Only', 'Burn operations require a connected wallet.\nThis TUI is in read-only mode.', 3000);
  });

  // Audit Trail
  const logBox = blessed.box({
    parent: mainContent, top: 20, left: 2, width: '95%', height: '100%-21',
    border: { type: 'line', fg: colors.border }, label: ' Recent Transactions ',
    tags: true
  });

  let logContent = '';
  const txs = liveData.transactions.slice(0, 8);
  if (txs.length === 0) {
    logContent = ' No transactions found.';
  } else {
    txs.forEach(tx => {
      const sig = tx.signature.slice(0, 12) + '...';
      const time = tx.blockTime ? formatTimestamp(tx.blockTime) : 'pending';
      const status = tx.err ? '{red-fg}FAIL{/red-fg}' : '{green-fg}OK{/green-fg}';
      logContent += ` ${status} ${sig}  Slot: ${tx.slot}  ${time}\n`;
    });
  }
  blessed.text({
    parent: logBox, top: 1, left: 1, tags: true,
    content: logContent, style: { fg: colors.text }
  });
}

// === TAB 2: BLACKLIST ===
function renderBlacklistTab() {
  const b = getContentBounds();

  const table = contrib.table({
    top: b.top, left: b.left, width: b.width, height: Math.floor(b.height * 0.55),
    keys: true, interactive: true,
    fg: colors.text, selectedFg: 'black', selectedBg: colors.accent,
    label: ' SSS-2 Enforced Blacklist ', border: { type: 'line', fg: colors.border },
    columnSpacing: 3, columnWidth: [14, 30, 20, 14]
  });
  screen.append(table);
  screenContribWidgets.push(table);

  const entries = liveData.blacklist;
  const data = entries.length > 0
    ? entries.map(e => [
        shortAddr(e.address),
        e.reason.slice(0, 28),
        formatTimestamp(e.timestamp),
        shortAddr(e.blacklistedBy),
      ])
    : [['No entries', '', '', '']];

  table.setData({
    headers: ['ADDRESS', 'REASON', 'DATE ADDED', 'AUTHORITY'],
    data: data,
  });

  table.rows.on('select', (item, index) => {
    if (entries[index]) {
      const e = entries[index];
      showMessage('Blacklist Entry', `Address: ${e.address}\nReason: ${e.reason}\nBy: ${e.blacklistedBy}\nAt: ${formatTimestamp(e.timestamp)}`, 5000);
    }
  });

  // Add to blacklist form
  const formTop = b.top + Math.floor(b.height * 0.55) + 1;
  const formBox = blessed.form({
    parent: mainContent, top: formTop - 3, left: 2, width: '95%', height: 8,
    border: { type: 'line', fg: colors.danger }, label: ' Add to Blacklist '
  });
  blessed.text({ parent: formBox, top: 1, left: 2, content: 'Address:' });
  blessed.textbox({
    parent: formBox, name: 'blAddress', top: 1, left: 12, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  blessed.text({ parent: formBox, top: 3, left: 2, content: 'Reason:' });
  blessed.textbox({
    parent: formBox, name: 'blReason', top: 3, left: 12, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  const blSubmit = blessed.button({
    parent: formBox, top: 5, left: 2, width: 22, height: 1,
    content: ' [ ADD TO BLACKLIST ] ', style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  blSubmit.on('press', () => {
    showMessage('Read-Only', 'Blacklist operations require a connected wallet.', 3000);
  });

  table.focus();
}

// === TAB 3: ATTESTATIONS ===
function renderAttestationsTab() {
  const b = getContentBounds();

  const table = contrib.table({
    top: b.top, left: b.left, width: b.width, height: Math.floor(b.height * 0.6),
    keys: true, interactive: true,
    fg: colors.text, selectedFg: 'black', selectedBg: colors.accent,
    label: ' Reserve Attestations (GENIUS Act) ', border: { type: 'line', fg: colors.border },
    columnSpacing: 2, columnWidth: [8, 15, 18, 18, 10, 25]
  });
  screen.append(table);
  screenContribWidgets.push(table);

  const atts = liveData.attestations;
  const dec = liveData.config ? liveData.config.decimals : 6;
  const data = atts.length > 0
    ? atts.map(a => {
        const ratio = a.totalOutstanding > 0
          ? ((a.totalReservesUsd / a.totalOutstanding) * 100).toFixed(1) + '%'
          : 'N/A';
        return [
          String(a.index).padStart(3, '0'),
          a.reserveHash,
          '$' + formatUsd(a.totalReservesUsd, dec),
          '$' + formatUsd(a.totalOutstanding, dec),
          ratio,
          a.uri.length > 22 ? a.uri.slice(0, 22) + '...' : a.uri,
        ];
      })
    : [['No attestations', '', '', '', '', '']];

  table.setData({
    headers: ['INDEX', 'HASH', 'RESERVES (USD)', 'OUTSTANDING', 'RATIO', 'URI'],
    data: data,
  });

  table.rows.on('select', (item, index) => {
    if (atts[index]) {
      const a = atts[index];
      showMessage('Attestation Detail', `Index: ${a.index}\nHash: ${a.reserveHash}\nReserves: $${formatUsd(a.totalReservesUsd, dec)}\nOutstanding: $${formatUsd(a.totalOutstanding, dec)}\nBy: ${a.attestedBy}\nURI: ${a.uri}\nTime: ${formatTimestamp(a.timestamp)}`, 6000);
    }
  });

  // Collateral Gauge
  const gaugeTop = b.top + Math.floor(b.height * 0.6) + 1;
  const gauge = contrib.gauge({
    top: gaugeTop, left: b.left, width: b.width, height: 5,
    label: ' Current Collateralization Ratio ', border: { type: 'line', fg: colors.border },
    stroke: 'green', fill: 'white'
  });
  screen.append(gauge);
  screenContribWidgets.push(gauge);

  let pct = 100;
  if (atts.length > 0) {
    const latest = atts[atts.length - 1];
    if (latest.totalOutstanding > 0) {
      pct = Math.min(100, Math.round((latest.totalReservesUsd / latest.totalOutstanding) * 100));
    }
  }
  gauge.setPercent(pct);
  table.focus();
}

// === TAB 4: ROLES & ACCESS ===
function renderRolesTab() {
  const b = getContentBounds();

  const table = contrib.table({
    top: b.top, left: b.left, width: b.width, height: Math.floor(b.height * 0.5),
    keys: true, interactive: true,
    fg: colors.text, selectedFg: 'black', selectedBg: colors.accent,
    label: ' Role Registry ', border: { type: 'line', fg: colors.border },
    columnSpacing: 3, columnWidth: [20, 48, 12]
  });
  screen.append(table);
  screenContribWidgets.push(table);

  const roles = liveData.roles;
  const data = roles
    ? [
        ['Master Authority', roles.masterAuthority, 'ACTIVE'],
        ['Pauser', roles.pauser, 'ACTIVE'],
        ['Blacklister', roles.blacklister, 'ACTIVE'],
        ['Seizer', roles.seizer, 'ACTIVE'],
      ]
    : [['Loading...', '', '']];

  table.setData({
    headers: ['ROLE', 'ADDRESS', 'STATUS'],
    data: data,
  });

  table.rows.on('select', (item, index) => {
    const roleNames = ['Master Authority', 'Pauser', 'Blacklister', 'Seizer'];
    const roleAddrs = roles ? [roles.masterAuthority, roles.pauser, roles.blacklister, roles.seizer] : [];
    if (roleAddrs[index]) {
      showMessage(roleNames[index], `Full Address:\n${roleAddrs[index]}`, 5000);
    }
  });

  // Update role form
  const formTop = b.top + Math.floor(b.height * 0.5) + 1;
  const formBox = blessed.form({
    parent: mainContent, top: formTop - 3, left: 2, width: '95%', height: 8,
    border: { type: 'line', fg: colors.border }, label: ' Update Role '
  });

  blessed.text({ parent: formBox, top: 1, left: 2, content: 'Role:' });
  const roleList = blessed.list({
    parent: formBox, top: 1, left: 10, width: 20, height: 4,
    items: ['Pauser', 'Blacklister', 'Seizer'],
    style: { selected: { bg: colors.secondary, fg: 'black' }, fg: colors.text },
    keys: true, mouse: true
  });

  blessed.text({ parent: formBox, top: 1, left: 35, content: 'New Address:' });
  blessed.textbox({
    parent: formBox, name: 'roleAddress', top: 1, left: 49, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });

  const roleSubmit = blessed.button({
    parent: formBox, top: 5, left: 2, width: 20, height: 1,
    content: ' [ UPDATE ROLE ] ', style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  roleSubmit.on('press', () => {
    showMessage('Read-Only', 'Role updates require a connected wallet.', 3000);
  });

  table.focus();
}

// === TAB 5: MINTERS ===
function renderMintersTab() {
  const b = getContentBounds();

  const table = contrib.table({
    top: b.top, left: b.left, width: b.width, height: Math.floor(b.height * 0.55),
    keys: true, interactive: true,
    fg: colors.text, selectedFg: 'black', selectedBg: colors.accent,
    label: ' Minter Registry ', border: { type: 'line', fg: colors.border },
    columnSpacing: 2, columnWidth: [14, 16, 16, 16, 12]
  });
  screen.append(table);
  screenContribWidgets.push(table);

  const minters = liveData.minters;
  const dec = liveData.config ? liveData.config.decimals : 6;
  const data = minters.length > 0
    ? minters.map(m => {
        const util = m.mintQuota > 0 ? ((m.totalMinted / m.mintQuota) * 100).toFixed(1) + '%' : '0%';
        return [
          shortAddr(m.address),
          formatUsd(m.mintQuota, dec),
          formatUsd(m.totalMinted, dec),
          formatUsd(m.remaining, dec),
          util,
        ];
      })
    : [['No minters', '', '', '', '']];

  table.setData({
    headers: ['ADDRESS', 'QUOTA', 'USED', 'REMAINING', 'UTILIZATION'],
    data: data,
  });

  table.rows.on('select', (item, index) => {
    if (minters[index]) {
      const m = minters[index];
      showMessage('Minter Detail', `Address: ${m.address}\nActive: ${m.isActive}\nQuota: ${formatUsd(m.mintQuota, dec)}\nUsed: ${formatUsd(m.totalMinted, dec)}\nCreated: ${formatTimestamp(m.createdAt)}`, 5000);
    }
  });

  // Add/update minter form
  const formTop = b.top + Math.floor(b.height * 0.55) + 1;
  const formBox = blessed.form({
    parent: mainContent, top: formTop - 3, left: 2, width: '95%', height: 7,
    border: { type: 'line', fg: colors.border }, label: ' Add / Update Minter '
  });
  blessed.text({ parent: formBox, top: 1, left: 2, content: 'Address:' });
  blessed.textbox({
    parent: formBox, name: 'minterAddress', top: 1, left: 12, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  blessed.text({ parent: formBox, top: 3, left: 2, content: 'Quota:' });
  blessed.textbox({
    parent: formBox, name: 'minterQuota', top: 3, left: 12, width: '20%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  const minterSubmit = blessed.button({
    parent: formBox, top: 3, left: '40%', width: 22, height: 1,
    content: ' [ UPDATE MINTER ] ', style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  minterSubmit.on('press', () => {
    showMessage('Read-Only', 'Minter operations require a connected wallet.', 3000);
  });

  table.focus();
}

// === TAB 6: FREEZE / THAW ===
function renderFreezeThawTab() {
  // Freeze form (left)
  const freezeForm = blessed.form({
    parent: mainContent, top: 2, left: 2, width: '45%', height: 10,
    border: { type: 'line', fg: colors.danger }, label: ' Freeze Account '
  });
  blessed.text({ parent: freezeForm, top: 1, left: 2, content: 'Target Address:', style: { fg: colors.danger } });
  blessed.textbox({
    parent: freezeForm, name: 'freezeAddress', top: 2, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  blessed.text({ parent: freezeForm, top: 4, left: 2, content: 'Reason:', style: { fg: colors.danger } });
  blessed.textbox({
    parent: freezeForm, name: 'freezeReason', top: 5, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  const freezeBtn = blessed.button({
    parent: freezeForm, top: 7, left: 2, width: 22, height: 1,
    content: ' [ FREEZE ACCOUNT ] ', style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  freezeBtn.on('press', () => {
    showMessage('Read-Only', 'Freeze operations require a connected wallet.', 3000);
  });

  // Thaw form (right)
  const thawForm = blessed.form({
    parent: mainContent, top: 2, left: '50%', width: '45%', height: 10,
    border: { type: 'line', fg: colors.success }, label: ' Thaw Account '
  });
  blessed.text({ parent: thawForm, top: 1, left: 2, content: 'Target Address:', style: { fg: colors.success } });
  blessed.textbox({
    parent: thawForm, name: 'thawAddress', top: 2, left: 2, width: '90%', height: 1,
    style: { bg: colors.border, fg: colors.text }, inputOnFocus: true
  });
  const thawBtn = blessed.button({
    parent: thawForm, top: 5, left: 2, width: 22, height: 1,
    content: ' [ THAW ACCOUNT ] ', style: { bg: colors.success, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  thawBtn.on('press', () => {
    showMessage('Read-Only', 'Thaw operations require a connected wallet.', 3000);
  });

  // Frozen accounts info
  const infoBox = blessed.box({
    parent: mainContent, top: 13, left: 2, width: '95%', height: '100%-14',
    border: { type: 'line', fg: colors.border },
    label: ' Account Freeze Status ', tags: true
  });

  const cfg = liveData.config;
  const defaultFrozen = cfg ? cfg.defaultAccountFrozen : false;
  blessed.text({
    parent: infoBox, top: 1, left: 2, tags: true,
    content:
      ` Default Account State: ${defaultFrozen ? '{cyan-fg}FROZEN{/cyan-fg}' : '{green-fg}INITIALIZED{/green-fg}'}\n\n` +
      ` Note: Individual account freeze status requires per-account queries.\n` +
      ` Accounts with defaultAccountFrozen=true must be thawed before transfers.\n\n` +
      ` {bold}Tip:{/bold} Use the blacklist (Tab 3) for compliance-based restrictions.\n` +
      ` Freeze/Thaw is for individual account-level emergency controls.`,
    style: { fg: colors.text }
  });
}

// === TAB 7: TOKEN HOLDERS ===
function renderTokenHoldersTab() {
  const b = getContentBounds();

  const table = contrib.table({
    top: b.top, left: b.left, width: b.width, height: Math.floor(b.height * 0.6),
    keys: true, interactive: true,
    fg: colors.text, selectedFg: 'black', selectedBg: colors.accent,
    label: ' Token Holders (Largest Accounts) ', border: { type: 'line', fg: colors.border },
    columnSpacing: 3, columnWidth: [6, 48, 18, 10]
  });
  screen.append(table);
  screenContribWidgets.push(table);

  const holders = liveData.holders;
  const data = holders.length > 0
    ? holders.map(h => [
        '#' + h.rank,
        h.address,
        h.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }),
        h.pct + '%',
      ])
    : [['--', 'No token holders found', '', '']];

  table.setData({
    headers: ['RANK', 'ADDRESS', 'BALANCE', 'SHARE'],
    data: data,
  });

  table.rows.on('select', (item, index) => {
    if (holders[index]) {
      const h = holders[index];
      showMessage('Holder Detail', `Rank: #${h.rank}\nAddress: ${h.address}\nBalance: ${h.balance.toLocaleString()}\nShare: ${h.pct}%`, 5000);
    }
  });

  // Bar chart of top 5
  const chartBox = blessed.box({
    parent: mainContent, top: Math.floor(b.height * 0.6) + 5, left: 2, width: '95%', height: '100%-' + (Math.floor(b.height * 0.6) + 6),
    border: { type: 'line', fg: colors.border },
    label: ' Distribution (Top 5) ', tags: true
  });

  const top5 = holders.slice(0, 5);
  let barContent = '';
  const maxBal = top5.length > 0 ? Math.max(...top5.map(h => h.balance)) : 1;
  const barWidth = Math.max(10, (chartBox.width || 60) - 20);

  top5.forEach(h => {
    const barLen = Math.round((h.balance / maxBal) * Math.min(barWidth, 40));
    const bar = '\u2588'.repeat(barLen);
    barContent += ` ${shortAddr(h.address)} {${colors.accent}-fg}${bar}{/${colors.accent}-fg} ${h.pct}%\n`;
  });

  if (barContent === '') barContent = ' No holder data available.';
  blessed.text({
    parent: chartBox, top: 1, left: 1, tags: true,
    content: barContent, style: { fg: colors.text }
  });

  table.focus();
}

// === TAB 8: TRANSFER HISTORY ===
function renderTransferHistoryTab() {
  const b = getContentBounds();

  const table = contrib.table({
    top: b.top, left: b.left, width: b.width, height: b.height,
    keys: true, interactive: true,
    fg: colors.text, selectedFg: 'black', selectedBg: colors.accent,
    label: ' Transaction History ', border: { type: 'line', fg: colors.border },
    columnSpacing: 2, columnWidth: [16, 12, 22, 8]
  });
  screen.append(table);
  screenContribWidgets.push(table);

  const txs = liveData.transactions;
  const data = txs.length > 0
    ? txs.map(tx => [
        tx.signature.slice(0, 14) + '...',
        String(tx.slot),
        tx.blockTime ? formatTimestamp(tx.blockTime) : 'pending',
        tx.err ? 'FAIL' : 'OK',
      ])
    : [['No transactions', '', '', '']];

  table.setData({
    headers: ['SIGNATURE', 'SLOT', 'TIMESTAMP', 'STATUS'],
    data: data,
  });

  table.rows.on('select', (item, index) => {
    if (txs[index]) {
      const tx = txs[index];
      showMessage('Transaction Detail',
        `Signature:\n${tx.signature}\n\nSlot: ${tx.slot}\nTime: ${tx.blockTime ? formatTimestamp(tx.blockTime) : 'N/A'}\nStatus: ${tx.err ? 'FAILED' : 'SUCCESS'}`,
        6000
      );
    }
  });

  table.focus();
}

// === TAB 9: CONFIG & SETTINGS ===
function renderConfigTab() {
  const cfg = liveData.config;

  // Read-only config display (left)
  const configBox = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '50%', height: '100%-4',
    border: { type: 'line', fg: colors.border },
    label: ' On-Chain Configuration ', tags: true
  });

  const yn = (v) => v ? '{green-fg}YES{/green-fg}' : '{red-fg}NO{/red-fg}';

  if (cfg) {
    blessed.text({
      parent: configBox, top: 1, left: 2, tags: true,
      content:
        ` {bold}Name:{/bold}            ${cfg.name}\n` +
        ` {bold}Symbol:{/bold}          ${cfg.symbol}\n` +
        ` {bold}Decimals:{/bold}        ${cfg.decimals}\n` +
        ` {bold}Preset:{/bold}          ${cfg.preset}\n` +
        ` {bold}URI:{/bold}             ${cfg.uri || 'N/A'}\n` +
        `\n {bold}--- Program IDs ---{/bold}\n` +
        ` Program:  ${PROGRAM_ID}\n` +
        ` Mint:     ${cfg.mint}\n` +
        ` Authority: ${cfg.masterAuthority}\n` +
        `\n {bold}--- Feature Flags ---{/bold}\n` +
        ` Permanent Delegate:  ${yn(cfg.enablePermanentDelegate)}\n` +
        ` Transfer Hook:       ${yn(cfg.enableTransferHook)}\n` +
        ` Confidential Tx:     ${yn(cfg.enableConfidentialTransfers)}\n` +
        ` Default Frozen:      ${yn(cfg.defaultAccountFrozen)}\n` +
        ` Is Paused:           ${yn(cfg.isPaused)}\n` +
        `\n {bold}--- Stats ---{/bold}\n` +
        ` Attestation Index:  ${cfg.attestationIndex}\n` +
        ` Audit Log Index:    ${cfg.auditLogIndex}\n` +
        ` Created:            ${formatTimestamp(cfg.createdAt)}\n` +
        ` Updated:            ${formatTimestamp(cfg.updatedAt)}`,
      style: { fg: colors.text }
    });
  } else {
    blessed.text({
      parent: configBox, top: 2, left: 2,
      content: ' Loading configuration...',
      style: { fg: colors.border }
    });
  }

  // Settings info (right)
  const settingsBox = blessed.box({
    parent: mainContent, top: 2, left: '55%', width: '40%', height: '100%-4',
    border: { type: 'line', fg: colors.border },
    label: ' TUI Settings ', tags: true
  });

  blessed.text({
    parent: settingsBox, top: 1, left: 2, tags: true,
    content:
      ` {bold}--- Connection ---{/bold}\n` +
      ` RPC URL:  ${RPC_URL}\n` +
      ` Mint:     ${MINT}\n` +
      ` Mode:     Read-Only\n` +
      `\n {bold}--- Refresh ---{/bold}\n` +
      ` Interval: ${REFRESH_INTERVAL / 1000}s\n` +
      ` Last:     ${liveData.lastRefresh ? liveData.lastRefresh.toLocaleTimeString() : 'N/A'}\n` +
      `\n {bold}--- Keyboard ---{/bold}\n` +
      ` 1-9,0,-,= : Switch tabs\n` +
      ` TAB        : Toggle focus\n` +
      ` R          : Manual refresh\n` +
      ` Q / Esc    : Quit\n` +
      `\n {bold}--- CLI Usage ---{/bold}\n` +
      ` node admin_tui.js \\\n` +
      `   --rpc <URL> \\\n` +
      `   --mint <MINT_ADDR>\n` +
      `\n {bold}Note:{/bold} Config changes require\n` +
      ` a connected wallet. This TUI\n` +
      ` is read-only.`,
    style: { fg: colors.text }
  });
}

// === TAB 10: COMPLIANCE ===
function renderComplianceTab() {
  const blCount = liveData.blacklist.length;

  // Provider info card
  const providerBox = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '30%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Provider ', tags: true
  });
  blessed.text({
    parent: providerBox, top: 1, left: 2, tags: true,
    content: ` {bold}Engine:{/bold} SSS On-Chain\n {bold}Standard:{/bold} GENIUS Act\n {bold}Status:{/bold} {green-fg}ACTIVE{/green-fg}`,
    style: { fg: colors.text }
  });

  // Screening stats card
  const screeningBox = blessed.box({
    parent: mainContent, top: 2, left: '35%', width: '30%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Screening ', tags: true
  });
  blessed.text({
    parent: screeningBox, top: 1, left: 2, tags: true,
    content: ` {bold}Blacklisted:{/bold} ${blCount}\n {bold}Attestations:{/bold} ${liveData.attestations.length}\n {bold}Transfer Hook:{/bold} ${liveData.config && liveData.config.enableTransferHook ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
    style: { fg: colors.text }
  });

  // Clearance rate card
  const clearBox = blessed.box({
    parent: mainContent, top: 2, left: '68%', width: '27%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Clearance ', tags: true
  });

  const holderCount = liveData.holders.length;
  const clearRate = holderCount > 0 ? Math.round(((holderCount - blCount) / holderCount) * 100) : 100;
  blessed.text({
    parent: clearBox, top: 1, left: 2, tags: true,
    content: ` {bold}Holders:{/bold} ${holderCount}\n {bold}Flagged:{/bold} ${blCount}\n {bold}Clear Rate:{/bold} {green-fg}${clearRate}%{/green-fg}`,
    style: { fg: colors.text }
  });

  // Compliance health gauge
  const b = getContentBounds();
  const gauge = contrib.gauge({
    top: b.top + 8, left: b.left, width: b.width, height: 5,
    label: ' Compliance Health ', border: { type: 'line', fg: colors.border },
    stroke: 'green', fill: 'white'
  });
  screen.append(gauge);
  screenContribWidgets.push(gauge);

  const healthPct = Math.min(100, clearRate);
  gauge.setPercent(healthPct);

  // Screening log
  const logBox = blessed.box({
    parent: mainContent, top: 16, left: 2, width: '95%', height: '100%-17',
    border: { type: 'line', fg: colors.border },
    label: ' Screening Log ', tags: true, scrollable: true, alwaysScroll: true,
    keys: true, mouse: true,
  });

  let logContent = '';
  liveData.blacklist.forEach(entry => {
    logContent += ` {red-fg}[FLAG]{/red-fg} ${shortAddr(entry.address)} - ${entry.reason} (${formatTimestamp(entry.timestamp)})\n`;
  });

  if (liveData.holders.length > 0) {
    liveData.holders.slice(0, 5).forEach(h => {
      logContent += ` {green-fg}[CLEAR]{/green-fg} ${shortAddr(h.address)} - Balance: ${h.balance.toLocaleString()}\n`;
    });
  }

  if (!logContent) logContent = ' No screening data available.';
  blessed.text({
    parent: logBox, top: 1, left: 1, tags: true,
    content: logContent, style: { fg: colors.text }
  });
}

// === TAB 11: SYSTEM LOGS ===
function renderSystemLogsTab() {
  // Filter bar
  const filterBar = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '95%', height: 3,
    border: { type: 'line', fg: colors.border },
    label: ' Filters '
  });

  let currentFilter = 'ALL';

  const filters = ['ALL', 'INFO', 'WARN', 'TX'];
  filters.forEach((f, i) => {
    const btn = blessed.button({
      parent: filterBar, top: 0, left: 2 + i * 12, width: 10, height: 1,
      content: ` [${f}] `,
      style: {
        bg: f === currentFilter ? colors.accent : colors.border,
        fg: f === currentFilter ? 'black' : colors.text,
        focus: { bg: colors.accent, fg: 'black' }
      },
      mouse: true, keys: true
    });
    btn.on('press', () => {
      currentFilter = f;
      renderLogEntries();
    });
  });

  // Log display
  const logBox = blessed.box({
    parent: mainContent, top: 6, left: 2, width: '95%', height: '100%-7',
    border: { type: 'line', fg: colors.border },
    label: ' Activity Log ', tags: true, scrollable: true, alwaysScroll: true,
    keys: true, mouse: true,
  });

  function renderLogEntries() {
    // Remove old text children
    logBox.children.slice().forEach(c => c.destroy());

    let entries = [];

    // Build log entries from live data
    if (liveData.config) {
      entries.push({ time: formatTimestamp(liveData.config.updatedAt), level: 'INFO', msg: `Config last updated` });
      entries.push({ time: formatTimestamp(liveData.config.createdAt), level: 'INFO', msg: `Stablecoin initialized: ${liveData.config.name} (${liveData.config.symbol})` });
      if (liveData.config.isPaused) {
        entries.push({ time: 'CURRENT', level: 'WARN', msg: 'Program is PAUSED' });
      }
    }

    liveData.transactions.forEach(tx => {
      entries.push({
        time: tx.blockTime ? formatTimestamp(tx.blockTime) : 'Slot ' + tx.slot,
        level: 'TX',
        msg: `${tx.err ? 'FAILED' : 'OK'} ${tx.signature.slice(0, 16)}...`
      });
    });

    liveData.blacklist.forEach(bl => {
      entries.push({
        time: formatTimestamp(bl.timestamp),
        level: 'WARN',
        msg: `Blacklisted: ${shortAddr(bl.address)} - ${bl.reason}`
      });
    });

    // Sort by time descending
    entries.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

    // Filter
    if (currentFilter !== 'ALL') {
      entries = entries.filter(e => e.level === currentFilter);
    }

    let content = '';
    entries.forEach(e => {
      let levelColor = colors.text;
      if (e.level === 'WARN') levelColor = colors.accent;
      else if (e.level === 'TX') levelColor = colors.secondary;
      else if (e.level === 'INFO') levelColor = colors.success;

      content += ` {${levelColor}-fg}[${e.level.padEnd(4)}]{/${levelColor}-fg} ${e.time}  ${e.msg}\n`;
    });

    if (!content) content = ' No log entries match the current filter.';
    blessed.text({
      parent: logBox, top: 0, left: 0, tags: true,
      content: content, style: { fg: colors.text }
    });
    screen.render();
  }

  renderLogEntries();
}

// === PLACEHOLDER ===
function renderPlaceholderTab() {
  blessed.text({
    parent: mainContent, top: 'center', left: 'center', align: 'center',
    content: '// MODULE PENDING ALLOCATION //\n\nNavigate using Up/Down arrows in the left menu.\nSelect a different tab.',
    style: { fg: colors.border }
  });
}

// --- 13. GLOBAL KEYBINDS ---
screen.key(['escape', 'q', 'C-c'], () => {
  if (refreshTimer) clearInterval(refreshTimer);
  process.exit(0);
});

// --- 14. INITIALIZE ---
renderSplash();
screen.render();
