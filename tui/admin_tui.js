/**
 * SSS INSTITUTIONAL TERMINAL [BETA]
 *
 * To run:
 * 1. npm install
 * 2. Maximize your terminal window.
 * 3. node admin_tui.js [--rpc URL] [--mint MINT_ADDRESS] [--keypair PATH]
 */

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { BorshAccountsCoder, Program, AnchorProvider, Wallet, BN } = require('@coral-xyz/anchor');
const { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const os = require('os');
const idl = require('./idl/sss_token.json');

// --- .env LOADER (no dependency) ---
function loadEnv() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      return envPath;
    }
  }
  return null;
}
const envFile = loadEnv();

// --- CLI ARGS ---
const args = process.argv.slice(2);
const rpcIdx = args.indexOf('--rpc');
const mintIdx = args.indexOf('--mint');
const keypairIdx = args.indexOf('--keypair');
const programIdx = args.indexOf('--program');
const DEFAULT_KEYPAIR = path.join(os.homedir(), '.config', 'solana', 'id.json');
const RPC_URL = rpcIdx >= 0 ? args[rpcIdx + 1] : (process.env.RPC_URL || 'https://api.devnet.solana.com');
const MINT = mintIdx >= 0 ? args[mintIdx + 1] : (process.env.MINT || '9MmnDN61FaYd7SRzsnHmwEMj1jbTWh1XD4xaM9nWYujv');
const KEYPAIR_PATH = keypairIdx >= 0 ? args[keypairIdx + 1] : (process.env.KEYPAIR_PATH || DEFAULT_KEYPAIR);
const PROGRAM_ID = programIdx >= 0 ? args[programIdx + 1] : (process.env.PROGRAM_ID || '5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4');

// Log unhandled errors to file instead of swallowing silently
const _errLog = path.join(__dirname, 'error.log');
process.on('unhandledRejection', (err) => {
  try { fs.appendFileSync(_errLog, `[${new Date().toISOString()}] UNHANDLED REJECTION: ${err?.stack || err}\n`); } catch {}
});
process.on('uncaughtException', (err) => {
  try { fs.appendFileSync(_errLog, `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${err?.stack || err}\n`); } catch {}
});

const connection = new Connection(RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: false });
const coder = new BorshAccountsCoder(idl);

// --- WALLET / PROGRAM INIT ---
let wallet = null;
let program = null;
let walletMode = false;

function loadWallet() {
  if (!KEYPAIR_PATH) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(KEYPAIR_PATH), 'utf8'));
    wallet = Keypair.fromSecretKey(Uint8Array.from(raw));
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: async (tx) => { tx.sign(wallet); return tx; },
        signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(wallet)); return txs; }
      },
      { commitment: 'confirmed' }
    );
    program = new Program(idl, provider);
    walletMode = true;
    return true;
  } catch (e) {
    return false;
  }
}

loadWallet();

// --- CLIPBOARD UTILITY (cross-platform) ---
const _isWSL = process.platform === 'linux' && fs.existsSync('/proc/version') &&
  fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

function getClipboard() {
  try {
    const { execSync } = require('child_process');
    let cmds;
    if (process.platform === 'win32') {
      cmds = ['powershell.exe -NoProfile -Command Get-Clipboard'];
    } else if (process.platform === 'darwin') {
      cmds = ['pbpaste'];
    } else if (_isWSL) {
      cmds = ['powershell.exe -NoProfile -Command Get-Clipboard'];
    } else {
      cmds = [
        'wl-paste --no-newline',
        'xclip -selection clipboard -o',
        'xsel --clipboard --output',
      ];
    }
    for (const cmd of cmds) {
      try {
        return execSync(cmd, { encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      } catch {}
    }
  } catch {}
  return '';
}

// Prevent blessed textarea from ever spawning an external editor (vim/vi/nano)
blessed.textarea.prototype.readEditor = function(cb) { if (cb) cb(null, this.value); };

// --- 1. SCREEN SETUP ---
const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
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
  success: '#43a047',
  dim: '#757575',
  warning: '#ff9800',
  highlight: '#1a237e',
};

function dimText(str) {
  return `{${colors.dim}-fg}${str}{/${colors.dim}-fg}`;
}

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

function getMinterInfoPda(configPda, minterPk) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('minter'), configPda.toBuffer(), minterPk.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

function getBlacklistPda(configPda, addressPk) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('blacklist'), configPda.toBuffer(), addressPk.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

function getAuditLogPda(configPda, index) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('audit'), configPda.toBuffer(), buf],
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
      enablePermanentDelegate: decoded.enable_permanent_delegate,
      enableTransferHook: decoded.enable_transfer_hook,
      defaultAccountFrozen: decoded.default_account_frozen,
      enableConfidentialTransfers: decoded.enable_confidential_transfers,
      isPaused: decoded.is_paused,
      totalMinted: Number(decoded.total_minted),
      totalBurned: Number(decoded.total_burned),
      currentSupply: Number(decoded.total_minted) - Number(decoded.total_burned),
      attestationIndex: Number(decoded.reserve_attestation_index),
      auditLogIndex: Number(decoded.audit_log_index),
      masterAuthority: decoded.master_authority.toBase58(),
      mint: decoded.mint.toBase58(),
      createdAt: Number(decoded.created_at),
      updatedAt: Number(decoded.updated_at),
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
      masterAuthority: decoded.master_authority.toBase58(),
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
        { dataSize: 106 },
        { memcmp: { offset: 9, bytes: configPda.toBase58() } }
      ]
    });
    return accounts.map(({ pubkey, account }) => {
      try {
        const decoded = coder.decode('MinterInfo', account.data);
        return {
          address: decoded.minter.toBase58(),
          isActive: decoded.is_active,
          mintQuota: Number(decoded.mint_quota),
          totalMinted: Number(decoded.total_minted),
          remaining: Number(decoded.mint_quota) - Number(decoded.total_minted),
          createdAt: Number(decoded.created_at),
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
    // Filter by BlacklistEntry discriminator from IDL + config PDA
    const disc = Buffer.from(idl.accounts.find(a => a.name === 'BlacklistEntry').discriminator);
    const bs58 = require('bs58');
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(disc) } },
        { memcmp: { offset: 9, bytes: configPda.toBase58() } }
      ]
    });
    return accounts.map(({ account }) => {
      try {
        const decoded = coder.decode('BlacklistEntry', account.data);
        return {
          address: decoded.blocked_address.toBase58(),
          reason: decoded.reason,
          blacklistedBy: decoded.blacklisted_by.toBase58(),
          timestamp: Number(decoded.blacklisted_at),
        };
      } catch { return null; }
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

async function fetchAttestations(configPda, count) {
  const cap = Math.min(count, 50);
  if (cap === 0) return [];
  // Batch-fetch all attestation PDAs in one RPC call
  const pdas = [];
  for (let i = 0; i < cap; i++) {
    const [pda] = getReserveAttestationPda(configPda, i);
    pdas.push(pda);
  }
  try {
    const infos = await connection.getMultipleAccountsInfo(pdas);
    const results = [];
    for (let i = 0; i < infos.length; i++) {
      if (!infos[i]) continue;
      try {
        const decoded = coder.decode('ReserveAttestation', infos[i].data);
        results.push({
          index: Number(decoded.index),
          reserveHash: '0x' + Buffer.from(decoded.reserve_hash).toString('hex').slice(0, 8) + '...',
          totalReservesUsd: Number(decoded.total_reserves_usd),
          totalOutstanding: Number(decoded.total_outstanding),
          attestedBy: decoded.attested_by.toBase58(),
          uri: decoded.attestation_uri,
          timestamp: Number(decoded.timestamp),
        });
      } catch { /* decode error, skip */ }
    }
    return results;
  } catch { return []; }
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
  solBalance: null,
  slotHeight: null,
  auditLogs: [],
  lastRefresh: null,
  error: null,
  loading: false,
};

const BASE_REFRESH_INTERVAL = 10000;
let currentRefreshInterval = BASE_REFRESH_INTERVAL;
let refreshTimer = null;
let nextRefreshAt = null;
let consecutiveErrors = 0;
let refreshInProgress = false;

async function fetchAuditLogs(configPda, count) {
  const cap = Math.min(count, 50);
  if (cap === 0) return [];
  // Batch-fetch all audit log PDAs in one RPC call
  const pdas = [];
  for (let i = 0; i < cap; i++) {
    const [pda] = getAuditLogPda(configPda, i);
    pdas.push(pda);
  }
  try {
    const infos = await connection.getMultipleAccountsInfo(pdas);
    const results = [];
    for (let i = 0; i < infos.length; i++) {
      if (!infos[i]) continue;
      try {
        const decoded = coder.decode('AuditLogEntry', infos[i].data);
        const actionIdx = decoded.action ? Object.keys(decoded.action)[0] : 'unknown';
        results.push({
          index: Number(decoded.index),
          action: actionIdx.charAt(0).toUpperCase() + actionIdx.slice(1),
          actor: decoded.actor.toBase58(),
          target: decoded.target ? decoded.target.toBase58() : null,
          amount: decoded.amount ? Number(decoded.amount) : null,
          details: decoded.details || '',
          timestamp: Number(decoded.timestamp),
        });
      } catch { /* decode error, skip */ }
    }
    return results;
  } catch { return []; }
}

async function refreshData() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  liveData.loading = true;
  updateStatusBar();
  screen.render();
  try {
    const [configPda] = getConfigPda(MINT);
    const mintPk = new PublicKey(MINT);

    // Batch 1: core data — all in parallel
    const [config, roles, minters, transactions, holdersResult] = await Promise.all([
      fetchConfig(MINT),
      fetchRoles(configPda),
      fetchMinters(configPda),
      fetchTransactions(mintPk, 20),
      connection.getTokenLargestAccounts(mintPk).catch(() => null),
    ]);

    liveData.config = config;
    liveData.roles = roles;
    liveData.minters = minters;
    liveData.transactions = transactions;

    if (holdersResult) {
      const total = holdersResult.value.reduce((sum, a) => sum + (a.uiAmount || 0), 0);
      liveData.holders = holdersResult.value.map((acct, i) => ({
        rank: i + 1,
        address: acct.address.toBase58(),
        balance: acct.uiAmount || 0,
        pct: total > 0 ? ((acct.uiAmount || 0) / total * 100).toFixed(1) : '0.0',
      }));
    } else { liveData.holders = []; }

    // Batch 2: config-dependent data + extras — all in parallel
    const batch2 = [];
    if (config) {
      batch2.push(fetchAttestations(configPda, config.attestationIndex));
      batch2.push(fetchBlacklist(configPda));
      batch2.push(fetchAuditLogs(configPda, config.auditLogIndex));
    } else {
      batch2.push(Promise.resolve([]), Promise.resolve([]), Promise.resolve([]));
    }
    if (walletMode) {
      batch2.push(connection.getBalance(wallet.publicKey).catch(() => null));
    } else {
      batch2.push(Promise.resolve(null));
    }
    batch2.push(connection.getSlot().catch(() => null));

    const [attestations, blacklist, auditLogs, solBalance, slotHeight] = await Promise.all(batch2);

    if (config) {
      liveData.attestations = attestations;
      liveData.blacklist = blacklist;
      liveData.auditLogs = auditLogs;

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

    liveData.solBalance = solBalance;
    liveData.slotHeight = slotHeight;

    liveData.lastRefresh = new Date();
    liveData.error = null;
    consecutiveErrors = 0;
    currentRefreshInterval = BASE_REFRESH_INTERVAL;
    nextRefreshAt = Date.now() + currentRefreshInterval;
  } catch (err) {
    const msg = (err.message || String(err));
    const isRateLimit = msg.includes('429') || msg.includes('Too Many') || msg.includes('rate') || msg.includes('limit');
    consecutiveErrors++;
    if (isRateLimit) {
      currentRefreshInterval = Math.min(60000, BASE_REFRESH_INTERVAL * Math.pow(2, consecutiveErrors));
      liveData.error = 'Rate limited - retry in ' + Math.round(currentRefreshInterval / 1000) + 's';
    } else {
      currentRefreshInterval = Math.min(30000, BASE_REFRESH_INTERVAL * (1 + consecutiveErrors));
      liveData.error = msg.slice(0, 60);
    }
    nextRefreshAt = Date.now() + currentRefreshInterval;
  } finally {
    refreshInProgress = false;
    liveData.loading = false;
    updateTopNav();
    updateStatusBar();
    // Don't re-render tabs while a modal or form input is active — it would destroy them
    const formHasData = _formInputActive || _activeFormValues.some(arr => arr.some(v => v.length > 0));
    if (activeModals.length === 0 && !formHasData) {
      renderTabContent();
    }
  }
}

function startAutoRefresh() {
  refreshData();
  function scheduleNext() {
    refreshTimer = setTimeout(() => {
      refreshData().then(scheduleNext).catch(scheduleNext);
    }, currentRefreshInterval);
  }
  scheduleNext();
}

// --- 5. GLOBAL STATE ---
let state = {
  wallet: walletMode ? shortAddr(wallet.publicKey.toBase58()) : 'No Wallet',
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

let activeModals = [];
let _formInputActive = false;
let _activeFormValues = [];  // References to all live createFormInputs value arrays

function showMessage(title, text, timeoutMs) {
  timeoutMs = timeoutMs || 3000;
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
  activeModals.push(msg);
  // blessed.message.display() expects seconds, not milliseconds
  const timeoutSec = Math.max(1, Math.round(timeoutMs / 1000));
  msg.display(text, timeoutSec, () => {
    activeModals = activeModals.filter(m => m !== msg);
    msg.destroy();
    screen.render();
  });
  screen.render();
}

function dismissAllModals() {
  activeModals.forEach(m => {
    // Clean up any program-level keypress handlers attached to the modal
    if (m._programKeyHandler) {
      try { screen.program.removeListener('keypress', m._programKeyHandler); } catch {}
    }
    try { m.destroy(); } catch(e) {}
  });
  activeModals = [];
}

function reportUiError(context, err) {
  const msg = err && (err.message || String(err)) ? (err.message || String(err)) : String(err);
  try {
    fs.appendFileSync(_errLog, `[${new Date().toISOString()}] UI ACTION ${context}: ${err?.stack || err}\n`);
  } catch {}
  showMessage('UI Error', `${context} failed:\n${msg.slice(0, 240)}`, 5000);
}

function bindSafePress(button, context, handler) {
  button.on('press', () => {
    try {
      const result = handler();
      if (result && typeof result.then === 'function') {
        result.catch(err => reportUiError(context, err));
      }
    } catch (err) {
      reportUiError(context, err);
    }
  });
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

function parseTokenAmount(str, decimals) {
  const cleaned = str.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  return new BN(whole + padded);
}

function isValidPubkey(str) {
  try { new PublicKey(str); return true; } catch { return false; }
}

function detectNetwork(url) {
  let net = 'CUSTOM';
  if (url.includes('mainnet')) net = 'MAINNET';
  else if (url.includes('devnet')) net = 'DEVNET';
  else if (url.includes('testnet')) net = 'TESTNET';
  else if (url.includes('localhost') || url.includes('127.0.0.1')) net = 'LOCAL';
  // Detect known RPC providers
  if (url.includes('helius')) return net + '/Helius';
  if (url.includes('quicknode')) return net + '/QuickNode';
  if (url.includes('alchemy')) return net + '/Alchemy';
  if (url.includes('triton')) return net + '/Triton';
  if (url.includes('shyft')) return net + '/Shyft';
  if (url.includes('api.devnet.solana.com') || url.includes('api.mainnet-beta.solana.com')) return net + '/Public';
  return net;
}

// --- TX EXECUTION HELPER ---
async function executeTx(title, txFn) {
  if (!walletMode) {
    showMessage('No Wallet', 'Pass --keypair <path> to enable transactions.', 3000);
    return false;
  }
  // Show sending indicator
  const sendingMsg = blessed.message({
    parent: screen, top: 'center', left: 'center', width: '50%', height: 'shrink',
    border: { type: 'line', fg: colors.accent }, label: ` ${title} `,
    style: { bg: colors.bg, fg: colors.text }, tags: true,
  });
  activeModals.push(sendingMsg);
  sendingMsg.display('Sending transaction...', 0, () => {});
  screen.render();

  try {
    // Anchor .rpc() already confirms the transaction — no need for a second confirmTransaction()
    const sig = await txFn();

    // Dismiss sending indicator
    activeModals = activeModals.filter(m => m !== sendingMsg);
    sendingMsg.destroy();

    // Show success with full signature and explorer link
    const cluster = connection.rpcEndpoint.includes('devnet') ? 'devnet' :
                    connection.rpcEndpoint.includes('mainnet') ? 'mainnet-beta' : 'devnet';
    const successBox = blessed.box({
      parent: screen, top: 'center', left: 'center',
      width: '65%', height: 10,
      border: { type: 'line', fg: colors.success },
      label: ' Transaction Confirmed ',
      style: { bg: colors.bg, fg: colors.text },
      tags: true, mouse: true, keys: true,
    });
    activeModals.push(successBox);
    successBox.focus(); // Grab focus so keypresses don't leak to buttons underneath

    blessed.text({
      parent: successBox, top: 1, left: 2,
      content: '{green-fg}{bold}SUCCESS{/bold}{/green-fg}', tags: true,
      style: { fg: colors.success }
    });
    blessed.text({
      parent: successBox, top: 3, left: 2,
      content: 'Signature:', style: { fg: colors.dim }
    });
    blessed.text({
      parent: successBox, top: 4, left: 2,
      content: sig, style: { fg: colors.accent }
    });
    blessed.text({
      parent: successBox, top: 6, left: 2,
      content: `Explorer: explorer.solana.com/tx/${sig.slice(0,20)}...?cluster=${cluster}`,
      style: { fg: colors.dim }
    });
    blessed.text({
      parent: successBox, top: 8, left: 2,
      content: '[Enter/Esc] Close    [Signature copied to clipboard]',
      style: { fg: colors.dim }
    });

    // Copy signature to clipboard
    try {
      const { execSync } = require('child_process');
      if (_isWSL) {
        execSync('echo ' + sig + ' | clip.exe', { timeout: 2000, stdio: 'ignore' });
      } else if (process.platform === 'darwin') {
        execSync('echo ' + sig + ' | pbcopy', { timeout: 2000, stdio: 'ignore' });
      } else {
        execSync('echo ' + sig + ' | xclip -selection clipboard', { timeout: 2000, stdio: 'ignore' });
      }
    } catch {}

    screen.render();

    // Close on Enter or Escape only — prevents accidental double-fire from any key
    let successClosed = false;
    const closeSuccess = (ch, key) => {
      if (successClosed) return;
      if (!key || (key.name !== 'enter' && key.name !== 'return' && key.name !== 'escape')) return;
      successClosed = true;
      screen.program.removeListener('keypress', closeSuccess);
      activeModals = activeModals.filter(m => m !== successBox);
      successBox.destroy();
      screen.render();
      // Refresh data after a tick to avoid re-entrancy
      setTimeout(() => refreshData(), 50);
    };
    successBox._programKeyHandler = closeSuccess;
    screen.program.on('keypress', closeSuccess);

    return true;
  } catch (err) {
    // Dismiss sending indicator
    activeModals = activeModals.filter(m => m !== sendingMsg);
    sendingMsg.destroy();

    const msg = err.message || String(err);
    showMessage('Transaction Failed', msg.slice(0, 300), 8000);
    return false;
  }
}

function confirmAction(title, details, dangerLevel, onConfirm) {
  const borderColor = dangerLevel === 'critical' ? colors.danger :
                      dangerLevel === 'high' ? colors.accent : colors.secondary;
  const previousFocus = screen.focused;
  const confirmBox = blessed.box({
    parent: screen,
    top: 'center', left: 'center', width: '60%', height: 'shrink',
    border: { type: 'line', fg: borderColor },
    label: ` CONFIRM: ${title} `,
    style: { bg: colors.bg, fg: colors.text, border: { fg: borderColor } },
    tags: true, padding: { left: 2, right: 2, top: 1, bottom: 1 },
    keys: true, mouse: true,
  });
  activeModals.push(confirmBox);
  confirmBox.focus(); // Grab focus to prevent key leaking to elements underneath

  let content = '';
  if (dangerLevel === 'critical') {
    content += '{red-fg}{bold}!! CRITICAL ACTION !!{/bold}{/red-fg}\n\n';
  } else if (dangerLevel === 'high') {
    content += '{yellow-fg}{bold}! HIGH IMPACT ACTION !{/bold}{/yellow-fg}\n\n';
  }
  content += details + '\n\n';
  content += '{bold}Press Y to confirm, N or Esc to cancel.{/bold}';
  blessed.text({
    parent: confirmBox, top: 0, left: 0,
    content: content, tags: true, style: { fg: colors.text }
  });
  screen.render();

  let resolved = false;
  const closeConfirm = (didConfirm) => {
    if (resolved) return;
    resolved = true;
    screen.program.removeListener('keypress', handler);
    activeModals = activeModals.filter(m => m !== confirmBox);
    if (!confirmBox.destroyed) confirmBox.destroy();
    if (previousFocus && !previousFocus.destroyed && activeModals.length === 0) {
      try { previousFocus.focus(); } catch {}
    }
    screen.render();
    if (didConfirm) {
      try {
        onConfirm();
      } catch (err) {
        reportUiError(title, err);
      }
      return;
    }
    showMessage('Cancelled', 'Action cancelled by operator.', 2000);
  };

  const handler = (ch, key) => {
    if (!key || resolved) return;
    if (activeModals[activeModals.length - 1] !== confirmBox) return;
    if (key.name === 'y') closeConfirm(true);
    else if (key.name === 'n' || key.name === 'escape') closeConfirm(false);
  };
  confirmBox._programKeyHandler = handler;
  screen.program.on('keypress', handler);
}

function exportCsv(filename, headers, rows) {
  const eol = process.platform === 'win32' ? '\r\n' : '\n';
  const csvContent = [headers.join(',')]
    .concat(rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')))
    .join(eol);
  const exportPath = path.join(process.cwd(), filename);
  fs.writeFileSync(exportPath, csvContent, 'utf8');
  showMessage('Export Complete', `Saved ${rows.length} rows to:\n${exportPath}`, 4000);
}

function openActionModal(actionName) {
  if (!walletMode) { showMessage('No Wallet', 'Pass --keypair to enable transactions.', 3000); return; }

  const dec = liveData.config ? liveData.config.decimals : 6;
  const symbol = liveData.config ? liveData.config.symbol : 'tokens';

  const ACTIONS = {
    mint: { title: 'Mint Tokens', fields: ['Recipient Address', 'Amount'], danger: 'high' },
    burn: { title: 'Burn Tokens', fields: ['Wallet Address (empty = self)', 'Amount'], danger: 'high' },
    freeze: { title: 'Freeze Account', fields: ['Target Address'], danger: 'high' },
    thaw: { title: 'Thaw Account', fields: ['Target Address'], danger: 'normal' },
    blacklistAdd: { title: 'Add to Blacklist', fields: ['Target Address', 'Reason'], danger: 'high' },
    blacklistRemove: { title: 'Remove from Blacklist', fields: ['Target Address'], danger: 'normal' },
    seize: { title: 'Seize Tokens', fields: ['Blacklisted Address', 'Destination Address', 'Amount'], danger: 'high' },
    pause: { title: 'Pause Program', fields: [], danger: 'high' },
    unpause: { title: 'Unpause Program', fields: [], danger: 'high' },
    attest: { title: 'Attest Reserve', fields: ['Reserve Hash (hex)', 'Reserves USD', 'Outstanding', 'URI'], danger: 'normal' },
    updateRole: { title: 'Update Role', fields: ['Role (pauser/blacklister/seizer)', 'New Address'], danger: 'high' },
    updateMinter: { title: 'Update Minter', fields: ['Minter Address', 'Mint Quota', 'Active (true/false)'], danger: 'normal' },
    transferAuthority: { title: 'Transfer Authority', fields: ['New Authority Address'], danger: 'critical' },
  };

  const action = ACTIONS[actionName];
  if (!action) { showMessage('Error', 'Unknown action: ' + actionName, 2000); return; }

  const modalHeight = Math.max(8, action.fields.length * 3 + 7);
  const modal = blessed.box({
    parent: screen,
    top: 'center', left: 'center',
    width: '65%', height: modalHeight,
    border: { type: 'line', fg: action.danger === 'critical' ? colors.danger : action.danger === 'high' ? colors.accent : colors.secondary },
    label: ` ${action.title} `,
    style: { bg: colors.bg, fg: colors.text },
    tags: true,
    mouse: true,
  });
  activeModals.push(modal);

  // Build input fields as plain boxes — we handle all keystrokes manually
  const inputs = [];
  const inputValues = [];
  action.fields.forEach((field, i) => {
    blessed.text({
      parent: modal, top: 1 + i * 3, left: 2,
      content: field + ':', style: { fg: colors.accent }
    });
    const input = blessed.box({
      parent: modal, top: 2 + i * 3, left: 2,
      width: '90%', height: 1,
      style: { bg: colors.border, fg: colors.text },
      content: '',
      mouse: true, clickable: true,
    });
    input.getValue = () => inputValues[i] || '';
    input.on('click', () => { activateInput(i); });
    inputs.push(input);
    inputValues.push('');
  });

  let activeIdx = inputs.length > 0 ? 0 : -1;

  function deactivateInputSelection() {
    activeIdx = -1;
    inputs.forEach(inp => { inp.style.bg = colors.border; });
    renderAllInputs();
  }

  function activateInput(idx) {
    activeIdx = idx;
    inputs.forEach((inp, j) => {
      inp.style.bg = j === idx ? '#333333' : colors.border;
    });
    screen.render();
  }

  function renderInputContent(idx) {
    const val = inputValues[idx] || '';
    inputs[idx].setContent(val + (idx === activeIdx ? '_' : ''));
    screen.render();
  }

  function renderAllInputs() {
    inputs.forEach((_, i) => renderInputContent(i));
  }

  const btnTop = action.fields.length > 0 ? 2 + action.fields.length * 3 : 1;
  const submitBtn = blessed.button({
    parent: modal, top: btnTop, left: 2, width: 20, height: 1,
    content: ' [ SUBMIT ] ',
    style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });

  const cancelBtn = blessed.button({
    parent: modal, top: btnTop, left: 25, width: 14, height: 1,
    content: ' [ CANCEL ] ',
    style: { bg: colors.border, fg: colors.text, focus: { bg: colors.danger } },
    mouse: true, keys: true
  });

  blessed.text({
    parent: modal, top: btnTop + 2, left: 2,
    content: '[Ctrl+V] Paste  [Tab] Next  [Enter] Submit  [Esc] Cancel',
    style: { fg: colors.dim }
  });

  // Single program-level keypress handler for ALL modal input
  const modalKeyHandler = (ch, key) => {
    if (!key) return;

    // Escape — close modal
    if (key.name === 'escape') { closeModal(); return; }

    // If no input is active (focus on buttons etc), skip
    if (activeIdx < 0) return;

    // Tab — next field or submit button
    if (key.name === 'tab') {
      if (activeIdx < inputs.length - 1) {
        activateInput(activeIdx + 1);
      } else {
        deactivateInputSelection();
        submitBtn.focus();
      }
      return;
    }

    // Enter — if last field submit, else next field
    if (key.name === 'enter' || key.name === 'return') {
      if (activeIdx < inputs.length - 1) {
        activateInput(activeIdx + 1);
      } else {
        deactivateInputSelection();
        submitBtn.focus();
        submitBtn.press();
      }
      return;
    }

    // Ctrl+V — paste
    if (key.ctrl && key.name === 'v') {
      const clip = getClipboard();
      if (clip) {
        inputValues[activeIdx] = clip.split(/\r?\n/)[0];
        renderInputContent(activeIdx);
      }
      return;
    }

    // Backspace
    if (key.name === 'backspace') {
      if (inputValues[activeIdx].length > 0) {
        inputValues[activeIdx] = inputValues[activeIdx].slice(0, -1);
        renderInputContent(activeIdx);
      }
      return;
    }

    // Regular printable character
    if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
      inputValues[activeIdx] += ch;
      renderInputContent(activeIdx);
    }
  };
  screen.program.on('keypress', modalKeyHandler);
  modal._programKeyHandler = modalKeyHandler; // Tag for cleanup by dismissAllModals

  // Clicking a button should deactivate input fields
  const prepareModalButtons = () => { deactivateInputSelection(); };
  submitBtn.on('focus', prepareModalButtons);
  submitBtn.on('click', prepareModalButtons);
  submitBtn.on('press', prepareModalButtons);
  cancelBtn.on('focus', prepareModalButtons);
  cancelBtn.on('click', prepareModalButtons);
  cancelBtn.on('press', prepareModalButtons);

  // Initialize first input as active
  if (inputs.length > 0) {
    activateInput(0);
    renderAllInputs();
  }

  function closeModal() {
    screen.program.removeListener('keypress', modalKeyHandler);
    modal.destroy();
    activeModals = activeModals.filter(m => m !== modal);
    screen.render();
  }

  cancelBtn.on('press', closeModal);

  submitBtn.on('press', () => {
    const values = inputs.map(inp => inp.getValue().trim());

    // Validate non-empty required fields
    if (action.fields.length > 0 && values.some(v => !v) && actionName !== 'attest') {
      showMessage('Error', 'Fill in all required fields.', 2000);
      return;
    }

    closeModal();

    // Route to appropriate transaction
    switch (actionName) {
      case 'mint': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid recipient address.', 2000); return; }
        const amount = parseTokenAmount(values[1], dec);
        if (!amount) { showMessage('Error', 'Invalid amount format.', 2000); return; }
        const preview = formatUsd(amount.toNumber(), 0) + ' ' + symbol;
        confirmAction('Mint Tokens', 'Minting: ' + preview + '\nTo: ' + shortAddr(values[0]), 'high', () => {
          executeTx('Minting Tokens', async () => {
            const [configPda] = getConfigPda(MINT);
            const [rolesPda] = getRoleRegistryPda(configPda);
            const [minterPda] = getMinterInfoPda(configPda, wallet.publicKey);
            const mintPk = new PublicKey(MINT);
            const recipientPk = new PublicKey(values[0]);
            const recipientAta = getAssociatedTokenAddressSync(mintPk, recipientPk, false, TOKEN_2022_PROGRAM_ID);
            const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
            const [auditPda] = getAuditLogPda(configPda, auditIdx);
            // Auto-create recipient ATA if it doesn't exist
            const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey, recipientAta, recipientPk, mintPk, TOKEN_2022_PROGRAM_ID
            );
            return await program.methods.mintTokens(amount)
              .accounts({ minterAuthority: wallet.publicKey, config: configPda,
                minterInfo: minterPda, mint: mintPk, recipientTokenAccount: recipientAta,
                recipientBlacklist: null, tokenProgram: TOKEN_2022_PROGRAM_ID })
              .preInstructions([createAtaIx])
              .signers([wallet]).rpc();
          });
        });
        break;
      }
      case 'burn': {
        const burnTarget = values[0].trim();
        const amount = parseTokenAmount(values[1], dec);
        if (!amount) { showMessage('Error', 'Invalid amount format.', 2000); return; }
        // If address is empty or matches signer, burn from self. Otherwise authority burn.
        const burnFrom = burnTarget && isValidPubkey(burnTarget) ? new PublicKey(burnTarget) : wallet.publicKey;
        const isSelf = burnFrom.equals(wallet.publicKey);
        const label = isSelf ? 'your wallet' : shortAddr(burnFrom.toBase58());
        confirmAction('Burn Tokens', 'Burning: ' + formatUsd(amount.toNumber(), 0) + ' ' + symbol + '\nFrom: ' + label, 'high', () => {
          executeTx('Burning Tokens', async () => {
            const [configPda] = getConfigPda(MINT);
            const mintPk = new PublicKey(MINT);
            const burnAta = getAssociatedTokenAddressSync(mintPk, burnFrom, false, TOKEN_2022_PROGRAM_ID);
            return await program.methods.burnTokens(amount)
              .accounts({ burner: wallet.publicKey, config: configPda, mint: mintPk,
                burnTokenAccount: burnAta,
                tokenProgram: TOKEN_2022_PROGRAM_ID })
              .signers([wallet]).rpc();
          });
        });
        break;
      }
      case 'freeze': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid address.', 2000); return; }
        executeTx('Freezing Account', async () => {
          const [configPda] = getConfigPda(MINT);
          const [rolesPda] = getRoleRegistryPda(configPda);
          const targetPk = new PublicKey(values[0]);
          const mintPk = new PublicKey(MINT);
          const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
          const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
          const [auditPda] = getAuditLogPda(configPda, auditIdx);
          return await program.methods.freezeAccount()
            .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
              mint: mintPk, targetTokenAccount: targetAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID })
            .signers([wallet]).rpc();
        });
        break;
      }
      case 'thaw': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid address.', 2000); return; }
        executeTx('Thawing Account', async () => {
          const [configPda] = getConfigPda(MINT);
          const [rolesPda] = getRoleRegistryPda(configPda);
          const targetPk = new PublicKey(values[0]);
          const mintPk = new PublicKey(MINT);
          const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
          return await program.methods.thawAccount()
            .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
              mint: mintPk, targetTokenAccount: targetAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID })
            .signers([wallet]).rpc();
        });
        break;
      }
      case 'blacklistAdd': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid address.', 2000); return; }
        confirmAction('Add to Blacklist', 'Address: ' + shortAddr(values[0]) + '\nReason: ' + values[1], 'high', () => {
          executeTx('Adding to Blacklist', async () => {
            const [configPda] = getConfigPda(MINT);
            const [rolesPda] = getRoleRegistryPda(configPda);
            const targetPk = new PublicKey(values[0]);
            const [blPda] = getBlacklistPda(configPda, targetPk);
            const mintPk = new PublicKey(MINT);
            const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
            const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey, targetAta, targetPk, mintPk, TOKEN_2022_PROGRAM_ID
            );
            return await program.methods.blacklistAdd({ reason: values[1] })
              .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
                blacklistEntry: blPda, addressToBlacklist: targetPk, mint: mintPk,
                targetTokenAccount: targetAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId })
              .preInstructions([createAtaIx])
              .signers([wallet]).rpc();
          });
        });
        break;
      }
      case 'blacklistRemove': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid address.', 2000); return; }
        executeTx('Removing from Blacklist', async () => {
          const [configPda] = getConfigPda(MINT);
          const [rolesPda] = getRoleRegistryPda(configPda);
          const targetPk = new PublicKey(values[0]);
          const [blPda] = getBlacklistPda(configPda, targetPk);
          const mintPk = new PublicKey(MINT);
          const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
          return await program.methods.blacklistRemove()
            .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
              blacklistEntry: blPda, mint: mintPk, targetTokenAccount: targetAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID })
            .signers([wallet]).rpc();
        });
        break;
      }
      case 'seize': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid source address.', 2000); return; }
        if (!isValidPubkey(values[1])) { showMessage('Error', 'Invalid destination address.', 2000); return; }
        const amount = parseTokenAmount(values[2], dec);
        if (!amount) { showMessage('Error', 'Invalid amount format.', 2000); return; }
        confirmAction('Seize Tokens', 'Seizing: ' + formatUsd(amount.toNumber(), 0) + ' ' + symbol + '\nFrom: ' + shortAddr(values[0]) + '\nTo: ' + shortAddr(values[1]), 'high', () => {
          executeTx('Seizing Tokens', async () => {
            const [configPda] = getConfigPda(MINT);
            const [rolesPda] = getRoleRegistryPda(configPda);
            const targetPk = new PublicKey(values[0]);
            const [blPda] = getBlacklistPda(configPda, targetPk);
            const mintPk = new PublicKey(MINT);
            const fromAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
            const toAta = new PublicKey(values[1]);
            return await program.methods.seize(amount)
              .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
                blacklistEntry: blPda, mint: mintPk, fromTokenAccount: fromAta,
                toTokenAccount: toAta, tokenProgram: TOKEN_2022_PROGRAM_ID })
              .signers([wallet]).rpc();
          });
        });
        break;
      }
      case 'pause': {
        confirmAction('Pause Program', 'This will HALT all token operations.', 'high', () => {
          executeTx('Pausing Program', async () => {
            const [configPda] = getConfigPda(MINT);
            const [rolesPda] = getRoleRegistryPda(configPda);
            return await program.methods.pause()
              .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda })
              .signers([wallet]).rpc();
          });
        });
        break;
      }
      case 'unpause': {
        confirmAction('Unpause Program', 'This will RESUME all token operations.', 'high', () => {
          executeTx('Unpausing Program', async () => {
            const [configPda] = getConfigPda(MINT);
            const [rolesPda] = getRoleRegistryPda(configPda);
            return await program.methods.unpause()
              .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda })
              .signers([wallet]).rpc();
          });
        });
        break;
      }
      case 'attest': {
        const hashHex = values[0];
        const cleanHex = hashHex.startsWith('0x') ? hashHex.slice(2) : hashHex;
        if (cleanHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
          showMessage('Error', 'Hash must be 64 hex chars (32 bytes).', 3000); return;
        }
        const reserveHash = [];
        for (let i = 0; i < 64; i += 2) reserveHash.push(parseInt(cleanHex.slice(i, i + 2), 16));
        const totalReservesUsd = parseTokenAmount(values[1], dec);
        const totalOutstanding = parseTokenAmount(values[2], dec);
        if (!totalReservesUsd || !totalOutstanding) { showMessage('Error', 'Invalid number format.', 2000); return; }
        executeTx('Submitting Attestation', async () => {
          const [configPda] = getConfigPda(MINT);
          const [rolesPda] = getRoleRegistryPda(configPda);
          const attIdx = liveData.config ? liveData.config.attestationIndex : 0;
          const [attestPda] = getReserveAttestationPda(configPda, attIdx);
          return await program.methods.attestReserve({
            reserveHash, totalReservesUsd, totalOutstanding, attestationUri: values[3] || '',
          }).accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
              attestation: attestPda, systemProgram: SystemProgram.programId })
            .signers([wallet]).rpc();
        });
        break;
      }
      case 'updateRole': {
        const roleMap = { pauser: { pauser: {} }, blacklister: { blacklister: {} }, seizer: { seizer: {} } };
        const roleEnum = roleMap[values[0].toLowerCase()];
        if (!roleEnum) { showMessage('Error', 'Role must be: pauser, blacklister, or seizer', 2000); return; }
        if (!isValidPubkey(values[1])) { showMessage('Error', 'Invalid address.', 2000); return; }
        executeTx('Updating Role', async () => {
          const [configPda] = getConfigPda(MINT);
          const [rolesPda] = getRoleRegistryPda(configPda);
          const newHolder = new PublicKey(values[1]);
          const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
          const [auditPda] = getAuditLogPda(configPda, auditIdx);
          return await program.methods.updateRoles({ role: roleEnum, newHolder })
            .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda })
            .signers([wallet]).rpc();
        });
        break;
      }
      case 'updateMinter': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid minter address.', 2000); return; }
        const quota = parseTokenAmount(values[1], dec);
        if (!quota) { showMessage('Error', 'Invalid quota format.', 2000); return; }
        const isActive = values[2].toLowerCase() !== 'false';
        executeTx('Updating Minter', async () => {
          const [configPda] = getConfigPda(MINT);
          const [rolesPda] = getRoleRegistryPda(configPda);
          const minterPk = new PublicKey(values[0]);
          const [minterPda] = getMinterInfoPda(configPda, minterPk);
          return await program.methods.updateMinter({ isActive, mintQuota: quota })
            .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
              minterInfo: minterPda, minterWallet: minterPk,
              systemProgram: SystemProgram.programId })
            .signers([wallet]).rpc();
        });
        break;
      }
      case 'transferAuthority': {
        if (!isValidPubkey(values[0])) { showMessage('Error', 'Invalid address.', 2000); return; }
        confirmAction('Transfer Master Authority',
          'This will PERMANENTLY transfer authority to:\n\n  ' + values[0] + '\n\nThis is IRREVERSIBLE.',
          'critical', () => {
            executeTx('Transferring Authority', async () => {
              const [configPda] = getConfigPda(MINT);
              const [rolesPda] = getRoleRegistryPda(configPda);
              const newAuthority = new PublicKey(values[0]);
              return await program.methods.transferAuthority()
                .accounts({ authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
                  newAuthority })
                .signers([wallet]).rpc();
            });
          });
        break;
      }
    }
  });

  // Focus first input or submit button
  if (inputs.length > 0) {
    inputs[0].focus();
  } else {
    submitBtn.focus();
  }
  screen.render();
}

// --- 7. UI CONTAINERS ---

// A. Splash Screen (full-screen intro)
const splashScreen = blessed.box({
  parent: screen,
  top: 0, left: 0, width: '100%', height: '100%',
  style: { bg: colors.bg, fg: colors.text },
  tags: true,
  hidden: false
});

// B. Preset Picker Screen
const presetScreen = blessed.box({
  parent: screen,
  top: 0, left: 0, width: '100%', height: '100%',
  border: { type: 'line', fg: colors.border },
  style: { bg: colors.bg, fg: colors.text },
  tags: true,
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
  '01. Command Hub',
  '02. Supply Ops',
  '03. Blacklist',
  '04. Attestations',
  '05. Roles & Access',
  '06. Minters',
  '07. Token Holders',
  '08. Transfer History',
  '09. System & Config',
];

let focusPane = 'sidebar'; // 'sidebar' or 'main'

const sideMenu = blessed.list({
  parent: dashContainer, top: 3, left: 0, width: 25, height: '100%-4',
  border: { type: 'line', fg: colors.accent },
  label: ' {bold}NAV{/bold} ',
  style: { bg: colors.bg, fg: colors.text, selected: { bg: colors.highlight, fg: colors.accent, bold: true } },
  keys: true, mouse: true,
  items: TAB_ITEMS,
  tags: true,
});

const mainContent = blessed.box({
  parent: dashContainer, top: 3, left: 25, width: '100%-25', height: '100%-4',
  border: { type: 'line', fg: colors.border },
  style: { bg: colors.bg, fg: colors.text },
  tags: true,
});

function updateFocusIndicator() {
  if (focusPane === 'sidebar') {
    sideMenu.style.border = { fg: colors.accent };
    sideMenu.setLabel(' {bold}NAV{/bold} ');
    mainContent.style.border = { fg: colors.border };
    mainContent.setLabel('');
  } else {
    sideMenu.style.border = { fg: colors.border };
    sideMenu.setLabel(' NAV ');
    mainContent.style.border = { fg: colors.accent };
    mainContent.setLabel(' {bold}ACTIVE{/bold} ');
  }
}

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
  const walletStr = walletMode ? 'OP:' + shortAddr(wallet.publicKey.toBase58()) : 'READ-ONLY';

  // Contextual hotkey hints per tab
  let hotkeys = '';
  switch (state.activeTab) {
    case 0: hotkeys = '[M]int [B]urn [F]reeze [K]Blacklist [P]ause [A]ttest'; break;
    case 1: hotkeys = '[M]int [B]urn [F]reeze [T]haw [X]Export'; break;
    case 2: hotkeys = '[A]dd [D]el [S]eize [/]Search [X]Export'; break;
    case 3: hotkeys = '[A]ttest [X]Export'; break;
    case 4: hotkeys = '[E]dit [X]Export'; break;
    case 5: hotkeys = '[E]dit [X]Export'; break;
    case 6: hotkeys = '[/]Search [X]Export'; break;
    case 7: hotkeys = '[/]Search [X]Export'; break;
    case 8: hotkeys = '[X]Export'; break;
  }

  statusBar.setContent(
    ` ${loadingStr} | ${walletStr} | ${detectNetwork(RPC_URL)} | ${mintShort} | ${lastTime} | ${countdown}s${pauseStr}${errStr} | ${hotkeys} [TAB]Switch [ESC]Back [:]Cmd [Q]Quit`
  );
}

function updateTopNav() {
  const cfg = liveData.config;
  const name = (cfg && cfg.name) || state.config.name || 'Connecting...';
  const symbol = (cfg && cfg.symbol) || state.config.symbol || '...';
  const preset = (cfg && cfg.preset) || state.config.preset || 'N/A';
  const mintShort = shortAddr(state.mintAddress);
  const network = detectNetwork(RPC_URL);
  const loadingStr = liveData.loading ? '{yellow-fg}SYNCING{/yellow-fg}' : '';

  topNav.setContent(
    ` {bold}ASSET:{/bold} ${name} (${symbol}) | ` +
    `{bold}MINT:{/bold} ${mintShort} | ` +
    `{bold}PRESET:{/bold} ${preset} | ` +
    `{bold}NET:{/bold} ${network} | ` +
    `{bold}STATUS:{/bold} ${state.isPaused ? '{red-fg}HALTED{/red-fg}' : '{green-fg}LIVE{/green-fg}'} | ` +
    `{bold}MODE:{/bold} ${walletMode ? '{green-fg}OPERATOR{/green-fg}' : '{red-fg}Read-Only{/red-fg}'}` +
    (loadingStr ? ' | ' + loadingStr : '')
  );
}

// --- 9. ONBOARDING FLOW ---
function renderSplash() {
  let skipped = false;
  let animInterval = null;

  // Tag helpers (avoid JS parser confusing {/ with regex)
  const D = '{' + colors.dim + '-fg}';
  const _D = '{/' + colors.dim + '-fg}';
  const A = '{' + colors.accent + '-fg}';
  const _A = '{/' + colors.accent + '-fg}';
  const S = '{' + colors.success + '-fg}';
  const _S = '{/' + colors.success + '-fg}';
  const W = '{' + colors.warning + '-fg}';
  const _W = '{/' + colors.warning + '-fg}';
  const C = '{' + colors.secondary + '-fg}';
  const _C = '{/' + colors.secondary + '-fg}';
  const DN = '{' + colors.danger + '-fg}';
  const _DN = '{/' + colors.danger + '-fg}';

  const network = detectNetwork(RPC_URL);
  const mintShort = MINT.slice(0, 6) + '...' + MINT.slice(-4);

  const logoLines = [
    '    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557',
    '    \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d',
    '    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557',
    '    \u255a\u2550\u2550\u2550\u2550\u2588\u2588\u2551 \u255a\u2550\u2550\u2550\u2550\u2588\u2588\u2551 \u255a\u2550\u2550\u2550\u2550\u2588\u2588\u2551',
    '    \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551',
    '    \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u255d',
  ];

  // Animation canvas
  const animBox = blessed.box({
    parent: splashScreen, top: 0, left: 0, width: '100%', height: '100%',
    style: { bg: colors.bg, fg: colors.accent },
    tags: false
  });

  const skipHint = blessed.text({
    parent: splashScreen, bottom: 0, left: 0, width: '100%', height: 1, align: 'center',
    content: 'Press any key to skip',
    style: { bg: colors.bg, fg: colors.dim }, tags: false
  });

  const w = screen.width;
  const h = screen.height;
  const cy = Math.floor(h / 2);

  // EKG waveform — realistic P-QRS-T morphology
  function ekg(t) {
    t = ((t % 1) + 1) % 1;
    if (t < 0.08) return 0;
    if (t < 0.12) return Math.sin((t - 0.08) / 0.04 * Math.PI) * 0.25; // P wave
    if (t < 0.18) return 0;
    if (t < 0.20) return -0.15;  // Q dip
    if (t < 0.23) return 1.0;    // R spike
    if (t < 0.26) return -0.4;   // S dip
    if (t < 0.30) return 0;
    if (t < 0.38) return Math.sin((t - 0.30) / 0.08 * Math.PI) * 0.2; // T wave
    return 0;
  }

  // Status text that updates during EKG phase
  const statusMsgs = [
    { at: 0,   txt: 'Connecting to Solana...' },
    { at: 15,  txt: 'Proof of History: SYNCED' },
    { at: 30,  txt: 'Loading Token-2022 extensions...' },
    { at: 45,  txt: 'Transfer hooks: ONLINE' },
    { at: 55,  txt: 'Permanent delegate: ARMED' },
    { at: 65,  txt: 'TPS: yes' },
    { at: 72,  txt: '400ms finality \u2014 your bank could never' },
    { at: 82,  txt: 'All systems nominal.' },
  ];

  // Particles for logo materialization
  const particles = [];
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2;
    particles.push({ angle: angle, speed: 0.8 + Math.random() * 1.2 });
  }

  // Build a 2D grid, render to string
  function makeGrid() {
    const g = [];
    for (let y = 0; y < h; y++) {
      g.push(new Array(w).fill(' '));
    }
    return g;
  }

  function gridToString(g) {
    let s = '';
    for (let y = 0; y < h; y++) {
      s += g[y].join('');
      if (y < h - 1) s += '\n';
    }
    return s;
  }

  function placeText(g, row, col, text) {
    for (let i = 0; i < text.length; i++) {
      const x = col + i;
      if (x >= 0 && x < w && row >= 0 && row < h) g[row][x] = text[i];
    }
  }

  function placeTextCentered(g, row, text) {
    placeText(g, row, Math.floor((w - text.length) / 2), text);
  }

  const FPS = 20;
  // Phases: EKG 0-90, flash 91-98, logo 99-130, text 131-155, done 156+
  let frame = 0;

  function animate() {
    if (skipped) return;
    frame++;
    const grid = makeGrid();

    // ====== PHASE 1: EKG WAVEFORM (frames 1-90) ======
    if (frame <= 90) {
      const speed = frame < 70 ? 1.5 : 1.5 + (frame - 70) * 0.15; // accelerates near end
      const cycleW = frame < 70 ? 35 : Math.max(15, 35 - (frame - 70) * 1); // compresses
      const amplitude = 4;

      // Sweep position (how far we've drawn)
      const sweepX = Math.min(Math.floor(frame * speed), w - 1);

      // Draw EKG trace
      for (let x = 0; x <= sweepX && x < w; x++) {
        const t = x / cycleW;
        const val = ekg(t);
        const dy = Math.round(val * amplitude);
        const plotY = cy - dy;

        if (plotY >= 0 && plotY < h) {
          if (Math.abs(val) > 0.5) grid[plotY][x] = '\u2588'; // full block for R spike
          else if (Math.abs(val) > 0.15) grid[plotY][x] = '\u2593'; // dark shade
          else if (Math.abs(val) > 0.05) grid[plotY][x] = '\u2591'; // light shade
          else grid[plotY][x] = '\u2500'; // baseline dash
        }
        // Baseline where signal is zero
        if (Math.abs(val) < 0.01 && cy >= 0 && cy < h) {
          grid[cy][x] = '\u2500';
        }
      }

      // Sweep cursor (vertical line at leading edge)
      if (sweepX < w) {
        for (let dy = -amplitude - 1; dy <= amplitude + 1; dy++) {
          const py = cy + dy;
          if (py >= 0 && py < h) {
            if (grid[py][sweepX] === ' ') grid[py][sweepX] = '\u2502';
          }
        }
        // Bright dot at cursor intersection with trace
        const curT = sweepX / cycleW;
        const curVal = ekg(curT);
        const curY = cy - Math.round(curVal * amplitude);
        if (curY >= 0 && curY < h) grid[curY][sweepX] = '\u25cf';
      }

      // Top-left: protocol label
      placeText(grid, 1, 2, 'SSS PROTOCOL v0.1.0-beta');

      // Top-right: network
      const netStr = network;
      placeText(grid, 1, w - netStr.length - 2, netStr);

      // Bottom-left: scrolling status text
      let statusTxt = '';
      for (let i = statusMsgs.length - 1; i >= 0; i--) {
        if (frame >= statusMsgs[i].at) { statusTxt = '> ' + statusMsgs[i].txt; break; }
      }
      placeText(grid, h - 3, 2, statusTxt);

      // Bottom-right: BPM counter (increases as animation speeds up)
      const bpm = frame < 70 ? '72 BPM' : Math.floor(72 + (frame - 70) * 4) + ' BPM';
      placeText(grid, h - 3, w - bpm.length - 2, bpm);

      // Frame corners
      placeText(grid, 0, 0, '\u250c');
      placeText(grid, 0, w - 1, '\u2510');
      placeText(grid, h - 2, 0, '\u2514');
      placeText(grid, h - 2, w - 1, '\u2518');
      for (let x = 1; x < w - 1; x++) { grid[0][x] = '\u2500'; grid[h - 2][x] = '\u2500'; }
      for (let y = 1; y < h - 2; y++) { grid[y][0] = '\u2502'; grid[y][w - 1] = '\u2502'; }
    }

    // ====== PHASE 2: FLASH + NOISE (frames 91-98) ======
    else if (frame <= 98) {
      const noiseChars = '\u2591\u2592\u2593\u2588\u2571\u2572\u2500\u2502\u253c\u00b7:+*';
      const intensity = frame <= 94 ? 0.5 : 0.5 - (frame - 94) * 0.1;

      if (frame <= 93) {
        // Full flash — amber bg
        animBox.style.bg = colors.accent;
        animBox.style.fg = 'black';
      } else {
        animBox.style.bg = colors.bg;
        animBox.style.fg = colors.accent;
      }

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (Math.random() < intensity) {
            grid[y][x] = noiseChars[Math.floor(Math.random() * noiseChars.length)];
          }
        }
      }
    }

    // ====== PHASE 3: LOGO MATERIALIZES (frames 99-135) ======
    else if (frame <= 135) {
      animBox.style.bg = colors.bg;
      animBox.style.fg = colors.accent;

      const progress = (frame - 99) / 36; // 0 to 1
      const logoTop = cy - 4;

      // Particles radiating outward (fading as they go)
      if (progress < 0.6) {
        const particleChars = '\u00b7\u2022\u2605*+\u2583\u2581';
        for (const p of particles) {
          const radius = progress * 40;
          const px = Math.floor(w / 2 + Math.cos(p.angle) * radius * p.speed);
          const py = Math.floor(cy + Math.sin(p.angle) * radius * p.speed * 0.4);
          if (px >= 0 && px < w && py >= 0 && py < h) {
            grid[py][px] = particleChars[Math.floor(Math.random() * particleChars.length)];
          }
        }
      }

      // Logo lines reveal (scanline top to bottom)
      const linesToShow = Math.min(Math.ceil(progress * (logoLines.length + 2)), logoLines.length);
      for (let i = 0; i < linesToShow; i++) {
        const line = logoLines[i];
        const startX = Math.floor((w - line.length) / 2);
        // Glitch effect on most recently revealed line
        const isNewest = (i === linesToShow - 1) && progress < 0.8;
        for (let j = 0; j < line.length; j++) {
          const x = startX + j;
          if (x >= 0 && x < w && logoTop + i >= 0 && logoTop + i < h) {
            if (isNewest && Math.random() < 0.15) {
              grid[logoTop + i][x] = '\u2592'; // glitch char on newest line
            } else {
              grid[logoTop + i][x] = line[j];
            }
          }
        }
      }
    }

    // ====== PHASE 4: LOGO + TEXT HOLD (frames 136-160) ======
    else if (frame <= 160) {
      animBox.style.bg = colors.bg;
      animBox.style.fg = colors.accent;

      const logoTop = cy - 4;

      // Solid logo
      for (let i = 0; i < logoLines.length; i++) {
        placeTextCentered(grid, logoTop + i, logoLines[i]);
      }

      // Title appears at frame 138
      if (frame >= 138) {
        placeTextCentered(grid, logoTop + logoLines.length + 1, 'SOLANA STABLECOIN STANDARD');
      }

      // Subtitle at frame 143
      if (frame >= 143) {
        placeTextCentered(grid, logoTop + logoLines.length + 2, 'Institutional-grade stablecoin infrastructure on Solana');
      }

      // "gm." at frame 148
      if (frame >= 148) {
        placeTextCentered(grid, logoTop + logoLines.length + 4, 'gm.');
      }

      // "few understand." at frame 152
      if (frame >= 152) {
        placeTextCentered(grid, logoTop + logoLines.length + 5, 'few understand.');
      }

      // Bottom hint
      if (frame >= 148) {
        placeTextCentered(grid, h - 2, 'Press any key to continue...');
      }
    }

    // ====== PHASE 5: TRANSITION (frame 161+) ======
    else {
      if (animInterval) clearInterval(animInterval);
      animBox.destroy();
      skipHint.destroy();
      showMainSplash();
      return;
    }

    animBox.setContent(gridToString(grid));
    screen.render();
  }

  animInterval = setInterval(animate, 1000 / FPS);

  // --- Skip handler ---
  function onSkip() {
    if (skipped) return;
    skipped = true;
    if (animInterval) clearInterval(animInterval);
    screen.removeListener('keypress', onSkip);
    animBox.destroy();
    skipHint.destroy();
    showMainSplash();
  }
  screen.on('keypress', onSkip);

  screen.render();

  // ==================== MAIN SPLASH (after animation) ====================
  function showMainSplash() {
    // --- Top accent bar ---
    blessed.box({
      parent: splashScreen, top: 0, left: 0, width: '100%', height: 1,
      style: { bg: colors.accent }, content: ''
    });

    // --- ASCII Logo ---
    blessed.text({
      parent: splashScreen, top: 2, left: 'center', align: 'center',
      content: '{bold}' + logoLines.join('\n') + '{/bold}',
      style: { fg: colors.accent }, tags: true
    });

    blessed.text({
      parent: splashScreen, top: 9, left: 'center', align: 'center',
      content: '{bold}SOLANA STABLECOIN STANDARD{/bold}',
      style: { fg: colors.text }, tags: true
    });

    blessed.text({
      parent: splashScreen, top: 10, left: 'center', align: 'center',
      content: D + 'Institutional-grade stablecoin infrastructure on Solana  \u00b7  Token-2022' + _D,
      style: { fg: colors.dim }, tags: true
    });

    blessed.box({
      parent: splashScreen, top: 12, left: 4, width: '100%-8', height: 1,
      content: '\u2500'.repeat(120), style: { fg: colors.border }
    });

    // --- Info panels ---
    blessed.box({
      parent: splashScreen, top: 14, left: 4, width: '50%-6', height: 8,
      border: { type: 'line', fg: colors.border },
      label: ' ' + A + '{bold} WHAT IS SSS? {/bold}' + _A + ' ',
      tags: true, padding: { left: 1, right: 1 },
      style: { fg: colors.text, bg: colors.bg },
      content:
        'SSS is an open-source framework for issuing\n' +
        'regulated stablecoins on Solana using Token-2022.\n\n' +
        'It provides on-chain programs, a CLI, and this\n' +
        'operator terminal for full lifecycle management\n' +
        'of institutional digital assets.'
    });

    blessed.box({
      parent: splashScreen, top: 14, left: '50%+2', width: '50%-6', height: 8,
      border: { type: 'line', fg: colors.border },
      label: ' ' + A + '{bold} ARCHITECTURE PRESETS {/bold}' + _A + ' ',
      tags: true, padding: { left: 1, right: 1 },
      style: { fg: colors.text, bg: colors.bg },
      content:
        '{bold}' + C + 'SSS-1' + _C + '{/bold} Minimal     Mint + Freeze + Metadata\n' +
        '{bold}' + C + 'SSS-2' + _C + '{/bold} Compliant   + Seize + Blacklist + Hooks\n' +
        '{bold}' + C + 'SSS-3' + _C + '{/bold} Private     + Confidential Transfers (ZK)\n\n' +
        D + 'Each preset builds on the previous one.' + _D + '\n' +
        D + 'Select your preset after this screen.' + _D
    });

    blessed.box({
      parent: splashScreen, top: 23, left: 4, width: '50%-6', height: 10,
      border: { type: 'line', fg: colors.border },
      label: ' ' + A + '{bold} OPERATOR CAPABILITIES {/bold}' + _A + ' ',
      tags: true, padding: { left: 1, right: 1 },
      style: { fg: colors.text, bg: colors.bg },
      content:
        '{bold}' + S + 'MINT' + _S + '{/bold}       Issue tokens to any address\n' +
        '{bold}' + DN + 'BURN' + _DN + '{/bold}       Destroy tokens from supply\n' +
        '{bold}' + C + 'FREEZE' + _C + '{/bold}     Lock an account from transfers\n' +
        '{bold}' + C + 'THAW' + _C + '{/bold}       Unlock a frozen account\n' +
        '{bold}' + W + 'BLACKLIST' + _W + '{/bold}  Block address via transfer hook\n' +
        '{bold}' + DN + 'SEIZE' + _DN + '{/bold}      Reclaim tokens (permanent delegate)\n' +
        '{bold}' + A + 'ATTEST' + _A + '{/bold}     Publish reserve proof on-chain\n' +
        '{bold}' + D + 'PAUSE' + _D + '{/bold}      Halt all token operations'
    });

    blessed.box({
      parent: splashScreen, top: 23, left: '50%+2', width: '50%-6', height: 10,
      border: { type: 'line', fg: colors.border },
      label: ' ' + A + '{bold} TERMINAL FEATURES {/bold}' + _A + ' ',
      tags: true, padding: { left: 1, right: 1 },
      style: { fg: colors.text, bg: colors.bg },
      content:
        '{bold}' + A + 'Command Hub' + _A + '{/bold}    Quick-action tiles on tab 01\n' +
        '{bold}' + A + 'Hotkeys' + _A + '{/bold}        M/B/F/K/P/A for instant actions\n' +
        '{bold}' + A + ': Palette' + _A + '{/bold}      Type : to open command search\n' +
        '{bold}' + A + 'Live Data' + _A + '{/bold}      Auto-refresh from on-chain state\n' +
        '{bold}' + A + 'CSV Export' + _A + '{/bold}     Export any tab with [X]\n' +
        '{bold}' + A + 'Audit Trail' + _A + '{/bold}    Full transfer history + search\n' +
        '{bold}' + A + 'Read-Only' + _A + '{/bold}      Works without keypair for auditors\n' +
        '{bold}' + A + 'Custom RPC' + _A + '{/bold}     Set RPC_URL in tui/.env'
    });

    blessed.box({
      parent: splashScreen, top: 34, left: 4, width: '100%-8', height: 1,
      content: '\u2500'.repeat(120), style: { fg: colors.border }
    });

    blessed.text({
      parent: splashScreen, top: 36, left: 'center', align: 'center',
      content: D + 'Network: ' + network + '  \u00b7  Mint: ' + mintShort + '  \u00b7  Mode: ' + (walletMode ? 'Operator' : 'Read-Only') + _D,
      style: { fg: colors.dim }, tags: true
    });

    const btn = blessed.button({
      parent: splashScreen, top: 38, left: 'center', width: 40, height: 3,
      content: '{bold}LFG  \u25b6  ENTER DEPLOYMENT WIZARD{/bold}', align: 'center', valign: 'middle',
      tags: true,
      style: {
        bg: colors.border, fg: colors.accent,
        focus: { bg: colors.accent, fg: 'black', bold: true },
        hover: { bg: colors.accent, fg: 'black' }
      },
      mouse: true, keys: true
    });

    blessed.box({
      parent: splashScreen, bottom: 1, left: 0, width: '100%', height: 1,
      style: { bg: colors.bg },
      content: '{center}' + D + 'Press ENTER to continue  \u00b7  Q to quit  \u00b7  v0.1.0-beta  \u00b7  wagmi' + _D + '{/center}',
      tags: true
    });

    blessed.box({
      parent: splashScreen, bottom: 0, left: 0, width: '100%', height: 1,
      style: { bg: colors.accent }, content: ''
    });

    btn.focus();
    btn.on('press', () => {
      splashScreen.children.slice().forEach(c => c.destroy());
      splashScreen.hide();
      presetScreen.show();
      renderPresetPicker();
    });

    screen.render();
  }
}

function renderPresetPicker() {
  blessed.text({
    parent: presetScreen, top: 1, left: 2,
    content: 'STEP 1: SELECT ARCHITECTURE PRESET', style: { fg: colors.accent, bold: true }
  });

  const list = blessed.list({
    parent: presetScreen, top: 4, left: 2, width: '40%', height: '80%',
    items: ['> SSS-1: Minimal Stablecoin', '> SSS-2: Compliant Stablecoin', '> SSS-3: Private Stablecoin'],
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
    if (index === 2) details.setContent('SSS-3: PRIVATE STABLECOIN\n\nConfidential transfers with ZK proofs.\n\n+ All SSS-1 Features\n+ Permanent Delegate\n+ ConfidentialTransferMint Extension\n+ Encrypted Balances & Transfers\n\nNote: ZK ElGamal Proof Program is\ncurrently disabled on Solana.\nConfidential transfer operations\nare coming soon.');
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
    if (activeModals.length > 0) return; // Don't switch tabs while a modal is open
    state.activeTab = index;
    focusPane = 'main';
    updateFocusIndicator();
    renderTabContent();
    // Focus first interactive child in main content (skip textboxes — they block hotkeys)
    const firstChild = mainContent.children.find(c => c.focus && (c.type === 'list-table' || c.type === 'button' || c.type === 'list'));
    if (firstChild) firstChild.focus();
  });

  screen.key(['tab'], () => {
    if (isModalOrInputFocused()) return;
    if (focusPane === 'sidebar') {
      focusPane = 'main';
      const firstChild = mainContent.children.find(c => c.focus && (c.type === 'list-table' || c.type === 'button' || c.type === 'list'));
      if (firstChild) firstChild.focus();
      else mainContent.focus();
    } else {
      focusPane = 'sidebar';
      sideMenu.focus();
    }
    updateFocusIndicator();
    screen.render();
  });

  // Escape from main content returns to sidebar
  screen.key(['escape'], () => {
    if (isModalOrInputFocused()) return;
    if (focusPane === 'main') {
      focusPane = 'sidebar';
      sideMenu.focus();
      updateFocusIndicator();
      screen.render();
    }
  });

  // Quick tab switching: 1-9
  const tabKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  tabKeys.forEach((key, idx) => {
    screen.key([key], () => {
      if (isModalOrInputFocused()) return;
      state.activeTab = idx;
      sideMenu.select(idx);
      renderTabContent();
    });
  });

  screen.key(['r'], () => {
    if (isModalOrInputFocused()) return;
    refreshData();
  });

  // Command Palette via ':' key
  let commandInput = null;
  let commandSuggestion = null;

  const COMMANDS = {
    mint: { type: 'action', action: 'mint' },
    burn: { type: 'action', action: 'burn' },
    freeze: { type: 'action', action: 'freeze' },
    thaw: { type: 'action', action: 'thaw' },
    blacklist: { type: 'action', action: 'blacklistAdd' },
    seize: { type: 'action', action: 'seize' },
    pause: { type: 'action', action: 'pause' },
    unpause: { type: 'action', action: 'unpause' },
    attest: { type: 'action', action: 'attest' },
    roles: { type: 'tab', tab: 4 },
    minter: { type: 'action', action: 'updateMinter' },
    authority: { type: 'action', action: 'transferAuthority' },
    export: { type: 'export' },
    hub: { type: 'tab', tab: 0 },
    supply: { type: 'tab', tab: 1 },
    holders: { type: 'tab', tab: 6 },
    history: { type: 'tab', tab: 7 },
    config: { type: 'tab', tab: 8 },
  };

  function openCommandPalette() {
    if (commandInput) return;

    commandInput = blessed.textarea({
      parent: screen,
      bottom: 1, left: 0, width: '100%', height: 1,
      style: { bg: colors.border, fg: colors.accent },
      inputOnFocus: true, mouse: true
    });

    commandSuggestion = blessed.box({
      parent: screen,
      bottom: 2, left: 0, width: '100%', height: 1,
      style: { bg: colors.bg, fg: colors.dim },
      tags: true
    });

    commandInput.focus();
    commandInput.readInput();
    screen.render();

    // Update suggestions as user types
    commandInput.on('keypress', (ch) => {
      setTimeout(() => {
        if (!commandInput) return;
        const val = (commandInput.getValue() || '').trim().toLowerCase();
        if (val.length > 0) {
          const matches = Object.keys(COMMANDS).filter(c => c.startsWith(val));
          commandSuggestion.setContent(
            matches.length > 0
              ? ' ' + matches.map(m => `{${colors.accent}-fg}${m}{/${colors.accent}-fg}`).join('  ')
              : ` {${colors.dim}-fg}No matches{/${colors.dim}-fg}`
          );
        } else {
          commandSuggestion.setContent(` {${colors.dim}-fg}Type a command: mint, burn, freeze, pause, export, hub...{/${colors.dim}-fg}`);
        }
        screen.render();
      }, 10);
    });

    commandInput.on('submit', (value) => {
      const cmd = (value || '').trim().toLowerCase();
      closeCommandPalette();

      // Find exact or partial match
      let match = COMMANDS[cmd];
      if (!match) {
        const partials = Object.keys(COMMANDS).filter(c => c.startsWith(cmd));
        if (partials.length === 1) match = COMMANDS[partials[0]];
      }

      if (!match) {
        showMessage('Command', 'Unknown command: ' + cmd, 2000);
        return;
      }

      if (match.type === 'action') {
        openActionModal(match.action);
      } else if (match.type === 'tab') {
        state.activeTab = match.tab;
        sideMenu.select(match.tab);
        renderTabContent();
      } else if (match.type === 'export') {
        // Trigger export for current tab (simulate 'x' key press)
        screen.emit('keypress', 'x', { name: 'x' });
      }
    });

    commandInput.key(['escape'], () => {
      closeCommandPalette();
    });
  }

  function closeCommandPalette() {
    if (commandInput) {
      commandInput.destroy();
      commandInput = null;
    }
    if (commandSuggestion) {
      commandSuggestion.destroy();
      commandSuggestion = null;
    }
    sideMenu.focus();
    screen.render();
  }

  screen.key([':'], () => {
    if (isModalOrInputFocused()) return;
    if (commandInput) return;
    openCommandPalette();
  });

  // --- Action Hotkey Routing ---
  const ACTION_HOTKEYS = {
    m: 'mint', b: 'burn', f: 'freeze', t: 'thaw',
    k: 'blacklistAdd', s: 'seize', p: null, a: 'attest',
    d: 'blacklistRemove', e: null, // 'e' is context-dependent
  };

  function isModalOrInputFocused() {
    if (activeModals.length > 0) return true;
    if (_formInputActive) return true;
    if (screen.focused && (screen.focused.type === 'textbox' || screen.focused.type === 'textarea')) return true;
    if (commandInput) return true;
    return false;
  }

  // Hub hotkeys: M, B, F, T, K, S, A
  ['m', 'b', 'f', 't', 'k', 's', 'a'].forEach(key => {
    screen.key([key], () => {
      if (isModalOrInputFocused()) return;
      if (state.activeTab === 0) {
        openActionModal(ACTION_HOTKEYS[key]);
      }
    });
  });

  // P toggles pause/unpause based on current state
  screen.key(['p'], () => {
    if (isModalOrInputFocused()) return;
    if (state.activeTab === 0) {
      openActionModal(state.isPaused ? 'unpause' : 'pause');
    }
  });

  // Supply tab hotkeys: M, B, F, T
  ['m', 'b', 'f', 't'].forEach(key => {
    screen.key([key], () => {
      if (isModalOrInputFocused()) return;
      if (state.activeTab === 1) {
        openActionModal(ACTION_HOTKEYS[key]);
      }
    });
  });

  // Blacklist tab hotkeys: A (add), D (delete/remove), S (seize)
  screen.key(['a'], () => {
    if (isModalOrInputFocused()) return;
    if (state.activeTab === 2) openActionModal('blacklistAdd');
    if (state.activeTab === 3) openActionModal('attest');
  });
  screen.key(['d'], () => {
    if (isModalOrInputFocused()) return;
    if (state.activeTab === 2) openActionModal('blacklistRemove');
  });
  screen.key(['s'], () => {
    if (isModalOrInputFocused()) return;
    if (state.activeTab === 2) openActionModal('seize');
  });

  // Roles tab: E for edit role
  screen.key(['e'], () => {
    if (isModalOrInputFocused()) return;
    if (state.activeTab === 4) openActionModal('updateRole');
    if (state.activeTab === 5) openActionModal('updateMinter');
  });

  startAutoRefresh();
  renderTabContent();
}

// --- 11. TAB SYSTEM ---
let screenContribWidgets = [];

function clearMainContent() {
  dismissAllModals();
  _formInputActive = false;
  _activeFormValues = [];
  // Clean up program-level paste handlers from destroyed textbox inputs
  mainContent.children.slice().forEach(child => {
    if (child._pasteHandler) {
      screen.program.removeListener('keypress', child._pasteHandler);
    }
    // Also check grandchildren (inputs inside forms)
    if (child.children) {
      child.children.forEach(gc => {
        if (gc._pasteHandler) screen.program.removeListener('keypress', gc._pasteHandler);
      });
    }
    child.destroy();
  });
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
    case 0: renderCommandHub(); break;
    case 1: renderSupplyTab(); break;
    case 2: renderBlacklistTab(); break;
    case 3: renderAttestationsTab(); break;
    case 4: renderRolesTab(); break;
    case 5: renderMintersTab(); break;
    case 6: renderTokenHoldersTab(); break;
    case 7: renderTransferHistoryTab(); break;
    case 8: renderSystemConfigTab(); break;
  }

  updateStatusBar();
  screen.render();
}

// --- 12. TAB RENDERERS ---

// Build manual-input form fields (same design as modal inputs — no blessed textbox quirks)
// fields: [{ parent, label, top, left, width }]
// submitBtn: the button to focus after last field / press on Enter from last field
// Returns { inputs, values, cleanup } — inputs[i].getValue() returns current value
function createFormInputs(fields, submitBtn) {
  const inputs = [];
  const values = [];
  _activeFormValues.push(values);  // Track so auto-refresh won't destroy forms with data

  fields.forEach((f, i) => {
    if (f.label) {
      blessed.text({ parent: f.parent, top: f.top, left: f.left || 2, content: f.label + ':', style: { fg: colors.accent } });
    }
    const inputTop = f.label ? f.top + 1 : f.top;
    const input = blessed.box({
      parent: f.parent, top: inputTop, left: f.left || 2,
      width: f.width || '90%', height: 1,
      style: { bg: colors.border, fg: colors.text },
      content: '', mouse: true, clickable: true,
    });
    values.push('');
    input.getValue = () => values[i] || '';
    input.on('click', () => activateInput(i));
    inputs.push(input);
  });

  let activeIdx = -1;

  function deactivateInputs() {
    activeIdx = -1;
    _formInputActive = false;
    inputs.forEach(inp => { inp.style.bg = colors.border; });
    renderAllInputs();
  }

  function activateInput(idx) {
    activeIdx = idx;
    _formInputActive = idx >= 0;
    inputs.forEach((inp, j) => {
      inp.style.bg = j === idx ? '#333333' : colors.border;
    });
    renderAllInputs();
  }

  function renderInputContent(idx) {
    const val = values[idx] || '';
    inputs[idx].setContent(val + (idx === activeIdx ? '_' : ''));
    screen.render();
  }

  function renderAllInputs() {
    inputs.forEach((_, i) => renderInputContent(i));
  }

  const handler = (ch, key) => {
    if (!key || activeIdx < 0) return;

    if (key.name === 'escape') {
      deactivateInputs();
      return;
    }

    if (key.name === 'tab') {
      if (activeIdx < inputs.length - 1) {
        activateInput(activeIdx + 1);
      } else if (submitBtn) {
        deactivateInputs();
        submitBtn.focus();
      }
      return;
    }

    if (key.name === 'enter' || key.name === 'return') {
      if (activeIdx < inputs.length - 1) {
        activateInput(activeIdx + 1);
      } else if (submitBtn) {
        // Deactivate form inputs before pressing submit so confirmAction gets clean focus.
        deactivateInputs();
        submitBtn.focus();
        submitBtn.press();
      }
      return;
    }

    if (key.ctrl && key.name === 'v') {
      const clip = getClipboard();
      if (clip) {
        values[activeIdx] = clip.split(/\r?\n/)[0];
        renderInputContent(activeIdx);
      }
      return;
    }

    if (key.name === 'backspace') {
      if (values[activeIdx].length > 0) {
        values[activeIdx] = values[activeIdx].slice(0, -1);
        renderInputContent(activeIdx);
      }
      return;
    }

    if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
      values[activeIdx] += ch;
      renderInputContent(activeIdx);
    }
  };
  screen.program.on('keypress', handler);

  // Tag for cleanup by clearMainContent
  inputs.forEach(inp => { inp._pasteHandler = handler; });

  // Click on submit deactivates inputs
  if (submitBtn) {
    const prepareSubmit = () => { deactivateInputs(); };
    submitBtn.on('focus', prepareSubmit);
    submitBtn.on('click', prepareSubmit);
    submitBtn.on('press', prepareSubmit);
  }

  return { inputs, values, activateFirst: () => activateInput(0) };
}

// === (renderOverviewTab removed — replaced by Command Hub) ===

// === TAB 1: SUPPLY OPS ===
function renderSupplyTab() {
  const cfg = liveData.config;
  const dec = cfg ? cfg.decimals : 6;
  const symbol = (cfg && cfg.symbol) || state.config.symbol || 'tokens';

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
    parent: mainContent, top: 7, left: 2, width: '45%', height: 16,
    border: { type: 'line', fg: colors.border }, label: ' Execute Mint '
  });
  const mintSubmitBtn = blessed.button({
    parent: mintForm, top: 7, left: 2, width: 20, height: 1,
    content: ' [ SUBMIT MINT ] ', style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  const mintInputs = createFormInputs([
    { parent: mintForm, label: 'Recipient Address', top: 1 },
    { parent: mintForm, label: 'Amount', top: 3 },
  ], mintSubmitBtn);

  bindSafePress(mintSubmitBtn, 'Mint Tokens', () => {
    const recipient = mintInputs.inputs[0].getValue().trim();
    const amountStr = mintInputs.inputs[1].getValue().trim();
    if (!recipient || !amountStr) { showMessage('Error', 'Fill in all fields.', 2000); return; }
    if (!isValidPubkey(recipient)) { showMessage('Error', 'Invalid recipient address.', 2000); return; }
    const amount = parseTokenAmount(amountStr, dec);
    if (!amount) { showMessage('Error', 'Invalid amount format.', 2000); return; }
    const preview = formatUsd(amount.toNumber(), 0) + ' ' + symbol;
    confirmAction('Mint Tokens', 'Minting: ' + preview + '\nTo: ' + shortAddr(recipient), 'high', () => {
    executeTx('Minting Tokens', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      const [minterPda] = getMinterInfoPda(configPda, wallet.publicKey);
      const mintPk = new PublicKey(MINT);
      const recipientPk = new PublicKey(recipient);
      const recipientAta = getAssociatedTokenAddressSync(mintPk, recipientPk, false, TOKEN_2022_PROGRAM_ID);
      const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
      const [auditPda] = getAuditLogPda(configPda, auditIdx);
      const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey, recipientAta, recipientPk, mintPk, TOKEN_2022_PROGRAM_ID
      );
      return await program.methods.mintTokens(amount)
        .accounts({
          minterAuthority: wallet.publicKey,
          config: configPda,
          minterInfo: minterPda,
          mint: mintPk,
          recipientTokenAccount: recipientAta,
          recipientBlacklist: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .preInstructions([createAtaIx])
        .signers([wallet])
        .rpc();
    });
    });
  });

  // Burn Form
  const burnForm = blessed.form({
    parent: mainContent, top: 7, left: '50%', width: '45%', height: 16,
    border: { type: 'line', fg: colors.danger }, label: ' Execute Burn '
  });
  const burnSubmitBtn = blessed.button({
    parent: burnForm, top: 7, left: 2, width: 20, height: 1,
    content: ' [ SUBMIT BURN ] ', style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  const burnInputs = createFormInputs([
    { parent: burnForm, label: 'Source (empty = self)', top: 1 },
    { parent: burnForm, label: 'Burn Amount', top: 3 },
  ], burnSubmitBtn);

  bindSafePress(burnSubmitBtn, 'Burn Tokens', () => {
    const sourceAddr = burnInputs.inputs[0].getValue().trim();
    const amountStr = burnInputs.inputs[1].getValue().trim();
    if (!amountStr) { showMessage('Error', 'Enter an amount.', 2000); return; }
    if (sourceAddr && !isValidPubkey(sourceAddr)) { showMessage('Error', 'Invalid source address.', 2000); return; }
    const amount = parseTokenAmount(amountStr, dec);
    if (!amount) { showMessage('Error', 'Invalid amount format.', 2000); return; }
    const burnFrom = sourceAddr && isValidPubkey(sourceAddr) ? new PublicKey(sourceAddr) : wallet.publicKey;
    const isSelf = burnFrom.equals(wallet.publicKey);
    const label = isSelf ? 'your wallet' : shortAddr(burnFrom.toBase58());
    confirmAction('Burn Tokens', 'Burning: ' + formatUsd(amount.toNumber(), 0) + ' ' + symbol + '\nFrom: ' + label, 'high', () => {
    executeTx('Burning Tokens', async () => {
      const [configPda] = getConfigPda(MINT);
      const mintPk = new PublicKey(MINT);
      const burnAta = getAssociatedTokenAddressSync(mintPk, burnFrom, false, TOKEN_2022_PROGRAM_ID);
      return await program.methods.burnTokens(amount)
        .accounts({
          burner: wallet.publicKey,
          config: configPda,
          mint: mintPk,
          burnTokenAccount: burnAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([wallet])
        .rpc();
    });
    });
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

  // Freeze Form (merged from Freeze/Thaw tab)
  const freezeForm = blessed.form({
    parent: mainContent, top: '55%', left: 2, width: '45%', height: 12,
    border: { type: 'line', fg: colors.danger }, label: ' Freeze Account '
  });
  const freezeBtn = blessed.button({
    parent: freezeForm, top: 4, left: 2, width: 22, height: 1,
    content: ' [ FREEZE ACCOUNT ] ', style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  const freezeInputs = createFormInputs([
    { parent: freezeForm, label: 'Target Address', top: 1 },
  ], freezeBtn);
  bindSafePress(freezeBtn, 'Freeze Account', () => {
    const address = freezeInputs.inputs[0].getValue().trim();
    if (!address) { showMessage('Error', 'Enter a target address.', 2000); return; }
    if (!isValidPubkey(address)) { showMessage('Error', 'Invalid target address.', 2000); return; }
    confirmAction('Freeze Account', 'Target: ' + shortAddr(address), 'high', () => {
    executeTx('Freezing Account', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      const targetPk = new PublicKey(address);
      const mintPk = new PublicKey(MINT);
      const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
      const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
      const [auditPda] = getAuditLogPda(configPda, auditIdx);
      return await program.methods.freezeAccount()
        .accounts({
          authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
          mint: mintPk, targetTokenAccount: targetAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }).signers([wallet]).rpc();
    });
    });
  });

  // Thaw Form (merged from Freeze/Thaw tab)
  const thawForm = blessed.form({
    parent: mainContent, top: '55%', left: '50%', width: '45%', height: 12,
    border: { type: 'line', fg: colors.success }, label: ' Thaw Account '
  });
  const thawBtn = blessed.button({
    parent: thawForm, top: 4, left: 2, width: 22, height: 1,
    content: ' [ THAW ACCOUNT ] ', style: { bg: colors.success, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  const thawInputs = createFormInputs([
    { parent: thawForm, label: 'Target Address', top: 1 },
  ], thawBtn);
  bindSafePress(thawBtn, 'Thaw Account', () => {
    const address = thawInputs.inputs[0].getValue().trim();
    if (!address) { showMessage('Error', 'Enter a target address.', 2000); return; }
    if (!isValidPubkey(address)) { showMessage('Error', 'Invalid target address.', 2000); return; }
    confirmAction('Thaw Account', 'Target: ' + shortAddr(address), 'normal', () => {
    executeTx('Thawing Account', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      const targetPk = new PublicKey(address);
      const mintPk = new PublicKey(MINT);
      const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
      const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
      const [auditPda] = getAuditLogPda(configPda, auditIdx);
      return await program.methods.thawAccount()
        .accounts({
          authority: wallet.publicKey, config: configPda, roleRegistry: rolesPda,
          mint: mintPk, targetTokenAccount: targetAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }).signers([wallet]).rpc();
    });
    });
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
    parent: mainContent, top: formTop - 3, left: 2, width: '95%', height: 12,
    border: { type: 'line', fg: colors.danger }, label: ' Add to Blacklist '
  });
  blessed.text({ parent: formBox, top: 1, left: 2, content: 'Address:' });
  const blAddrInput = blessed.textbox({
    parent: formBox, name: 'blAddress', top: 1, left: 12, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text, focus: { bg: '#333333' } }, inputOnFocus: true, mouse: true
  });
  blessed.text({ parent: formBox, top: 3, left: 2, content: 'Reason:' });
  const blReasonInput = blessed.textbox({
    parent: formBox, name: 'blReason', top: 3, left: 12, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text, focus: { bg: '#333333' } }, inputOnFocus: true, mouse: true
  });
  wireFormInputs([blAddrInput, blReasonInput]);
  const blSubmit = blessed.button({
    parent: formBox, top: 5, left: 2, width: 22, height: 1,
    content: ' [ ADD TO BLACKLIST ] ', style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  blSubmit.on('press', () => {
    const address = blAddrInput.getValue().trim();
    const reason = blReasonInput.getValue().trim();
    if (!address || !reason) { showMessage('Error', 'Fill in all fields.', 2000); return; }
    executeTx('Adding to Blacklist', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      const targetPk = new PublicKey(address);
      const [blPda] = getBlacklistPda(configPda, targetPk);
      const mintPk = new PublicKey(MINT);
      const targetAta = getAssociatedTokenAddressSync(mintPk, targetPk, false, TOKEN_2022_PROGRAM_ID);
      const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
      const [auditPda] = getAuditLogPda(configPda, auditIdx);
      return await program.methods.blacklistAdd({ reason })
        .accounts({
          authority: wallet.publicKey,
          config: configPda,
          roleRegistry: rolesPda,
          blacklistEntry: blPda,
          addressToBlacklist: targetPk,
          mint: mintPk,
          targetTokenAccount: targetAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
    });
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
  const roleAddrInput = blessed.textbox({
    parent: formBox, name: 'roleAddress', top: 1, left: 49, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text, focus: { bg: '#333333' } }, inputOnFocus: true, mouse: true
  });
  wireFormInputs([roleAddrInput]);

  const roleSubmit = blessed.button({
    parent: formBox, top: 3, left: 2, width: 20, height: 1,
    content: ' [ UPDATE ROLE ] ', style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  roleSubmit.on('press', () => {
    const address = roleAddrInput.getValue().trim();
    if (!address) { showMessage('Error', 'Enter a new address.', 2000); return; }
    const selectedIdx = roleList.selected || 0;
    const roleEnums = [{ pauser: {} }, { blacklister: {} }, { seizer: {} }];
    const roleEnum = roleEnums[selectedIdx];
    executeTx('Updating Role', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      const newHolder = new PublicKey(address);
      const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
      const [auditPda] = getAuditLogPda(configPda, auditIdx);
      return await program.methods.updateRoles({ role: roleEnum, newHolder })
        .accounts({
          authority: wallet.publicKey,
          config: configPda,
          roleRegistry: rolesPda,
        })
        .signers([wallet])
        .rpc();
    });
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
    parent: mainContent, top: formTop - 3, left: 2, width: '95%', height: 11,
    border: { type: 'line', fg: colors.border }, label: ' Add / Update Minter '
  });
  blessed.text({ parent: formBox, top: 1, left: 2, content: 'Address:' });
  const minterAddrInput = blessed.textbox({
    parent: formBox, name: 'minterAddress', top: 1, left: 12, width: '40%', height: 1,
    style: { bg: colors.border, fg: colors.text, focus: { bg: '#333333' } }, inputOnFocus: true, mouse: true
  });
  blessed.text({ parent: formBox, top: 3, left: 2, content: 'Quota:' });
  const minterQuotaInput = blessed.textbox({
    parent: formBox, name: 'minterQuota', top: 3, left: 12, width: '20%', height: 1,
    style: { bg: colors.border, fg: colors.text, focus: { bg: '#333333' } }, inputOnFocus: true, mouse: true
  });
  wireFormInputs([minterAddrInput, minterQuotaInput]);
  const minterSubmit = blessed.button({
    parent: formBox, top: 5, left: 2, width: 22, height: 1,
    content: ' [ UPDATE MINTER ] ', style: { bg: colors.secondary, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  minterSubmit.on('press', () => {
    const address = minterAddrInput.getValue().trim();
    const quotaStr = minterQuotaInput.getValue().trim();
    if (!address || !quotaStr) { showMessage('Error', 'Fill in all fields.', 2000); return; }
    if (!isValidPubkey(address)) { showMessage('Error', 'Invalid minter address.', 2000); return; }
    const quota = parseTokenAmount(quotaStr, dec);
    if (!quota) { showMessage('Error', 'Invalid quota format.', 2000); return; }
    executeTx('Updating Minter', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      const minterPk = new PublicKey(address);
      const [minterPda] = getMinterInfoPda(configPda, minterPk);
      const auditIdx = liveData.config ? liveData.config.auditLogIndex : 0;
      const [auditPda] = getAuditLogPda(configPda, auditIdx);
      return await program.methods.updateMinter({ isActive: true, mintQuota: quota })
        .accounts({
          authority: wallet.publicKey,
          config: configPda,
          roleRegistry: rolesPda,
          minterInfo: minterPda,
          minterWallet: minterPk,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet])
        .rpc();
    });
  });

  table.focus();
}

// === TAB 6: TOKEN HOLDERS ===
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

// === TAB 0: COMMAND HUB ===
function renderCommandHub() {
  const cfg = liveData.config;
  const dec = cfg ? cfg.decimals : 6;

  // --- Supply Stats Bar (compact, top) ---
  const statsBar = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '95%', height: 3,
    border: { type: 'line', fg: colors.border },
    tags: true
  });
  const currentSupply = cfg ? formatUsd(cfg.currentSupply, dec) : '...';
  const totalMinted = cfg ? formatUsd(cfg.totalMinted, dec) : '...';
  const totalBurned = cfg ? formatUsd(cfg.totalBurned, dec) : '...';
  const reserveStatus = liveData.attestations.length > 0 ? '{green-fg}ATTESTED{/green-fg}' : '{yellow-fg}PENDING{/yellow-fg}';
  statsBar.setContent(
    ` {bold}Supply:{/bold} ${currentSupply}  |  ` +
    `{green-fg}Minted:{/green-fg} ${totalMinted}  |  ` +
    `{red-fg}Burned:{/red-fg} ${totalBurned}  |  ` +
    `{bold}Reserve:{/bold} ${reserveStatus}  |  ` +
    `{bold}Status:{/bold} ${state.isPaused ? '{red-fg}PAUSED{/red-fg}' : '{green-fg}LIVE{/green-fg}'}`
  );

  // --- 2x4 Action Tile Grid ---
  const TILES = [
    { key: 'M', label: 'Mint', action: 'mint', color: colors.success },
    { key: 'B', label: 'Burn', action: 'burn', color: colors.danger },
    { key: 'F', label: 'Freeze', action: 'freeze', color: colors.secondary },
    { key: 'T', label: 'Thaw', action: 'thaw', color: colors.success },
    { key: 'K', label: 'Blacklist', action: 'blacklistAdd', color: colors.danger },
    { key: 'S', label: 'Seize', action: 'seize', color: colors.warning },
    { key: 'P', label: 'Pause', action: 'pause', color: colors.accent },
    { key: 'A', label: 'Attest', action: 'attest', color: colors.secondary },
  ];

  const tileWidth = Math.floor((mainContent.width - 6) / 4);
  const tileHeight = 5;
  let selectedTile = 0;

  const tileBoxes = TILES.map((tile, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const box = blessed.box({
      parent: mainContent,
      top: 6 + row * (tileHeight + 1),
      left: 2 + col * tileWidth,
      width: tileWidth - 1,
      height: tileHeight,
      border: { type: 'line', fg: i === selectedTile ? colors.accent : colors.border },
      tags: true,
      style: {
        bg: i === selectedTile ? colors.highlight : colors.bg,
        fg: colors.text,
      },
    });
    blessed.text({
      parent: box, top: 0, left: 'center', align: 'center',
      content: `{bold}{${tile.color}-fg}[${tile.key}]{/${tile.color}-fg}{/bold}`,
      tags: true, style: { fg: colors.text }
    });
    blessed.text({
      parent: box, top: 2, left: 'center', align: 'center',
      content: tile.label,
      style: { fg: colors.text, bold: true }
    });
    return box;
  });

  function updateTileSelection() {
    tileBoxes.forEach((box, i) => {
      box.style.border = { fg: i === selectedTile ? colors.accent : colors.border };
      box.style.bg = i === selectedTile ? colors.highlight : colors.bg;
    });
    screen.render();
  }

  // Arrow key navigation for tiles
  mainContent.key(['left'], () => { selectedTile = Math.max(0, selectedTile - 1); updateTileSelection(); });
  mainContent.key(['right'], () => { selectedTile = Math.min(TILES.length - 1, selectedTile + 1); updateTileSelection(); });
  mainContent.key(['up'], () => { selectedTile = selectedTile >= 4 ? selectedTile - 4 : selectedTile; updateTileSelection(); });
  mainContent.key(['down'], () => { selectedTile = selectedTile < 4 ? selectedTile + 4 : selectedTile; updateTileSelection(); });
  mainContent.key(['enter'], () => {
    if (typeof openActionModal === 'function') openActionModal(TILES[selectedTile].action);
  });

  // --- Bottom Left: Recent Activity ---
  const activityBox = blessed.box({
    parent: mainContent, top: 6 + 2 * (tileHeight + 1) + 1, left: 2,
    width: '47%', height: '100%-' + (6 + 2 * (tileHeight + 1) + 2),
    border: { type: 'line', fg: colors.border },
    label: ' Recent Activity ', tags: true
  });

  let activityContent = '';
  const logs = liveData.auditLogs || [];
  if (logs.length > 0) {
    logs.slice(-5).reverse().forEach(log => {
      const targetStr = log.target ? ' -> ' + shortAddr(log.target) : '';
      activityContent += ` ${dimText(formatTimestamp(log.timestamp))} {bold}${log.action}{/bold} by ${shortAddr(log.actor)}${targetStr}\n`;
    });
  } else {
    const txs = liveData.transactions.slice(0, 5);
    if (txs.length > 0) {
      txs.forEach(tx => {
        const status = tx.err ? '{red-fg}FAIL{/red-fg}' : '{green-fg}OK{/green-fg}';
        activityContent += ` ${status} ${tx.signature.slice(0, 12)}... ${dimText(tx.blockTime ? formatTimestamp(tx.blockTime) : 'pending')}\n`;
      });
    } else {
      activityContent = ' No recent activity.';
    }
  }
  blessed.text({
    parent: activityBox, top: 1, left: 1, tags: true,
    content: activityContent, style: { fg: colors.text }
  });

  // --- Bottom Right: System Status ---
  const systemBox = blessed.box({
    parent: mainContent, top: 6 + 2 * (tileHeight + 1) + 1, left: '52%',
    width: '43%', height: '100%-' + (6 + 2 * (tileHeight + 1) + 2),
    border: { type: 'line', fg: colors.border },
    label: ' System Status ', tags: true
  });

  const network = detectNetwork(RPC_URL);
  const solBal = liveData.solBalance !== null ? (liveData.solBalance / 1e9).toFixed(4) + ' SOL' : '...';
  const slot = liveData.slotHeight !== null ? liveData.slotHeight.toLocaleString() : '...';
  const walletAddr = walletMode ? shortAddr(wallet.publicKey.toBase58()) : 'N/A';

  blessed.text({
    parent: systemBox, top: 1, left: 2, tags: true,
    content:
      ` {bold}Network:{/bold}    ${network}\n` +
      ` {bold}Slot:{/bold}       ${slot}\n` +
      ` {bold}Operator:{/bold}   ${walletAddr}\n` +
      ` {bold}SOL:{/bold}        ${walletMode ? solBal : '{red-fg}N/A{/red-fg}'}\n` +
      ` {bold}Minters:{/bold}    ${liveData.minters.length}\n` +
      ` {bold}Blacklist:{/bold}  ${liveData.blacklist.length}\n` +
      ` {bold}Holders:{/bold}    ${liveData.holders.length}`,
    style: { fg: colors.text }
  });
}

// === TAB 8: SYSTEM & CONFIG (merged Config + Compliance + System Logs) ===
function renderSystemConfigTab() {
  const cfg = liveData.config;

  // --- Config section (top 0-45%) ---
  // Read-only config display (left)
  const configBox = blessed.box({
    parent: mainContent, top: 2, left: 2, width: '50%', height: '43%',
    border: { type: 'line', fg: colors.border },
    label: ' On-Chain Configuration ', tags: true
  });

  const yn = (v) => v ? '{green-fg}YES{/green-fg}' : '{red-fg}NO{/red-fg}';
  const ctFlag = (v) => v ? '{yellow-fg}INITIALIZED (ZK Pending){/yellow-fg}' : '{red-fg}NO{/red-fg}';

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
        ` Confidential Tx:     ${ctFlag(cfg.enableConfidentialTransfers)}\n` +
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
    parent: mainContent, top: 2, left: '55%', width: '40%', height: '43%',
    border: { type: 'line', fg: colors.border },
    label: ' TUI Settings ', tags: true
  });

  blessed.text({
    parent: settingsBox, top: 1, left: 2, tags: true,
    content:
      ` {bold}--- Connection ---{/bold}\n` +
      ` RPC URL:  ${RPC_URL}\n` +
      ` Mint:     ${MINT}\n` +
      ` Mode:     ${walletMode ? '{green-fg}OPERATOR{/green-fg}' : '{red-fg}Read-Only{/red-fg}'}\n` +
      `\n {bold}--- Refresh ---{/bold}\n` +
      ` Interval: ${currentRefreshInterval / 1000}s\n` +
      ` Last:     ${liveData.lastRefresh ? liveData.lastRefresh.toLocaleTimeString() : 'N/A'}\n` +
      `\n {bold}--- Keyboard ---{/bold}\n` +
      ` 1-9       : Switch tabs\n` +
      ` TAB        : Toggle focus\n` +
      ` R          : Manual refresh\n` +
      ` Q / Esc    : Quit\n` +
      `\n {bold}--- CLI Usage ---{/bold}\n` +
      ` node admin_tui.js \\\n` +
      `   --rpc <URL> \\\n` +
      `   --mint <MINT_ADDR> \\\n` +
      `   --keypair <PATH>`,
    style: { fg: colors.text }
  });

  // Pause / Unpause buttons
  const pauseBtn = blessed.button({
    parent: settingsBox, top: 16, left: 2, width: 16, height: 1,
    content: ' [ PAUSE ] ',
    style: { bg: colors.danger, fg: 'white', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  pauseBtn.on('press', () => {
    executeTx('Pausing Program', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      return await program.methods.pause()
        .accounts({
          authority: wallet.publicKey,
          config: configPda,
          roleRegistry: rolesPda,
        })
        .signers([wallet])
        .rpc();
    });
  });

  const unpauseBtn = blessed.button({
    parent: settingsBox, top: 16, left: 20, width: 18, height: 1,
    content: ' [ UNPAUSE ] ',
    style: { bg: colors.success, fg: 'black', focus: { bg: colors.accent } },
    mouse: true, keys: true
  });
  unpauseBtn.on('press', () => {
    executeTx('Unpausing Program', async () => {
      const [configPda] = getConfigPda(MINT);
      const [rolesPda] = getRoleRegistryPda(configPda);
      return await program.methods.unpause()
        .accounts({
          authority: wallet.publicKey,
          config: configPda,
          roleRegistry: rolesPda,
        })
        .signers([wallet])
        .rpc();
    });
  });

  // --- Compliance cards (46-55%) ---
  const blCount = liveData.blacklist.length;

  const providerBox = blessed.box({
    parent: mainContent, top: '46%', left: 2, width: '30%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Provider ', tags: true
  });
  blessed.text({
    parent: providerBox, top: 1, left: 2, tags: true,
    content: ` {bold}Engine:{/bold} SSS On-Chain\n {bold}Standard:{/bold} GENIUS Act\n {bold}Status:{/bold} {green-fg}ACTIVE{/green-fg}`,
    style: { fg: colors.text }
  });

  const screeningBox = blessed.box({
    parent: mainContent, top: '46%', left: '35%', width: '30%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Screening ', tags: true
  });
  blessed.text({
    parent: screeningBox, top: 1, left: 2, tags: true,
    content: ` {bold}Blacklisted:{/bold} ${blCount}\n {bold}Attestations:{/bold} ${liveData.attestations.length}\n {bold}Transfer Hook:{/bold} ${cfg && cfg.enableTransferHook ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
    style: { fg: colors.text }
  });

  const holderCount = liveData.holders.length;
  const clearRate = holderCount > 0 ? Math.round(((holderCount - blCount) / holderCount) * 100) : 100;

  const clearBox = blessed.box({
    parent: mainContent, top: '46%', left: '68%', width: '27%', height: 7,
    border: { type: 'line', fg: colors.border },
    label: ' Clearance ', tags: true
  });
  blessed.text({
    parent: clearBox, top: 1, left: 2, tags: true,
    content: ` {bold}Holders:{/bold} ${holderCount}\n {bold}Flagged:{/bold} ${blCount}\n {bold}Clear Rate:{/bold} {green-fg}${clearRate}%{/green-fg}`,
    style: { fg: colors.text }
  });

  // --- Activity Log with filters (56-100%) ---
  const filterBar = blessed.box({
    parent: mainContent, top: '56%', left: 2, width: '95%', height: 3,
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

  const logBox = blessed.box({
    parent: mainContent, top: '62%', left: 2, width: '95%', height: '100%-62%',
    border: { type: 'line', fg: colors.border },
    label: ' Activity Log ', tags: true, scrollable: true, alwaysScroll: true,
    keys: true, mouse: true,
  });

  function renderLogEntries() {
    logBox.children.slice().forEach(c => c.destroy());

    let entries = [];

    if (cfg) {
      entries.push({ time: formatTimestamp(cfg.updatedAt), level: 'INFO', msg: `Config last updated` });
      entries.push({ time: formatTimestamp(cfg.createdAt), level: 'INFO', msg: `Stablecoin initialized: ${cfg.name} (${cfg.symbol})` });
      if (cfg.isPaused) {
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

    entries.sort((a, b) => (b.time || '').localeCompare(a.time || ''));

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
    parent: mainContent, top: 16, left: 2, width: '95%',
    height: (liveData.config && liveData.config.enableConfidentialTransfers) ? '50%-17' : '100%-17',
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

  // SSS-3 Confidential Transfers note
  if (liveData.config && liveData.config.enableConfidentialTransfers) {
    const ctBox = blessed.box({
      parent: mainContent, top: '55%', left: 2, width: '95%', height: 12,
      border: { type: 'line', fg: colors.accent },
      label: ' SSS-3 Confidential Transfers ',
      tags: true
    });
    blessed.text({
      parent: ctBox, top: 1, left: 2, tags: true,
      content:
        ' {yellow-fg}COMING SOON{/yellow-fg}\n\n' +
        ' The ConfidentialTransferMint extension is initialized.\n' +
        ' ZK ElGamal Proof Program is disabled on Solana (June 2025).\n' +
        ' Encrypted transfers will activate when Solana re-enables ZK proofs.\n\n' +
        ' Current capabilities: All standard ops work (mint, burn, freeze, seize).\n' +
        ' Pending: Account configuration, deposits, ZK transfers, withdrawals.',
      style: { fg: colors.text }
    });
  }
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
screen.key(['q'], () => {
  if (isModalOrInputFocused()) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  process.exit(0);
});
screen.key(['C-c'], () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  process.exit(0);
});

// --- 14. INITIALIZE ---
renderSplash();
screen.render();
