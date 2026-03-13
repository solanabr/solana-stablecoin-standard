import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import { renderDocumentationPage } from "./docsPage.js";
import { Presets } from "../sdk/src/presets.ts";
import { SolanaStablecoin } from "../sdk/src/SolanaStablecoin.ts";
import {
  buildDeprecateReleaseInstruction,
  findRegistryConfigPda,
  buildRegisterStablecoinInstruction,
  buildRegisterReleaseInstruction,
  buildRegistryTransaction,
} from "../sdk/src/registryProgram.ts";
import { signAndSendTransaction } from "../sdk/src/wallet.ts";

const STORAGE_KEY = "sss-frontend-state-v1";
const DEVNET_PROGRAM_DEFAULTS = {
  rpcUrl: "https://api.devnet.solana.com",
  stablecoinProgram: "Gm2SdmH1ydLKmPtjNE4W2ZLjW5kMvPrx784L7oUcw4w",
  transferHookProgram: "E24UT9RMiw9zBh51ZMzXRdmoiLQ2PkVZ1sYhBKqazYy8",
  registryProgram: "5vedffCtRhecm5sSXJCbgrwe7GYnGC9XK5vWLiMHLVXB",
  tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
};
const runtime = {
  provider: null,
  busy: "",
  error: "",
  notice: "",
  lastSignature: "",
  modal: null,
  toasts: [],
};

const BASE_STABLECOINS = [
  {
    id: "usdr",
    name: "Regulated USD",
    symbol: "USDR",
    tier: "SSS-2",
    supply: "$4,750,000",
    status: "Paused",
    registry: "Registered",
    registryTone: "primary",
    statusTone: "warning",
    mint: "7xKz...f9Qa",
    configHash: "h29a...f82k",
    jurisdiction: "Cayman Islands",
    description: "Fiat-backed issuance with frozen-account controls and on-chain compliance hooks.",
    totalMinted: "5,000,000",
    totalBurned: "250,000",
    currentSupply: "4,750,000",
    frozenAccounts: "2",
    blacklisted: "4",
    featureFlags: [
      "Transfer hook enabled",
      "Default account frozen",
      "Registry auto-register",
      "Identity gating on mint",
    ],
    authorities: [
      ["Master authority", "4fP2...nQd8"],
      ["Mint authority", "7xKz...f9Qa"],
      ["Freeze authority", "2aLk...D91m"],
      ["Compliance signer", "A8d2...LmE4"],
    ],
    registryInfo: [
      ["Record status", "Published"],
      ["Website", "https://issuer.sss.dev"],
      ["Compliance docs", "https://docs.sss.dev/usdr"],
      ["Jurisdiction", "Cayman Islands"],
    ],
  },
  {
    id: "usds",
    name: "Solana Dollar",
    symbol: "USDS",
    tier: "SSS-1",
    supply: "$1,250,000",
    status: "Active",
    registry: "Registered",
    registryTone: "primary",
    statusTone: "success",
    mint: "4sDf...o18P",
    configHash: "s81f...k32c",
    jurisdiction: "United States",
    description: "Lean stable asset for fast settlement with only the core mint and burn surfaces enabled.",
    totalMinted: "1,250,000",
    totalBurned: "0",
    currentSupply: "1,250,000",
    frozenAccounts: "0",
    blacklisted: "0",
    featureFlags: [
      "Basic mint and burn",
      "Transferable by default",
      "Registry listed",
      "No confidential transfers",
    ],
    authorities: [
      ["Mint authority", "8N5a...vQ2p"],
      ["Treasury vault", "H1s8...aP91"],
      ["Ops signer", "Q4d8...eY55"],
      ["Freeze authority", "Disabled"],
    ],
    registryInfo: [
      ["Record status", "Published"],
      ["Website", "https://solanadollar.dev"],
      ["Compliance docs", "n/a"],
      ["Jurisdiction", "United States"],
    ],
  },
  {
    id: "usdp",
    name: "Private USD",
    symbol: "USDP",
    tier: "SSS-3",
    supply: "$9,800,000",
    status: "Preview",
    registry: "Deprecated",
    registryTone: "warning",
    statusTone: "warning",
    mint: "9P1q...Jb4n",
    configHash: "p99m...x1a2",
    jurisdiction: "Singapore",
    description: "Restricted deployment testing advanced privacy and proof surfaces before public release.",
    totalMinted: "10,000,000",
    totalBurned: "200,000",
    currentSupply: "9,800,000",
    frozenAccounts: "1",
    blacklisted: "9",
    featureFlags: [
      "Confidential transfers",
      "ZK compliance proofs",
      "Compressed compliance state",
      "Private registry payload",
    ],
    authorities: [
      ["Master authority", "Q1u6...mN92"],
      ["Mint authority", "3Hg4...Lr5q"],
      ["Privacy oracle", "7Mq1...gA17"],
      ["Compliance signer", "B55d...kP1z"],
    ],
    registryInfo: [
      ["Record status", "Deprecated"],
      ["Website", "https://privateusd.example"],
      ["Compliance docs", "https://privateusd.example/framework"],
      ["Jurisdiction", "Singapore"],
    ],
  },
];

const BASE_REGISTRY_ENTRIES = [
  { name: "Regulated USD", symbol: "USDR", tier: "SSS-2", issuer: "Stable Studio", status: "Published", tone: "primary", jurisdiction: "Cayman Islands" },
  { name: "Solana Dollar", symbol: "USDS", tier: "SSS-1", issuer: "Northstar Treasury", status: "Published", tone: "primary", jurisdiction: "United States" },
  { name: "Private USD", symbol: "USDP", tier: "SSS-3", issuer: "Blue Meridian", status: "Deprecated", tone: "warning", jurisdiction: "Singapore" },
];

const BASE_ACTIVITY = [
  { type: "success", title: "Minted 50,000 USDR", detail: "Tx 4y1E...9pL2 completed under master authority.", when: "2 mins ago" },
  { type: "warning", title: "Registry payload queued", detail: "USDR disclosure package waiting for compliance signature.", when: "14 mins ago" },
  { type: "danger", title: "Freeze request opened", detail: "Account 91oP...9aWd flagged by monitoring pipeline.", when: "42 mins ago" },
  { type: "success", title: "Release v1.0.0 published", detail: "SSS registry release promoted to production.", when: "Today 08:16" },
];

const HELP_TOPICS = [
  { title: "What is SSS-1", body: "Minimal tier for teams that only need issuance, burn, and straightforward transfer behavior." },
  { title: "What is SSS-2", body: "Compliance-forward tier with roles, registry metadata, and identity-aware controls." },
  { title: "What is SSS-3", body: "Advanced tier for privacy, compressed state, and proof-driven controls under tighter ops discipline." },
  { title: "Common errors", body: "Missing metadata URI, invalid base58 authorities, and registry payload mismatches are the main setup failures." },
  { title: "Registry missing fields", body: "Website, jurisdiction, and contact data must all be present before publication can complete." },
  { title: "Operational warnings", body: "Do not assign master authority to a hot wallet. Prefer multisig or a cold signer for production." },
];

const DASHBOARD_METRICS = [
  ["Managed stablecoins", "12", "+2 this week"],
  ["Total supply", "$1.24B", "+5.2%"],
  ["Paused tokens", "02", "Action required"],
  ["Blacklisted", "45", "+4 accounts"],
];

const BASE_RELEASES = [
  {
    id: "v1.0.0-sss-1",
    standardVersion: "v1.0.0",
    preset: "SSS-1",
    schemaHash: "schema-sss1-a4f9c0",
    notesUri: "https://docs.sss.dev/releases/v1.0.0-sss1",
    deprecated: false,
    replacementVersion: "",
    tone: "success",
    status: "Published",
  },
  {
    id: "v1.0.0-sss-2",
    standardVersion: "v1.0.0",
    preset: "SSS-2",
    schemaHash: "schema-sss2-d94af1",
    notesUri: "https://docs.sss.dev/releases/v1.0.0-sss2",
    deprecated: false,
    replacementVersion: "",
    tone: "success",
    status: "Published",
  },
  {
    id: "v0.9.4-sss-1",
    standardVersion: "v0.9.4",
    preset: "SSS-1",
    schemaHash: "schema-sss1-legacy",
    notesUri: "https://docs.sss.dev/releases/v0.9.4-sss1",
    deprecated: true,
    replacementVersion: "v1.0.0",
    tone: "warning",
    status: "Deprecated",
  },
];

const BASE_WEBHOOKS = [
  {
    id: "hook-blacklist-1",
    endpoint: "https://ops.stable-studio.io/hooks/compliance",
    eventType: "WALLET_BLACKLISTED",
    secretLabel: "comp-prod-01",
    status: "Healthy",
    tone: "success",
    retryPolicy: "3 retries",
    deliveryRate: "99.8%",
  },
  {
    id: "hook-mint-1",
    endpoint: "https://ops.stable-studio.io/hooks/minting",
    eventType: "MINT_COMPLETED",
    secretLabel: "mint-prod-02",
    status: "Healthy",
    tone: "success",
    retryPolicy: "5 retries",
    deliveryRate: "100%",
  },
];

const DEFAULT_STATE = {
  connected: false,
  walletAddress: "",
  walletProvider: "Phantom",
  mobileMenuOpen: false,
  stablecoinFilter: "ALL",
  customStablecoins: [],
  customRegistryEntries: [],
  customActivity: [],
  customReleases: [],
  customWebhooks: [],
  customMintRequests: [],
  lastDeployment: null,
  settings: {
    rpcUrl: DEVNET_PROGRAM_DEFAULTS.rpcUrl,
    stablecoinProgram: DEVNET_PROGRAM_DEFAULTS.stablecoinProgram,
    transferHookProgram: DEVNET_PROGRAM_DEFAULTS.transferHookProgram,
    registryProgram: DEVNET_PROGRAM_DEFAULTS.registryProgram,
    tokenProgram: DEVNET_PROGRAM_DEFAULTS.tokenProgram,
    autoRegister: true,
    strictMode: true,
    analytics: true,
    issuerName: "Stable Studio",
    issuerWebsite: "https://stable-studio.io",
    displayDensity: "Comfortable",
  },
  wizard: {
    preset: "SSS-2",
    tokenName: "Regulated USD",
    symbol: "USDR",
    decimals: "6",
    metadataUri: "https://metadata.sss.dev/usdr.json",
    permanentDelegate: true,
    transferHook: true,
    defaultFrozen: true,
    confidentialTransfers: false,
    zkProofs: false,
    compressedState: false,
    masterAuthority: "",
    minter: "",
    minterQuota: "1000000",
    burner: "",
    freezeAuthority: "",
    autoRegister: true,
    jurisdiction: "Cayman Islands",
    docsUri: "https://docs.sss.dev/usdr",
    issuerWebsite: "https://issuer.sss.dev",
    contactEmail: "compliance@issuer.sss.dev",
  },
};

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...DEFAULT_STATE,
      ...saved,
      settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
      wizard: { ...DEFAULT_STATE.wizard, ...(saved.wizard || {}) },
      customStablecoins: Array.isArray(saved.customStablecoins) ? saved.customStablecoins : [],
      customRegistryEntries: Array.isArray(saved.customRegistryEntries) ? saved.customRegistryEntries : [],
      customActivity: Array.isArray(saved.customActivity) ? saved.customActivity : [],
      customReleases: Array.isArray(saved.customReleases) ? saved.customReleases : [],
      customWebhooks: Array.isArray(saved.customWebhooks) ? saved.customWebhooks : [],
      customMintRequests: Array.isArray(saved.customMintRequests) ? saved.customMintRequests : [],
    };
  } catch (_error) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function pushToast(tone, title, body) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  runtime.toasts = [...runtime.toasts.slice(-3), { id, tone, title, body }];
}

function openModal(modal) {
  runtime.modal = modal;
}

function closeModal() {
  runtime.modal = null;
}

function setBusy(message = "") {
  runtime.busy = message;
}

function setError(message = "") {
  runtime.error = message;
  if (message) {
    runtime.notice = "";
    pushToast("danger", "Error", message);
  }
}

function setNotice(message = "") {
  runtime.notice = message;
  if (message) {
    runtime.error = "";
    pushToast("success", "Success", message);
  }
}

function clearFeedback() {
  runtime.busy = "";
  runtime.error = "";
  runtime.notice = "";
  closeModal();
}

function getConnection() {
  return new Connection(state.settings.rpcUrl, "confirmed");
}

function getNetworkLabel() {
  const value = state.settings.rpcUrl.toLowerCase();
  if (value.includes("localhost") || value.includes("127.0.0.1")) return "Localnet";
  if (value.includes("mainnet")) return "Mainnet";
  return "Devnet";
}

function explorerCluster() {
  const network = getNetworkLabel();
  if (network === "Mainnet") return "";
  if (network === "Localnet") return "custom";
  return "devnet";
}

function explorerUrl(signature) {
  if (!signature || String(signature).startsWith("demo-")) return "";
  const cluster = explorerCluster();
  if (cluster === "custom") {
    return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(state.settings.rpcUrl)}`;
  }
  return cluster ? `https://explorer.solana.com/tx/${signature}?cluster=${cluster}` : `https://explorer.solana.com/tx/${signature}`;
}

async function fetchRegistryAuthority(programId) {
  const connection = getConnection();
  const accountInfo = await connection.getAccountInfo(findRegistryConfigPda(programId), "confirmed");
  if (!accountInfo?.data || accountInfo.data.length < 40) {
    return null;
  }
  return new PublicKey(accountInfo.data.slice(8, 40)).toBase58();
}

async function getRegistryAuthorityMismatch(programId) {
  const registryAuthority = await fetchRegistryAuthority(programId);
  const walletAuthority = currentWalletAddress();
  if (!registryAuthority || !walletAuthority) {
    return null;
  }
  return registryAuthority === walletAuthority
    ? null
    : { registryAuthority, walletAuthority };
}

function getDemoWalletAddress() {
  const key = "sss-demo-wallet-address";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = Keypair.generate().publicKey.toBase58();
  localStorage.setItem(key, generated);
  return generated;
}

function createDemoProvider() {
  const publicKey = new PublicKey(getDemoWalletAddress());
  return {
    isDemo: true,
    publicKey,
    connect: async () => ({ publicKey }),
    disconnect: async () => {},
    signTransaction: async (transaction) => transaction,
  };
}

function findInjectedProvider(predicate) {
  const candidates = [
    window.phantom?.solana,
    window.solflare,
    window.backpack?.solana,
    window.solana,
    ...(Array.isArray(window.solana?.providers) ? window.solana.providers : []),
  ].filter(Boolean);
  return candidates.find((provider) => predicate(provider)) || null;
}

function detectWalletProvider(name) {
  if (name === "Demo Wallet") {
    return createDemoProvider();
  }
  if (name === "Phantom") {
    return findInjectedProvider((provider) => provider.isPhantom);
  }
  if (name === "Solflare") {
    return findInjectedProvider((provider) => provider.isSolflare);
  }
  if (name === "Backpack") {
    return findInjectedProvider((provider) => provider.isBackpack);
  }
  return null;
}

function isDemoProvider(provider = runtime.provider) {
  return Boolean(provider?.isDemo || state.walletProvider === "Demo Wallet");
}

function walletEnvironmentHint() {
  if (isFileProtocol()) {
    return "Wallet extensions usually do not inject on file:// pages. Serve the frontend on http://127.0.0.1:4173 or any HTTPS host before using Phantom, Solflare, or Backpack. Demo Wallet still works for offline preview.";
  }
  return "";
}

async function submitFrontendTransaction(params) {
  if (isDemoProvider(params.signer)) {
    await new Promise((resolve) => window.setTimeout(resolve, 320));
    return `demo-${Date.now().toString(16)}`;
  }
  return signAndSendTransaction(params);
}

function requireProvider() {
  if (!runtime.provider?.signTransaction) {
    throw new Error("Connect a wallet to continue.");
  }
  return runtime.provider;
}

function getWalletSigner() {
  const provider = requireProvider();
  const address = walletAddressFrom(provider);
  if (!address) {
    throw new Error("Connected wallet did not expose a usable public key.");
  }
  const publicKey = new PublicKey(address);
  return {
    publicKey,
    signTransaction: (transaction) => provider.signTransaction(transaction),
    signAllTransactions: provider.signAllTransactions
      ? (transactions) => provider.signAllTransactions(transactions)
      : undefined,
    isDemo: Boolean(provider.isDemo),
  };
}

function requireActionValue(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function parsePublicKey(value, label) {
  const trimmed = requireActionValue(value, label);
  try {
    return new PublicKey(trimmed);
  } catch (_error) {
    throw new Error(`${label} must be a valid Solana public key.`);
  }
}

function optionalPublicKey(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  return parsePublicKey(trimmed, label);
}

function currentWalletAddress() {
  return runtime.provider?.publicKey?.toBase58() || state.walletAddress;
}

function walletAddressFrom(provider, response) {
  const fromResponse = response?.publicKey?.toBase58?.();
  const fromProvider = provider?.publicKey?.toBase58?.();
  return fromResponse || fromProvider || state.walletAddress || "";
}

function coinDecimals(coin) {
  const value = Number(coin?.decimals ?? 6);
  return Number.isFinite(value) && value >= 0 ? value : 6;
}

function formatTokenAmount(amount, decimals) {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseTokenAmount(value, label, decimals) {
  const trimmed = requireActionValue(value, label);
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label} must be a positive number.`);
  }
  const [wholePart, fractionPart = ""] = trimmed.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(`${label} supports up to ${decimals} decimal places.`);
  }
  const scale = 10n ** BigInt(decimals);
  const whole = BigInt(wholePart || "0") * scale;
  const fraction = BigInt((fractionPart || "").padEnd(decimals, "0") || "0");
  const amount = whole + fraction;
  if (amount <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
}

function parseHex32(value, label) {
  const trimmed = requireActionValue(value, label).replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(`${label} must be exactly 32 bytes encoded as 64 hex characters.`);
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function formatCoinSupplyDisplay(amount, coin) {
  return `${formatTokenAmount(amount, coinDecimals(coin))} ${coin.symbol}`;
}

function parseCount(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function buildFeatureFlagsFromConfig(config) {
  const flags = [];
  if (config.enableTransferHook) flags.push("Transfer hook enabled");
  if (config.defaultAccountFrozen) flags.push("Default account frozen");
  if (config.enablePermanentDelegate) flags.push("Permanent delegate enabled");
  if (config.enableConfidentialTransfers) flags.push("Confidential transfers enabled");
  if (config.enableZkComplianceProofs) flags.push("ZK compliance proofs enabled");
  if (config.enableCompressedComplianceState) flags.push("Compressed compliance state enabled");
  return flags.length ? flags : ["Basic mint and burn", "Transferable by default"];
}

function buildAuthoritiesFromConfig(config) {
  return [
    ["Master authority", config.authority],
    ["Mint operator", "Role-based / delegated"],
    ["Burn operator", "Role-based / delegated"],
    ["Pause & freeze", "Role-based / delegated"],
  ];
}

function describePreset(config) {
  if (config.preset === "sss-3") {
    return "Advanced privacy-forward stablecoin with proof-enforced transfer controls and compressed compliance state.";
  }
  if (config.preset === "sss-2") {
    return "Compliance-first stablecoin with transfer hooks, frozen-account controls, and registry-aligned operations.";
  }
  return "Minimal stablecoin with core issuance and burn semantics for straightforward settlement rails.";
}

function stablecoinTierLabel(config) {
  return config.preset.toUpperCase();
}

function registryPresetValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sss-1") return "sss-1";
  if (normalized === "sss-2") return "sss-2";
  return "sss-3";
}

function ensureDemoWorkspace() {
  if (!state.customStablecoins.some((coin) => coin.id === "demo-usdx")) {
    state.customStablecoins.unshift({
      id: "demo-usdx",
      name: "Demo USD Experience",
      symbol: "USDX",
      tier: "SSS-2",
      supply: "1250000 USDX",
      status: "Active",
      registry: "Registered",
      registryTone: "primary",
      statusTone: "success",
      mint: Keypair.generate().publicKey.toBase58(),
      configHash: "cfg-demo-42a1e8f3",
      configAddress: Keypair.generate().publicKey.toBase58(),
      programId: state.settings.stablecoinProgram,
      signature: "demo-init",
      registrySignature: "demo-registry",
      live: false,
      demo: true,
      jurisdiction: "United States",
      description: "Demo-mode stablecoin seeded for presentation clickthroughs when a browser wallet is unavailable.",
      decimals: 6,
      totalMinted: "1,500,000",
      totalBurned: "250,000",
      currentSupply: "1,250,000",
      supplyAtomic: "1250000000000",
      mintedAtomic: "1500000000000",
      burnedAtomic: "250000000000",
      frozenAccounts: "1",
      blacklisted: "2",
      complianceRoot: "demo-root-9931",
      proofReceipts: [
        {
          subject: Keypair.generate().publicKey.toBase58(),
          status: "Valid",
          complianceRoot: "demo-root-9931",
          submittedAt: "Today 09:18",
        },
      ],
      roleAssignments: [
        {
          holder: Keypair.generate().publicKey.toBase58(),
          role: "minter",
          active: true,
          mintQuota: "500000",
        },
      ],
      featureFlags: [
        "Transfer hook enabled",
        "Default account frozen",
        "Registry registration confirmed",
        "Demo workspace seeded",
      ],
      authorities: [
        ["Master authority", getDemoWalletAddress()],
        ["Mint authority", getDemoWalletAddress()],
        ["Burner", getDemoWalletAddress()],
        ["Freeze authority", getDemoWalletAddress()],
      ],
      registryInfo: [
        ["Record status", "Published"],
        ["Website", "https://demo.stable-studio.local"],
        ["Compliance docs", "https://demo.stable-studio.local/docs"],
        ["Jurisdiction", "United States"],
      ],
    });
  }

  if (!state.customWebhooks.length) {
    state.customWebhooks = [
      {
        id: "demo-webhook-1",
        endpoint: "https://demo.stable-studio.local/webhooks/compliance",
        eventType: "WALLET_BLACKLISTED",
        secretLabel: "demo-ops",
        status: "Healthy",
        tone: "success",
        retryPolicy: "3 retries",
        deliveryRate: "99.9%",
        coinId: "demo-usdx",
      },
    ];
  }

  if (!state.customMintRequests.length) {
    state.customMintRequests = [
      {
        id: "demo-request-1",
        coinId: "demo-usdx",
        symbol: "USDX",
        destinationOwner: Keypair.generate().publicKey.toBase58(),
        amount: "50000",
        requestedBy: "Treasury Desk",
        reason: "Market maker inventory",
        status: "Pending",
        simulated: true,
      },
      {
        id: "demo-request-2",
        coinId: "demo-usdx",
        symbol: "USDX",
        destinationOwner: Keypair.generate().publicKey.toBase58(),
        amount: "120000",
        requestedBy: "Operations",
        reason: "Settlement window",
        status: "Approved",
        simulated: true,
      },
    ];
  }

  saveState();
}

function collectOperationFields(trigger) {
  const panel = trigger.closest("[data-operation-panel]");
  if (!panel) return {};
  const values = {};
  panel.querySelectorAll("[data-operation-field]").forEach((field) => {
    values[field.dataset.operationField] = field.type === "checkbox" ? field.checked : field.value;
  });
  return values;
}

function collectModalFields() {
  const values = {};
  document.querySelectorAll("[data-modal-field]").forEach((field) => {
    values[field.dataset.modalField] = field.type === "checkbox" ? field.checked : field.value;
  });
  return values;
}

function recentCoinActivity(coin) {
  const matches = allActivity().filter((item) => (
    item.title.includes(coin.symbol)
    || item.detail.includes(coin.symbol)
    || item.detail.includes(coin.mint)
  ));
  return matches.slice(0, 6);
}

function sdkPreset(preset) {
  if (preset === "SSS-3") return Presets.SSS_3;
  if (preset === "SSS-2") return Presets.SSS_2;
  return Presets.SSS_1;
}

function wizardExtensions() {
  return {
    permanentDelegate: state.wizard.permanentDelegate,
    transferHook: state.wizard.transferHook,
    defaultAccountFrozen: state.wizard.defaultFrozen,
    confidentialTransfers: state.wizard.confidentialTransfers,
    zkComplianceProofs: state.wizard.zkProofs,
    compressedComplianceState: state.wizard.compressedState,
  };
}

function shouldUseLiveActions(coin) {
  return Boolean(coin?.live && coin?.programId && coin?.mint);
}

function updateCustomCoin(coinId, mutate) {
  state.customStablecoins = state.customStablecoins.map((coin) => (
    coin.id === coinId ? mutate({ ...coin }) : coin
  ));
  saveState();
}

function upsertRelease(release) {
  state.customReleases = [
    release,
    ...state.customReleases.filter((item) => item.id !== release.id),
  ];
  saveState();
}

function upsertWebhook(hook) {
  state.customWebhooks = [
    hook,
    ...state.customWebhooks.filter((item) => item.id !== hook.id),
  ];
  saveState();
}

function updateMintRequest(requestId, mutate) {
  state.customMintRequests = state.customMintRequests.map((request) => (
    request.id === requestId ? mutate({ ...request }) : request
  ));
  saveState();
}

function prependActivity(entry) {
  state.customActivity = [entry, ...state.customActivity];
  saveState();
}

function updateCoinMetrics(coinId, mutate) {
  updateCustomCoin(coinId, (coin) => {
    const next = mutate(coin);
    return next;
  });
}

function applyCoinAccounting(coinId, deltas) {
  updateCoinMetrics(coinId, (coin) => {
    const mintedAtomic = BigInt(coin.mintedAtomic || "0");
    const burnedAtomic = BigInt(coin.burnedAtomic || "0");
    const currentAtomic = BigInt(coin.supplyAtomic || "0");
    const nextMinted = mintedAtomic + (deltas.mintedDelta || 0n);
    const nextBurned = burnedAtomic + (deltas.burnedDelta || 0n);
    const nextSupply = currentAtomic + (deltas.mintedDelta || 0n) - (deltas.burnedDelta || 0n);
    coin.mintedAtomic = nextMinted.toString();
    coin.burnedAtomic = nextBurned.toString();
    coin.supplyAtomic = nextSupply.toString();
    coin.totalMinted = formatTokenAmount(nextMinted, coinDecimals(coin));
    coin.totalBurned = formatTokenAmount(nextBurned, coinDecimals(coin));
    coin.currentSupply = formatTokenAmount(nextSupply, coinDecimals(coin));
    coin.supply = formatCoinSupplyDisplay(nextSupply, coin);
    return coin;
  });
}

async function getLiveCoinContext(coinId) {
  const provider = getWalletSigner();
  const coin = findCoin(coinId);
  const connection = getConnection();
  const stable = await SolanaStablecoin.connect({
    connection,
    authority: provider,
    programId: parsePublicKey(coin.programId, "Stablecoin program"),
    mint: parsePublicKey(coin.mint, "Mint"),
    registryMetadata: {
      homepage: state.settings.issuerWebsite,
      jurisdiction: coin.jurisdiction,
    },
  });
  return { provider, coin, connection, stable };
}

function renderAlerts() {
  const items = [];
  if (runtime.busy) items.push({ tone: "primary", title: "Processing", body: runtime.busy });
  if (runtime.error) items.push({ tone: "danger", title: "Action failed", body: runtime.error });
  if (runtime.notice) items.push({ tone: "success", title: "Ready", body: runtime.notice });
  if (!items.length) return "";

  return `
    <section class="alert-stack">
      ${items.map((item) => `
        <article class="summary-card alert-card ${item.tone}">
          <div class="row-split">
            ${pill(item.title, item.tone)}
            ${runtime.lastSignature ? `<a class="text-link mono" href="${escapeHtml(explorerUrl(runtime.lastSignature))}" target="_blank" rel="noreferrer">Explorer</a>` : ""}
          </div>
          <p>${escapeHtml(item.body)}</p>
        </article>
      `).join("")}
    </section>
  `;
}

function renderToasts() {
  if (!runtime.toasts.length) return "";
  return `
    <section class="toast-stack" aria-live="polite">
      ${runtime.toasts.map((toast) => `
        <article class="toast-card ${toast.tone}">
          <div class="row-split">
            ${pill(toast.title, toast.tone)}
            <button class="button quiet" data-action="dismiss-toast" data-id="${escapeHtml(toast.id)}">Dismiss</button>
          </div>
          <p>${escapeHtml(toast.body)}</p>
        </article>
      `).join("")}
    </section>
  `;
}

function renderModal() {
  if (!runtime.modal) return "";
  const modal = runtime.modal;
  const requiresPhrase = Boolean(modal.confirmPhrase);
  return `
    <section class="modal-backdrop" data-action="close-modal">
      <article class="modal-card ${modal.tone || "primary"}" onclick="event.stopPropagation()">
        <div class="panel-header">
          <div>
            <p class="eyebrow">${escapeHtml(modal.eyebrow || "Confirm Action")}</p>
            <h3 class="panel-title">${escapeHtml(modal.title)}</h3>
            <p class="panel-subtitle">${escapeHtml(modal.body || "")}</p>
          </div>
          <button class="button ghost" data-action="close-modal">Close</button>
        </div>
        ${modal.code ? `<pre class="code-block mono">${escapeHtml(modal.code)}</pre>` : ""}
        ${Array.isArray(modal.rows) && modal.rows.length ? `
          <div class="data-list">
            ${modal.rows.map(([key, value]) => `
              <div class="data-row">
                <span>${escapeHtml(key)}</span>
                <strong class="${String(value).includes(" ") ? "" : "mono"}">${escapeHtml(value)}</strong>
              </div>
            `).join("")}
          </div>
        ` : ""}
        ${requiresPhrase ? `
          <div class="field">
            <label>Type ${escapeHtml(modal.confirmPhrase)} to proceed</label>
            <input data-modal-field="confirmPhrase" type="text" placeholder="${escapeHtml(modal.confirmPhrase)}">
          </div>
        ` : ""}
        <div class="button-row">
          <button class="button ghost" data-action="close-modal">Cancel</button>
          <button class="button ${modal.tone === "danger" ? "danger" : "primary"}" data-action="confirm-modal">${escapeHtml(modal.confirmLabel || "Continue")}</button>
        </div>
      </article>
    </section>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRoute() {
  return window.location.hash.replace(/^#/, "") || "landing";
}

function navigate(route) {
  if (getRoute() === route) {
    render();
    return;
  }
  window.location.hash = route;
}

function isAppRoute(route) {
  return !["landing", "connect", "help"].includes(route);
}

function isFileProtocol() {
  return window.location.protocol === "file:";
}

function allStablecoins() {
  return [...state.customStablecoins, ...BASE_STABLECOINS];
}

function allRegistryEntries() {
  return [...state.customRegistryEntries, ...BASE_REGISTRY_ENTRIES];
}

function allActivity() {
  return [...state.customActivity, ...BASE_ACTIVITY];
}

function allReleases() {
  return [...state.customReleases, ...BASE_RELEASES.filter((release) => !state.customReleases.some((item) => item.id === release.id))];
}

function allWebhooks() {
  return [...state.customWebhooks, ...BASE_WEBHOOKS.filter((hook) => !state.customWebhooks.some((item) => item.id === hook.id))];
}

function allMintRequests() {
  return [...state.customMintRequests];
}

function findCoin(id) {
  return allStablecoins().find((coin) => coin.id === id) || allStablecoins()[0];
}

function findRelease(id) {
  return allReleases().find((release) => release.id === id);
}

function findWebhook(id) {
  return allWebhooks().find((hook) => hook.id === id);
}

function findMintRequest(id) {
  return allMintRequests().find((request) => request.id === id);
}

function getWizardStep(route) {
  if (!route.startsWith("create/")) {
    return 1;
  }
  const step = Number(route.split("/")[1]);
  return Number.isFinite(step) && step >= 1 && step <= 7 ? step : 1;
}

function launchRoute() {
  return state.connected ? "dashboard" : "connect";
}

function shortAddress(value) {
  if (!value) return "Pending";
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function toneClass(tone) {
  return tone || "primary";
}

function button(route, label, variant = "secondary", icon = "") {
  return `<button class="button ${variant}" data-route="${escapeHtml(route)}">${escapeHtml(label)}${icon ? ` <span class="material-symbols-outlined">${icon}</span>` : ""}</button>`;
}

function actionButton(action, label, variant = "secondary", icon = "", extra = "") {
  return `<button class="button ${variant}" data-action="${escapeHtml(action)}" ${extra}>${escapeHtml(label)}${icon ? ` <span class="material-symbols-outlined">${icon}</span>` : ""}</button>`;
}

function pill(label, tone = "primary") {
  return `<span class="pill ${toneClass(tone)}">${escapeHtml(label)}</span>`;
}

function routeMeta(route) {
  if (route === "dashboard") return { title: "Dashboard", subtitle: "Protocol operations / overview" };
  if (route === "stablecoins") return { title: "My Stablecoins", subtitle: "Assets / managed issuance" };
  if (route === "mint-requests") return { title: "Mint Request Queue", subtitle: "Operations / issuance approvals" };
  if (route === "compliance-queue") return { title: "Compliance Queue", subtitle: "Operations / blacklist and proof review" };
  if (route === "webhooks") return { title: "Webhook Subscriptions", subtitle: "Integrations / downstream notifications" };
  if (route === "service-health") return { title: "Service Health", subtitle: "Systems / infrastructure visibility" };
  if (route === "release-registry") return { title: "Release Registry", subtitle: "Registry / standard versions" };
  if (route === "publish-release") return { title: "Publish Release", subtitle: "Registry / new standard record" };
  if (route.startsWith("stablecoin/")) {
    const [, coinId, tab] = route.split("/");
    const coin = findCoin(coinId);
    return { title: coin.name, subtitle: `Stablecoins / ${coin.symbol} / ${tab || "overview"}` };
  }
  if (route === "registry") return { title: "Registry Explorer", subtitle: "Discovery / on-chain metadata" };
  if (route === "activity") return { title: "Activity Log", subtitle: "Audit / operations timeline" };
  if (route === "help") return { title: "Documentation", subtitle: "Reference / CLI / SDK / architecture" };
  if (route === "settings") return { title: "Settings", subtitle: "System / environment controls" };
  if (route.startsWith("create/")) return { title: "Stablecoin Studio", subtitle: `Create flow / step ${getWizardStep(route)} of 7` };
  return { title: "SSS", subtitle: "Solana Stablecoin Standard" };
}

function render() {
  const route = getRoute();
  if (isAppRoute(route) && !state.connected) {
    navigate("connect");
    return;
  }

  const root = document.getElementById("app");
  document.title = `${routeMeta(route).title} | SSS Frontend`;

  if (route === "landing") {
    root.innerHTML = `${renderLanding()}${renderToasts()}${renderModal()}`;
    return;
  }

  if (route === "connect") {
    root.innerHTML = `${renderConnect()}${renderToasts()}${renderModal()}`;
    return;
  }

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar ${state.mobileMenuOpen ? "is-open" : ""}">
        ${renderSidebar(route)}
      </aside>
      <div class="sidebar-backdrop ${state.mobileMenuOpen ? "is-open" : ""}" data-action="close-menu"></div>
      <div class="main-pane">
        ${renderTopbar(route)}
        <main class="page">
          ${renderAlerts()}
          ${renderPage(route)}
        </main>
      </div>
    </div>
    ${renderToasts()}
    ${renderModal()}
  `;
}

function renderLanding() {
  const presets = [
    {
      tier: "SSS-1",
      title: "Minimal Tier",
      kicker: "SSS-1",
      copy: "Basic stablecoin primitives for developers who need standard functionality with minimum overhead.",
      features: ["Basic Mint/Burn", "Transferable"],
      footer: "Entry Level",
    },
    {
      tier: "SSS-2",
      title: "Full Compliance",
      kicker: "SSS-2 Compliant Stablecoin",
      copy: "Built-in transfer hooks and identity verification layers for institutional regulatory requirements.",
      features: ["On-chain Compliance", "Identity Hooks", "Role Separation"],
      footer: "Institutional Standard",
      badge: "Recommended",
      tone: "primary",
    },
    {
      tier: "SSS-3",
      title: "Privacy Framework",
      kicker: "SSS-3 Confidential",
      copy: "Confidential computing and ZK-ready extensions for high-privacy financial transactions.",
      features: ["ZK-Proof Transfers", "Encrypted Balances", "Advanced Privacy"],
      footer: "Next-Gen Privacy",
      badge: "Bonus",
      tone: "warning",
    },
  ];

  const comparisonRows = [
    ["Transfer Hooks", "&mdash;", true, true],
    ["Confidential Transfers", "&mdash;", "&mdash;", true],
    ["On-chain KYC/AML", "&mdash;", true, true],
    ["Multi-Role Admin", true, true, true],
  ];

  const differentiators = [
    ["extension", "SSS-1 Simple", "Basic stablecoin primitives for developers who need standard functionality with minimum overhead."],
    ["gavel", "SSS-2 Compliant", "Built-in transfer hooks and identity verification layers for institutional regulatory requirements."],
    ["visibility_off", "SSS-3 Bonus", "Confidential computing and ZK-ready extensions for high-privacy financial transactions."],
    ["list_alt", "On-Chain Registry", "Unified discovery and verification registry for all SSS-compliant tokens on the Solana network."],
    ["account_tree", "Config Inheritance", "Seamlessly extend existing stablecoin configurations with inherited security and permission models."],
    ["manage_accounts", "Role Separation", "Granular access control for issuers, auditors, mints, and freeze authorities to ensure security."],
  ];

  const steps = [
    ["Choose a Preset", "Select from SSS-1, SSS-2, or SSS-3 based on your compliance and feature requirements."],
    ["Configure & Deploy", "Set your mint authority, compliance hooks, and registry metadata using our simple CLI or App."],
    ["Operate & Audit", "Manage supply, monitor compliance in real-time, and allow transparent auditing of reserves."],
  ];

  const footerColumns = [
    {
      title: "Protocol",
      links: [
        ["Registry", "landing"],
        ["Governance", "landing"],
        ["Technical Docs", "help"],
        ["Architecture", "landing"],
      ],
    },
    {
      title: "Connect",
      links: [
        ["GitHub", "landing"],
        ["Twitter / X", "landing"],
        ["Discord", "landing"],
        ["Newsletter", "landing"],
      ],
    },
  ];

  const renderCheckCell = (value, tone = "primary") => {
    if (value === true) {
      return `<span class="material-symbols-outlined landing-check ${tone}">check</span>`;
    }
    return `<span class="mono">${value}</span>`;
  };

  const renderFooterLink = ([label, route]) => (
    `<a class="footer-link" href="#${escapeHtml(route)}">${escapeHtml(label)}</a>`
  );

  const renderFeature = (label, tone = "primary") => `
    <div class="feature-check">
      <span class="material-symbols-outlined ${toneClass(tone)}">check_circle</span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;

  return `
    <div class="hero-shell">
      <nav class="landing-nav">
        <div class="brand">
          <div class="brand-mark mono">SSS</div>
          <div class="brand-copy">
            <h1 class="mono">Solana Stablecoin Standard</h1>
            <p>Solana stablecoin standard</p>
          </div>
        </div>
        <div class="nav-links">
          <a href="#landing">Presets</a>
          <a href="#landing">Architecture</a>
          <a href="#landing">Registry</a>
          <a href="#help">Docs</a>
        </div>
        <div class="button-row">
          ${button("help", "Read Docs", "ghost")}
          ${button(launchRoute(), "Launch App", "primary", "arrow_forward")}
        </div>
      </nav>
      <div class="landing-main">
        <section class="hero">
          <div class="hero-grid">
            <div class="hero-copy">
              <span class="pill primary">Open standard &middot; Token-2022 &middot; Solana</span>
              <h2>Open Stablecoin Infrastructure for <span class="gradient-text">Solana</span></h2>
              <p>A modular framework for building compliant, enterprise-grade stablecoins using Solana's Token-2022 extensions. Built for scalability and security.</p>
              <div class="button-row">
                ${button(launchRoute(), "Launch App", "primary", "arrow_forward")}
                ${button("help", "Read Docs", "ghost")}
              </div>
              <div class="hero-metrics">
                <div class="metric">
                  <strong class="mono">3</strong>
                  <span class="eyebrow">Presets</span>
                </div>
                <div class="metric">
                  <strong class="mono">Token-2022</strong>
                  <span class="eyebrow">Standard</span>
                </div>
                <div class="metric">
                  <strong class="mono">ZK-ready</strong>
                  <span class="eyebrow">Security</span>
                </div>
              </div>
            </div>
            <div class="diagram-panel">
              <div class="node-field">
                <div class="node-card">
                  <span class="material-symbols-outlined">account_balance</span>
                  <small>ISSUER</small>
                </div>
                <div class="node-card">
                  <span class="material-symbols-outlined">verified_user</span>
                  <small>COMPLIANCE</small>
                </div>
                <div class="node-card">
                  <span class="material-symbols-outlined">account_balance_wallet</span>
                  <small>WALLET</small>
                </div>
                <div class="node-card">
                  <span class="material-symbols-outlined">menu_book</span>
                  <small>REGISTRY</small>
                </div>
                <div class="node-card central">
                  <span class="material-symbols-outlined">token</span>
                  <small>MINT_HOOK</small>
                </div>
                <div class="signal-line one"></div>
                <div class="signal-line two"></div>
                <div class="signal-line three"></div>
                <div class="signal-line four"></div>
                <div class="floating-dot one"></div>
                <div class="floating-dot two"></div>
                <div class="floating-dot three"></div>
                <div class="floating-dot four"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="panel landing-section">
          <div class="landing-heading">
            <p class="eyebrow">Standards</p>
            <h3 class="panel-title">Three tiers. One framework.</h3>
          </div>
          <div class="preset-grid">
            ${presets.map((preset) => `
              <article class="card preset-card ${preset.tier === "SSS-2" ? "featured" : ""} ${preset.tier === "SSS-3" ? "bonus" : ""}">
                ${preset.badge ? `<span class="preset-tag ${toneClass(preset.tone || "primary")}">${escapeHtml(preset.badge)}</span>` : ""}
                <p class="preset-kicker">${escapeHtml(preset.kicker)}</p>
                <h3 class="display">${escapeHtml(preset.title)}</h3>
                <p>${escapeHtml(preset.copy)}</p>
                <div class="feature-checklist">
                  ${preset.features.map((feature) => renderFeature(feature, preset.tier === "SSS-3" ? "warning" : "primary")).join("")}
                </div>
                <div class="preset-footer">${escapeHtml(preset.footer)}</div>
              </article>
            `).join("")}
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>SSS-1</th>
                  <th>SSS-2</th>
                  <th>SSS-3</th>
                </tr>
              </thead>
              <tbody>
                ${comparisonRows.map(([feature, sss1, sss2, sss3]) => `
                  <tr>
                    <td>${feature}</td>
                    <td>${renderCheckCell(sss1, "primary")}</td>
                    <td>${renderCheckCell(sss2, "primary")}</td>
                    <td>${renderCheckCell(sss3, "warning")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel landing-section landing-section-alt">
          <div class="landing-heading landing-heading-center">
            <p class="eyebrow">Why SSS</p>
            <h3 class="panel-title">Built for regulated issuers.</h3>
          </div>
          <div class="differentiator-grid">
            ${differentiators.map(([icon, title, copy]) => `
              <article class="differentiator-card">
                <span class="material-symbols-outlined landing-feature-icon">${icon}</span>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(copy)}</p>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="panel landing-section">
          <div class="row-split landing-steps-header">
            <h3 class="panel-title">Get started in minutes</h3>
            <div class="landing-divider"></div>
          </div>
          <div class="steps-grid">
            ${steps.map(([title, copy], index) => `
              <article class="step-card">
                <div class="step-index mono">0${index + 1}</div>
                <div class="summary-card">
                  <h3>${escapeHtml(title)}</h3>
                  <p>${escapeHtml(copy)}</p>
                </div>
              </article>
            `).join("")}
          </div>
        </section>

        <section class="landing-section cta-wrap">
          <div class="cta-banner">
            <h3 class="display">Deploy in minutes.</h3>
            <p>Join the new era of compliant stablecoins on Solana. Secure, scalable, and open-source infrastructure for global finance.</p>
            ${button(launchRoute(), "Launch Dashboard", "primary", "rocket_launch")}
          </div>
          <footer class="landing-footer">
            <div class="footer-grid">
              <div class="footer-brand">
                <div class="brand">
                  <div class="brand-mark mono">SSS</div>
                  <div class="brand-copy">
                    <h1 class="mono">Solana Stablecoin Standard</h1>
                    <p>Solana stablecoin standard</p>
                  </div>
                </div>
                <p class="footer-copy">The open infrastructure layer for the next generation of stable assets on the Solana blockchain.</p>
                <div class="footer-meta-row mono">
                  <span>Open-source</span>
                  <span>&middot;</span>
                  <span>Token-2022</span>
                  <span>&middot;</span>
                  <span>Solana</span>
                </div>
              </div>
              ${footerColumns.map((column) => `
                <div>
                  <p class="footer-title">${escapeHtml(column.title)}</p>
                  <div class="footer-links">
                    ${column.links.map(renderFooterLink).join("")}
                  </div>
                </div>
              `).join("")}
            </div>
            <div class="footer-legal">
              <span>&copy; 2024 SOLANA STABLECOIN STANDARD. NO RIGHTS RESERVED.</span>
              <div class="footer-links-inline">
                <a class="footer-link" href="#landing">Privacy Policy</a>
                <a class="footer-link" href="#landing">Terms of Service</a>
              </div>
            </div>
          </footer>
        </section>
      </div>
    </div>
  `;
}

function renderConnect() {
  const providers = [
    ["Phantom", "Fastest route for Solana-native operators.", "flash_on"],
    ["Solflare", "Strong multisig and treasury workflows.", "shield_lock"],
    ["Backpack", "Useful when you need app contexts and wallet separation.", "wallet"],
    ["Demo Wallet", "Simulation mode for presentations and route clickthroughs without extension injection.", "smart_toy"],
  ];
  const environmentHint = walletEnvironmentHint();
  const fileMode = isFileProtocol();

  return `
    <div class="hero-shell">
      <nav class="landing-nav">
        <div class="brand">
          <div class="brand-mark mono">SSS</div>
          <div class="brand-copy">
            <h1 class="display">Connect a wallet to continue</h1>
            <p>Secure entry point into the control plane</p>
          </div>
        </div>
        <div class="button-row">
          ${button("landing", "Back to Landing", "ghost", "west")}
        </div>
      </nav>
      <div class="landing-main">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Wallet access</p>
              <h3 class="panel-title">Choose an operator wallet</h3>
              <p class="panel-subtitle">The connected wallet gates the dashboard, create flow, and registry actions.</p>
            </div>
          </div>
          <div class="providers">
            ${providers.map(([name, copy, icon]) => `
              <article class="provider-card">
                <div class="inline-main">
                  <div class="token-icon"><span class="material-symbols-outlined">${icon}</span></div>
                  <div>
                    <h3>${escapeHtml(name)}</h3>
                    <p>${escapeHtml(copy)}</p>
                  </div>
                </div>
                ${(fileMode && name !== "Demo Wallet")
                  ? `<button class="button secondary" disabled>Serve over HTTP first</button>`
                  : detectWalletProvider(name)
                  ? `<button class="button primary" data-action="connect-wallet" data-provider="${escapeHtml(name)}">Connect ${escapeHtml(name)}</button>`
                  : `<button class="button secondary" disabled>${escapeHtml(name)} not detected</button>`}
              </article>
            `).join("")}
          </div>
          <div class="two-col">
            <div class="summary-card">
              <small class="eyebrow">Why connect</small>
              <p>The app shell displays live wallet context, network state, and scoped stablecoin actions after connection.</p>
            </div>
            <div class="summary-card">
              <small class="eyebrow">Runtime</small>
              <p>Current RPC: <span class="mono">${escapeHtml(state.settings.rpcUrl)}</span>. Configure program IDs in Settings before submitting live transactions.</p>
            </div>
          </div>
          ${environmentHint ? `
            <div class="summary-card">
              <small class="eyebrow">Wallet Injection Hint</small>
              <p>${escapeHtml(environmentHint)}</p>
            </div>
          ` : ""}
          ${fileMode ? `
            <div class="summary-card">
              <small class="eyebrow">Serve or deploy this frontend</small>
              <p>Use <span class="mono">npm.cmd run frontend:deploy</span> to build a static export in <span class="mono">artifacts/frontend-static</span>, then host that folder over HTTP or HTTPS. For local preview, run <span class="mono">npm.cmd run frontend:serve</span> and open <span class="mono">http://127.0.0.1:4173</span>.</p>
            </div>
          ` : ""}
        </section>
      </div>
    </div>
  `;
}

function renderSidebar(route) {
  const nav = [
    ["dashboard", "dashboard", "Dashboard", "Protocol status"],
    ["stablecoins", "toll", "Stablecoins", "Managed assets"],
    ["mint-requests", "queue", "Mint Requests", "Queue"],
    ["compliance-queue", "policy", "Compliance", "Queue"],
    ["webhooks", "webhook", "Webhooks", "Integrations"],
    ["registry", "menu_book", "Registry", "Discovery layer"],
    ["release-registry", "deployed_code", "Releases", "Registry versions"],
    ["activity", "query_stats", "Activity", "Audit events"],
    ["service-health", "monitor_heart", "Service Health", "Infrastructure"],
    ["help", "help_center", "Help", "Reference"],
    ["settings", "settings", "Settings", "Environment"],
    ["create/1", "add_circle", "Create New", "Wizard"],
  ];

  return `
    <div class="sidebar-header">
      <div class="brand-mark mono">SSS</div>
      <div>
        <h1 class="display">Stablecoin Studio</h1>
        <p class="mono muted">Token-2022 control plane</p>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${nav.map(([href, icon, label, meta]) => `
        <button class="nav-item ${isRouteActive(route, href) ? "active" : ""}" data-route="${href}">
          <span class="material-symbols-outlined">${icon}</span>
          <span class="nav-label">
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(meta)}</small>
          </span>
        </button>
      `).join("")}
    </nav>
    <div class="wallet-panel mt-auto">
      <div class="wallet-row">
        <div class="inline-main">
          <div class="wallet-avatar"><span class="material-symbols-outlined">account_balance_wallet</span></div>
          <div>
            <div class="eyebrow">Active wallet</div>
            <strong class="mono">${escapeHtml(state.connected ? currentWalletAddress() : "Not connected")}</strong>
          </div>
        </div>
        <span class="status-dot ${state.connected ? "" : "warning"}"></span>
      </div>
      <div class="wallet-row">
        <span class="pill warning">${escapeHtml(state.walletProvider)}</span>
        ${state.connected
          ? '<button class="button ghost" data-action="disconnect-wallet">Disconnect</button>'
          : '<button class="button ghost" data-route="connect">Connect</button>'}
      </div>
    </div>
  `;
}

function renderTopbar(route) {
  const meta = routeMeta(route);
  return `
    <header class="topbar">
      <div class="inline-main">
        <button class="mobile-toggle" data-action="toggle-menu">
          <span class="material-symbols-outlined">menu</span>
        </button>
        <div class="topbar-title">
          <h2 class="display">${escapeHtml(meta.title)}</h2>
          <p>${escapeHtml(meta.subtitle)}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="search">
          <span class="material-symbols-outlined">search</span>
          <input type="text" placeholder="Search protocol, mints, or registry...">
        </div>
        ${pill(getNetworkLabel(), getNetworkLabel() === "Mainnet" ? "danger" : "warning")}
        ${pill(state.connected ? shortAddress(currentWalletAddress()) : "Guest mode", "primary")}
      </div>
    </header>
  `;
}

function renderPage(route) {
  if (route === "dashboard") return renderDashboard();
  if (route === "stablecoins") return renderStablecoins();
  if (route === "mint-requests") return renderMintRequests();
  if (route === "compliance-queue") return renderComplianceQueue();
  if (route === "webhooks") return renderWebhooks();
  if (route === "service-health") return renderServiceHealth();
  if (route.startsWith("stablecoin/")) return renderStablecoinDetail(route);
  if (route === "registry") return renderRegistry();
  if (route === "release-registry") return renderReleaseRegistry();
  if (route === "publish-release") return renderPublishRelease();
  if (route === "activity") return renderActivity();
  if (route === "help") return renderHelp();
  if (route === "settings") return renderSettings();
  if (route.startsWith("create/")) return renderCreateFlow(getWizardStep(route));
  return renderDashboard();
}

function renderDashboard() {
  const activity = allActivity().slice(0, 4);
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Control plane</p>
        <h1 class="headline">Operate issuance, registry, and compliance from one frontend.</h1>
        <p class="subline">The original screens are now consolidated into reusable cards, tables, and workflows.</p>
      </div>
      <div class="button-row">
        ${button("create/1", "Create Stablecoin", "primary", "arrow_forward")}
        ${button("registry", "Open Registry", "secondary", "north_east")}
      </div>
    </section>

    <section class="stat-grid">
      ${DASHBOARD_METRICS.map(([label, value, foot]) => `
        <article class="stat-card">
          <div class="eyebrow">${escapeHtml(label)}</div>
          <span class="stat-value">${escapeHtml(value)}</span>
          <div class="stat-foot">${escapeHtml(foot)}</div>
        </article>
      `).join("")}
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Recent Activity</h3>
            <p class="panel-subtitle">Mints, registry updates, and compliance actions.</p>
          </div>
          ${button("activity", "View All", "quiet", "east")}
        </div>
        <div class="timeline">
          ${activity.map((item) => `
            <div class="timeline-item">
              <span class="timeline-marker ${item.type}"></span>
              <div>
                <h4>${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(item.detail)}</p>
              </div>
              <div class="timeline-time">${escapeHtml(item.when)}</div>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Service Health</h3>
            <p class="panel-subtitle">A productized version of the infrastructure and release screens.</p>
          </div>
          ${pill("Healthy", "success")}
        </div>
        <div class="data-list">
          ${[
            ["Registry program", "99.98% availability"],
            ["Webhook relayer", "14 active handlers"],
            ["Compliance queue", "03 pending reviews"],
            ["Release channel", "v1.0.0 production"],
          ].map(([left, right]) => `
            <div class="data-row">
              <span>${escapeHtml(left)}</span>
              <strong>${escapeHtml(right)}</strong>
            </div>
          `).join("")}
        </div>
        <div class="progress-card">
          <div class="row-split">
            <div>
              <div class="eyebrow">Quota usage</div>
              <strong>42 / 100 stablecoins created</strong>
            </div>
            <strong class="mono">42%</strong>
          </div>
          <div class="progress-rail">
            <div class="progress-fill" style="width:42%"></div>
          </div>
        </div>
      </article>
    </section>

    <section class="action-grid">
      <article class="action-card">
        <div class="icon-chip"><span class="material-symbols-outlined">add_circle</span></div>
        <div>
          <h3>Create with preset wizard</h3>
          <p>Walk through protocol selection, metadata, extensions, roles, registry, and review.</p>
        </div>
        ${button("create/1", "Open Wizard", "primary", "arrow_forward")}
      </article>
      <article class="action-card">
        <div class="icon-chip"><span class="material-symbols-outlined">verified_user</span></div>
        <div>
          <h3>Review compliance events</h3>
          <p>Handle freezes, blacklists, and pending registry approvals in one queue.</p>
        </div>
        ${button("activity", "Open Activity", "secondary", "north_east")}
      </article>
      <article class="action-card">
        <div class="icon-chip"><span class="material-symbols-outlined">menu_book</span></div>
        <div>
          <h3>Publish registry metadata</h3>
          <p>Inspect public records, issuer links, and release payloads before publication.</p>
        </div>
        ${button("registry", "Inspect Registry", "secondary", "north_east")}
      </article>
    </section>
  `;
}

function renderStablecoins() {
  const filter = state.stablecoinFilter;
  const coins = allStablecoins().filter((coin) => filter === "ALL" || coin.tier === filter);
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Tokens</p>
        <h1 class="headline">My Stablecoins</h1>
        <p class="subline">Table and card views unified from the prototype's token management screens.</p>
      </div>
      <div class="button-row">
        ${button("create/1", "Create Stablecoin", "primary", "arrow_forward")}
      </div>
    </section>

    <section class="four-col">
      <article class="stat-card"><div class="eyebrow">Assets</div><span class="stat-value">${allStablecoins().length}</span></article>
      <article class="stat-card"><div class="eyebrow">Registered</div><span class="stat-value">${allStablecoins().filter((coin) => coin.registry === "Registered").length}</span></article>
      <article class="stat-card"><div class="eyebrow">Paused</div><span class="stat-value">${allStablecoins().filter((coin) => coin.status === "Paused").length}</span></article>
      <article class="stat-card"><div class="eyebrow">Custom deployments</div><span class="stat-value">${state.customStablecoins.length}</span></article>
    </section>

    <section class="two-col">
      <article class="panel" data-operation-panel="import-live-coin">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Attach Existing Stablecoin</h3>
            <p class="panel-subtitle">Import a live mint into this frontend without changing your current design system or route structure.</p>
          </div>
          ${pill(getNetworkLabel(), "primary")}
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Mint address</label>
            <input data-operation-field="mint" type="text" placeholder="Existing stablecoin mint on the configured program">
          </div>
          <div class="field">
            <label>Jurisdiction label</label>
            <input data-operation-field="jurisdiction" type="text" placeholder="Optional display label">
          </div>
        </div>
        <div class="button-row">
          ${actionButton("import-live-coin", "Import Live Stablecoin", "primary", "north_east")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Frontend Wiring</h3>
            <p class="panel-subtitle">Current browser-side protocol configuration that powers deploys and live management actions.</p>
          </div>
        </div>
        <div class="data-list">
          <div class="data-row"><span>RPC</span><strong class="mono">${escapeHtml(state.settings.rpcUrl)}</strong></div>
          <div class="data-row"><span>Stablecoin program</span><strong class="mono">${escapeHtml(state.settings.stablecoinProgram)}</strong></div>
          <div class="data-row"><span>Transfer hook program</span><strong class="mono">${escapeHtml(state.settings.transferHookProgram)}</strong></div>
          <div class="data-row"><span>Registry program</span><strong class="mono">${escapeHtml(state.settings.registryProgram)}</strong></div>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="row-split">
        <div class="segmented">
          ${["ALL", "SSS-1", "SSS-2", "SSS-3"].map((tier) => `<button class="${filter === tier ? "active" : ""}" data-action="set-filter" data-filter="${tier}">${tier}</button>`).join("")}
        </div>
        ${pill(`${coins.length} shown`, "primary")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Tier</th>
              <th>Supply</th>
              <th>Status</th>
              <th>Registry</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${coins.map((coin) => `
              <tr>
                <td>
                  <div class="token-main">
                    <div class="token-icon"><span class="material-symbols-outlined">attach_money</span></div>
                    <div>
                      <strong>${escapeHtml(coin.name)}</strong>
                      <div class="token-symbol">${escapeHtml(coin.symbol)}</div>
                    </div>
                  </div>
                </td>
                <td>${pill(coin.tier, "primary")}</td>
                <td>${escapeHtml(coin.supply)}</td>
                <td>${pill(coin.status, coin.statusTone)}</td>
                <td>${pill(coin.registry, coin.registryTone)}</td>
                <td>${button(`stablecoin/${coin.id}/overview`, "View", "secondary", "north_east")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderMintRequests() {
  const requests = allMintRequests();
  const requestCoins = state.customStablecoins.filter((coin) => coin.live || coin.demo);
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Operations</p>
        <h1 class="headline">Mint Request Queue</h1>
        <p class="subline">Approve, reject, and execute queued issuance requests before live mint transactions are submitted.</p>
      </div>
      <div class="button-row">
        ${pill(`${requests.length} queued`, "primary")}
      </div>
    </section>

    <section class="two-col">
      <article class="panel" data-operation-panel="mint-request-create">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Create Request</h3>
            <p class="panel-subtitle">Queue a mint approval before executing the on-chain mint transaction.</p>
          </div>
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Stablecoin</label>
            <select data-operation-field="coinId">
              ${requestCoins.map((coin) => `<option value="${escapeHtml(coin.id)}">${escapeHtml(coin.symbol)} · ${escapeHtml(coin.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Destination owner</label>
            <input data-operation-field="destinationOwner" type="text" placeholder="Wallet public key">
          </div>
        </div>
        <div class="field-grid triple">
          <div class="field">
            <label>Amount</label>
            <input data-operation-field="amount" type="text" placeholder="25000">
          </div>
          <div class="field">
            <label>Requested by</label>
            <input data-operation-field="requestedBy" type="text" placeholder="Treasury desk">
          </div>
          <div class="field">
            <label>Reason</label>
            <input data-operation-field="reason" type="text" placeholder="Primary issuance">
          </div>
        </div>
        ${actionButton("create-mint-request", "Queue Mint Request", "primary", "queue")}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Queue Summary</h3>
            <p class="panel-subtitle">Workflow stages inspired by the stitched mint queue screen.</p>
          </div>
        </div>
        <div class="stat-grid">
          <article class="stat-card"><div class="eyebrow">Pending</div><span class="stat-value">${requests.filter((item) => item.status === "Pending").length}</span></article>
          <article class="stat-card"><div class="eyebrow">Approved</div><span class="stat-value">${requests.filter((item) => item.status === "Approved").length}</span></article>
          <article class="stat-card"><div class="eyebrow">Executed</div><span class="stat-value">${requests.filter((item) => item.status === "Complete").length}</span></article>
          <article class="stat-card"><div class="eyebrow">Rejected</div><span class="stat-value">${requests.filter((item) => item.status === "Rejected").length}</span></article>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stablecoin</th>
              <th>Destination</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${requests.length ? requests.map((request) => `
              <tr>
                <td>${escapeHtml(request.symbol)}</td>
                <td class="mono">${escapeHtml(shortAddress(request.destinationOwner))}</td>
                <td>${escapeHtml(request.amount)}</td>
                <td>${pill(request.status, request.status === "Rejected" ? "danger" : request.status === "Approved" ? "primary" : request.status === "Complete" ? "success" : "warning")}</td>
                <td>${escapeHtml(request.reason)}</td>
                <td>
                  <div class="button-row">
                    ${request.status === "Pending" ? actionButton("approve-mint-request", "Approve", "secondary", "check_circle", `data-id="${escapeHtml(request.id)}"`) : ""}
                    ${request.status === "Approved" ? actionButton("execute-mint-request", "Execute", "primary", "arrow_forward", `data-id="${escapeHtml(request.id)}"`) : ""}
                    ${request.status !== "Complete" && request.status !== "Rejected" ? actionButton("reject-mint-request", "Reject", "danger", "block", `data-id="${escapeHtml(request.id)}"`) : ""}
                  </div>
                </td>
              </tr>
            `).join("") : `
              <tr><td colspan="6" class="muted">No mint requests have been queued from the frontend yet.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderComplianceQueue() {
  const liveCoins = state.customStablecoins.filter((coin) => coin.live);
  const proofReceipts = liveCoins.flatMap((coin) => (coin.proofReceipts || []).map((receipt) => ({ ...receipt, symbol: coin.symbol, coinId: coin.id })));
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Operations</p>
        <h1 class="headline">Compliance Queue</h1>
        <p class="subline">Global enforcement review across blacklists, seizure actions, proof receipts, and screening tasks.</p>
      </div>
      <div class="button-row">
        ${pill(`${liveCoins.length} live assets`, "primary")}
      </div>
    </section>

    <section class="stat-grid">
      <article class="stat-card"><div class="eyebrow">Blacklisted</div><span class="stat-value">${liveCoins.reduce((sum, coin) => sum + parseCount(coin.blacklisted), 0)}</span></article>
      <article class="stat-card"><div class="eyebrow">Frozen Accounts</div><span class="stat-value">${liveCoins.reduce((sum, coin) => sum + parseCount(coin.frozenAccounts), 0)}</span></article>
      <article class="stat-card"><div class="eyebrow">Proof Receipts</div><span class="stat-value">${proofReceipts.length}</span></article>
      <article class="stat-card"><div class="eyebrow">Seizure Events</div><span class="stat-value">${allActivity().filter((item) => item.title.includes("Seized")).length}</span></article>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Recent Blacklist Actions</h3>
            <p class="panel-subtitle">Tracked from live stablecoin management actions in this frontend session.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Event</th><th>Detail</th><th>When</th></tr></thead>
            <tbody>
              ${allActivity().filter((item) => item.title.includes("Blacklisted") || item.title.includes("Removed blacklist")).slice(0, 8).map((item) => `
                <tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.detail)}</td><td>${escapeHtml(item.when)}</td></tr>
              `).join("") || '<tr><td colspan="3" class="muted">No blacklist actions recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Proof Receipt Activity</h3>
            <p class="panel-subtitle">SSS-3 proof state and compliance receipt submissions.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Stablecoin</th><th>Subject</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              ${proofReceipts.map((receipt) => `
                <tr>
                  <td>${escapeHtml(receipt.symbol)}</td>
                  <td class="mono">${escapeHtml(shortAddress(receipt.subject))}</td>
                  <td>${pill(receipt.status || "Valid", receipt.status === "Revoked" ? "danger" : "success")}</td>
                  <td>${escapeHtml(receipt.submittedAt || "Just now")}</td>
                </tr>
              `).join("") || '<tr><td colspan="4" class="muted">No proof receipts recorded yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Enforcement Shortcuts</h3>
          <p class="panel-subtitle">Jump directly into the asset-specific compliance views.</p>
        </div>
      </div>
      <div class="three-col">
        ${liveCoins.map((coin) => `
          <article class="action-card">
            <div class="icon-chip"><span class="material-symbols-outlined">policy</span></div>
            <h3>${escapeHtml(coin.symbol)}</h3>
            <p>${escapeHtml(coin.description)}</p>
            ${button(`stablecoin/${coin.id}/compliance`, "Open Compliance", "secondary", "north_east")}
          </article>
        `).join("") || '<div class="empty-state muted">Deploy or import a live stablecoin to open compliance controls.</div>'}
      </div>
    </section>
  `;
}

function renderWebhooks() {
  const hooks = allWebhooks();
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Integrations</p>
        <h1 class="headline">Webhook Subscriptions</h1>
        <p class="subline">Configure downstream notifications for mints, registry updates, blacklists, and compliance events.</p>
      </div>
      <div class="button-row">
        ${pill(`${hooks.length} subscriptions`, "primary")}
      </div>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Event</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${hooks.map((hook) => `
                <tr>
                  <td class="mono">${escapeHtml(hook.endpoint)}</td>
                  <td>${escapeHtml(hook.eventType)}</td>
                  <td>${pill(hook.status, hook.tone)}</td>
                  <td>${escapeHtml(hook.retryPolicy)}</td>
                  <td>
                    <div class="button-row">
                      ${actionButton("test-webhook", "Test", "secondary", "send", `data-id="${escapeHtml(hook.id)}"`)}
                      ${actionButton("remove-webhook", "Remove", "danger", "delete", `data-id="${escapeHtml(hook.id)}"`)}
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel" data-operation-panel="add-webhook">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Add Webhook</h3>
            <p class="panel-subtitle">Frontend-managed integration settings modeled after the stitched webhook screen.</p>
          </div>
        </div>
        <div class="field">
          <label>Webhook URL</label>
          <input data-operation-field="endpoint" type="url" placeholder="https://your-api.com/webhooks">
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Event type</label>
            <select data-operation-field="eventType">
              ${["MINT_COMPLETED", "BURN_COMPLETED", "WALLET_BLACKLISTED", "ROLE_UPDATED", "REGISTRY_UPDATED", "PROOF_RECEIPT_SUBMITTED"].map((eventType) => `<option value="${eventType}">${eventType}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Secret label</label>
            <input data-operation-field="secretLabel" type="text" placeholder="ops-webhook-01">
          </div>
        </div>
        <div class="field">
          <label>Retry policy</label>
          <input data-operation-field="retryPolicy" type="text" placeholder="3 retries with backoff">
        </div>
        ${actionButton("add-webhook", "Create Webhook", "primary", "add_link")}
      </article>
    </section>
  `;
}

function renderServiceHealth() {
  const services = [
    ["mint-service", "Healthy", "success", "19 ms p95", "Token issuance builders and submission path are responsive."],
    ["registry-service", "Healthy", "success", "31 ms p95", "Registry metadata path and release tools are operational."],
    ["compliance-service", "Degraded", "warning", "128 ms p95", "Proof and screening flows are seeing elevated latency."],
    ["webhook-service", "Healthy", "success", "11 ms p95", "Webhook fanout and retry scheduler are green."],
  ];
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Systems</p>
        <h1 class="headline">Service Health</h1>
        <p class="subline">Frontend operational overview for the supporting services represented in the stitch dashboard set.</p>
      </div>
      <div class="button-row">
        ${actionButton("refresh-service-health", "Refresh Health", "secondary", "autorenew")}
      </div>
    </section>

    <section class="four-col">
      ${services.map(([name, status, tone, latency, copy]) => `
        <article class="panel">
          <div class="row-split">
            <div>
              <p class="eyebrow">Service Identifier</p>
              <h3 class="panel-title">${escapeHtml(name)}</h3>
            </div>
            ${pill(status, tone)}
          </div>
          <p>${escapeHtml(copy)}</p>
          <div class="data-list">
            <div class="data-row"><span>Latency</span><strong>${escapeHtml(latency)}</strong></div>
            <div class="data-row"><span>Last checked</span><strong>Just now</strong></div>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderReleaseRegistry() {
  const releases = allReleases();
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Registry</p>
        <h1 class="headline">Release Registry</h1>
        <p class="subline">Published SSS standard versions, schema hashes, and deprecation records.</p>
      </div>
      <div class="button-row">
        ${button("publish-release", "Publish Release", "primary", "arrow_forward")}
      </div>
    </section>

    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Preset</th>
              <th>Schema Hash</th>
              <th>Status</th>
              <th>Replacement</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${releases.map((release) => `
              <tr>
                <td>${escapeHtml(release.standardVersion)}</td>
                <td>${pill(release.preset, "primary")}</td>
                <td class="mono">${escapeHtml(release.schemaHash)}</td>
                <td>${pill(release.status, release.tone)}</td>
                <td>${escapeHtml(release.replacementVersion || "n/a")}</td>
                <td>
                  ${!release.deprecated
                    ? actionButton("deprecate-release", "Mark Deprecated", "danger", "warning", `data-id="${escapeHtml(release.id)}"`)
                    : '<span class="muted">Archived</span>'}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPublishRelease() {
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Registry</p>
        <h1 class="headline">Publish Release</h1>
        <p class="subline">Create a new on-chain SSS release record from the frontend.</p>
      </div>
    </section>

    <section class="two-col">
      <article class="panel" data-operation-panel="publish-release">
        <div class="field-grid">
          <div class="field">
            <label>Standard version</label>
            <input data-operation-field="standardVersion" type="text" placeholder="v1.1.0">
          </div>
          <div class="field">
            <label>Preset</label>
            <select data-operation-field="preset">
              <option value="SSS-1">SSS-1</option>
              <option value="SSS-2">SSS-2</option>
              <option value="SSS-3">SSS-3</option>
            </select>
          </div>
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Schema hash</label>
            <input data-operation-field="schemaHash" type="text" placeholder="schema-sss2-b4a1fe">
          </div>
          <div class="field">
            <label>Replacement version</label>
            <input data-operation-field="replacementVersion" type="text" placeholder="Optional">
          </div>
        </div>
        <div class="field">
          <label>Notes URI</label>
          <input data-operation-field="notesUri" type="text" placeholder="https://docs.sss.dev/releases/v1.1.0">
        </div>
        <div class="field">
          <label>Deprecated on publish</label>
          <select data-operation-field="deprecated">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        ${actionButton("publish-release-live", "Publish Release", "primary", "publish")}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Release Notes</h3>
            <p class="panel-subtitle">Use the registry program configured in Settings. This action is suitable for protocol administration wallets only.</p>
          </div>
        </div>
        <div class="data-list">
          <div class="data-row"><span>Registry program</span><strong class="mono">${escapeHtml(state.settings.registryProgram || "Missing")}</strong></div>
          <div class="data-row"><span>Connected wallet</span><strong class="mono">${escapeHtml(currentWalletAddress() || "Not connected")}</strong></div>
          <div class="data-row"><span>Existing releases</span><strong>${allReleases().length}</strong></div>
        </div>
      </article>
    </section>
  `;
}

function renderStablecoinDetail(route) {
  const [, coinId, tab = "overview"] = route.split("/");
  const tabs = ["overview", "operations", "roles", "compliance", "registry", "activity", "config", "integrations"];
  const coin = findCoin(coinId);
  return `
    <section class="page-header">
      <div>
        <div class="badge-cluster">
          ${pill(coin.symbol, "primary")}
          ${pill(coin.tier, "primary")}
          ${pill(coin.status, coin.statusTone)}
        </div>
        <h1 class="headline">${escapeHtml(coin.name)}</h1>
        <p class="subline">${escapeHtml(coin.description)}</p>
      </div>
      <div class="button-row">
        ${button(`stablecoin/${coin.id}/operations`, "Operations", "primary", "tune")}
        ${button("registry", "Registry Record", "secondary", "north_east")}
      </div>
    </section>

    <section class="tab-row">
      ${tabs.map((item) => `
        <button class="${tab === item ? "active" : ""}" data-route="stablecoin/${coin.id}/${item}">${escapeHtml(item.charAt(0).toUpperCase() + item.slice(1))}</button>
      `).join("")}
    </section>

    ${tab === "operations"
      ? renderStablecoinOperations(coin)
      : tab === "roles"
        ? renderStablecoinRoles(coin)
        : tab === "compliance"
          ? renderStablecoinCompliance(coin)
          : tab === "registry"
            ? renderStablecoinRegistry(coin)
            : tab === "activity"
              ? renderStablecoinActivity(coin)
              : tab === "config"
                ? renderStablecoinConfig(coin)
                : tab === "integrations"
                  ? renderStablecoinIntegrations(coin)
                  : renderStablecoinOverview(coin)}
  `;
}

function renderStablecoinOverview(coin) {
  return `
    <section class="stat-grid">
      ${[
        ["Total minted", coin.totalMinted, coin.symbol],
        ["Total burned", coin.totalBurned, coin.symbol],
        ["Current supply", coin.currentSupply, coin.symbol],
        ["Frozen accounts", coin.frozenAccounts, "Action surface"],
      ].map(([label, value, foot]) => `
        <article class="stat-card">
          <div class="eyebrow">${escapeHtml(label)}</div>
          <span class="stat-value">${escapeHtml(value)}</span>
          <div class="stat-foot">${escapeHtml(foot)}</div>
        </article>
      `).join("")}
    </section>

    <section class="metadata-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Token Overview</h3>
            <p class="panel-subtitle">Operational summary from the overview prototype.</p>
          </div>
        </div>
        <div class="data-list">
          ${[
            ["Mint address", coin.mint],
            ["Config address", coin.configAddress || "n/a"],
            ["Config hash", coin.configHash],
            ["Jurisdiction", coin.jurisdiction],
            ["Registry status", coin.registry],
            ["Init signature", coin.signature || "n/a"],
          ].map(([key, value]) => `
            <div class="data-row">
              <span>${escapeHtml(key)}</span>
              <strong class="mono">${escapeHtml(value)}</strong>
            </div>
          `).join("")}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Feature Flags</h3>
            <p class="panel-subtitle">Enabled capabilities inferred from the stitched design set.</p>
          </div>
        </div>
        <div class="data-list">
          ${coin.featureFlags.map((flag) => `
            <div class="inline-main">
              <span class="material-symbols-outlined">check_circle</span>
              <span>${escapeHtml(flag)}</span>
            </div>
          `).join("")}
        </div>
      </article>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Authorities</h3>
            <p class="panel-subtitle">Key role assignments for minting, freezing, and compliance.</p>
          </div>
        </div>
        <div class="data-list">
          ${coin.authorities.map(([role, address]) => `
            <div class="data-row">
              <span>${escapeHtml(role)}</span>
              <strong class="mono">${escapeHtml(address)}</strong>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Registry Information</h3>
            <p class="panel-subtitle">Public metadata and disclosure surfaces.</p>
          </div>
        </div>
        <div class="data-list">
          ${coin.registryInfo.map(([key, value]) => `
            <div class="data-row">
              <span>${escapeHtml(key)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderStablecoinRoles(coin) {
  if (!shouldUseLiveActions(coin)) {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Roles Management</h3>
            <p class="panel-subtitle">This preview asset shows the stitched roles layout, but only live imported or deployed stablecoins can submit role updates.</p>
          </div>
        </div>
        <div class="data-list">
          ${coin.authorities.map(([role, address]) => `<div class="data-row"><span>${escapeHtml(role)}</span><strong class="mono">${escapeHtml(address)}</strong></div>`).join("")}
        </div>
      </section>
    `;
  }
  const roleAssignments = coin.roleAssignments || [];
  return `
    <section class="two-col">
      <article class="panel" data-operation-panel="role-live">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Grant Role</h3>
            <p class="panel-subtitle">Role assignment workflow based on the stitched roles management page.</p>
          </div>
          ${pill(`${roleAssignments.length} tracked`, "primary")}
        </div>
        <div class="field">
          <label>Holder</label>
          <input data-operation-field="holder" type="text" placeholder="Operator wallet public key">
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Role</label>
            <select data-operation-field="role">
              ${["minter", "burner", "blacklister", "pauser", "seizer"].map((role) => `<option value="${role}">${role}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>State</label>
            <select data-operation-field="active">
              <option value="true">Grant</option>
              <option value="false">Revoke</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Mint Quota</label>
          <input data-operation-field="mintQuota" type="text" placeholder="Optional for minter role">
        </div>
        ${actionButton("update-role-live", "Grant Role", "primary", "admin_panel_settings", `data-id="${escapeHtml(coin.id)}"`)}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Authority Summary</h3>
            <p class="panel-subtitle">Static and delegated operators visible to the frontend.</p>
          </div>
        </div>
        <div class="data-list">
          ${coin.authorities.map(([role, address]) => `
            <div class="data-row">
              <span>${escapeHtml(role)}</span>
              <strong class="mono">${escapeHtml(address)}</strong>
            </div>
          `).join("")}
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Role Assignment Table</h3>
          <p class="panel-subtitle">Session-tracked grants and revocations.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Holder</th><th>Role</th><th>Status</th><th>Quota</th><th>Action</th></tr></thead>
          <tbody>
            ${roleAssignments.length ? roleAssignments.map((entry) => `
              <tr>
                <td class="mono">${escapeHtml(shortAddress(entry.holder))}</td>
                <td>${escapeHtml(entry.role)}</td>
                <td>${pill(entry.active ? "Granted" : "Revoked", entry.active ? "success" : "warning")}</td>
                <td>${escapeHtml(entry.mintQuota || "n/a")}</td>
                <td>${entry.active ? actionButton("revoke-role-entry", "Revoke", "danger", "block", `data-id="${escapeHtml(coin.id)}" data-holder="${escapeHtml(entry.holder)}" data-role="${escapeHtml(entry.role)}"`) : '<span class="muted">Inactive</span>'}</td>
              </tr>
            `).join("") : `
              <tr><td colspan="5" class="muted">No delegated role changes have been recorded in this frontend session.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderStablecoinCompliance(coin) {
  if (!shouldUseLiveActions(coin)) {
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Compliance Management</h3>
            <p class="panel-subtitle">Preview mode for the stitched compliance surface. Live blacklist, seizure, root, and proof actions require an imported or deployed on-chain stablecoin.</p>
          </div>
        </div>
        <div class="stat-grid">
          <article class="stat-card"><div class="eyebrow">Blacklisted</div><span class="stat-value">${escapeHtml(coin.blacklisted)}</span></article>
          <article class="stat-card"><div class="eyebrow">Frozen Accounts</div><span class="stat-value">${escapeHtml(coin.frozenAccounts)}</span></article>
          <article class="stat-card"><div class="eyebrow">Status</div><span class="stat-value">${escapeHtml(coin.status)}</span></article>
          <article class="stat-card"><div class="eyebrow">Preset</div><span class="stat-value">${escapeHtml(coin.tier)}</span></article>
        </div>
      </section>
    `;
  }
  const proofReceipts = coin.proofReceipts || [];
  return `
    <section class="stat-grid">
      <article class="stat-card"><div class="eyebrow">Blacklist</div><span class="stat-value">${escapeHtml(coin.blacklisted)}</span></article>
      <article class="stat-card"><div class="eyebrow">Frozen Accounts</div><span class="stat-value">${escapeHtml(coin.frozenAccounts)}</span></article>
      <article class="stat-card"><div class="eyebrow">Proof Receipts</div><span class="stat-value">${proofReceipts.length}</span></article>
      <article class="stat-card"><div class="eyebrow">Compliance Root</div><span class="stat-value mono">${escapeHtml(shortAddress(coin.complianceRoot || "Unset"))}</span></article>
    </section>

    <section class="two-col">
      <article class="panel" data-operation-panel="blacklist-live">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Blacklist Manager</h3>
            <p class="panel-subtitle">Address restriction and removal controls.</p>
          </div>
        </div>
        <div class="field">
          <label>Wallet address</label>
          <input data-operation-field="address" type="text" placeholder="Wallet public key">
        </div>
        <div class="field">
          <label>Reason</label>
          <input data-operation-field="reason" type="text" placeholder="Sanctions / internal review">
        </div>
        <div class="button-row">
          ${actionButton("blacklist-add-live", "Add To Blacklist", "danger", "block", `data-id="${escapeHtml(coin.id)}"`)}
          ${actionButton("blacklist-remove-live", "Revoke", "ghost", "check_circle", `data-id="${escapeHtml(coin.id)}"`)}
        </div>
      </article>

      <article class="panel" data-operation-panel="seize-live">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Seizure Manager</h3>
            <p class="panel-subtitle">Move funds from a flagged account into a recovery account.</p>
          </div>
        </div>
        <div class="field">
          <label>Source token account</label>
          <input data-operation-field="fromAccount" type="text" placeholder="Flagged token account">
        </div>
        <div class="field">
          <label>Destination token account</label>
          <input data-operation-field="toAccount" type="text" placeholder="Recovery account">
        </div>
        ${actionButton("seize-live", "Confirm Seizure", "danger", "warning", `data-id="${escapeHtml(coin.id)}"`)}
      </article>
    </section>

    <section class="three-col">
      <article class="panel" data-operation-panel="screen-address">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Sanctions Screening</h3>
            <p class="panel-subtitle">Frontend-only screening note capture modeled after the stitch screen.</p>
          </div>
        </div>
        <div class="field">
          <label>Screen address</label>
          <input data-operation-field="address" type="text" placeholder="Wallet public key">
        </div>
        ${actionButton("screen-address", "Screen", "secondary", "travel_explore", `data-id="${escapeHtml(coin.id)}"`)}
      </article>

      <article class="panel" data-operation-panel="compliance-root-live">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Compliance Root Manager</h3>
            <p class="panel-subtitle">SSS-3 root updates for proof-gated transfers.</p>
          </div>
        </div>
        <div class="field">
          <label>Current / next root</label>
          <input data-operation-field="root" type="text" placeholder="Merkle root string" value="${escapeHtml(coin.complianceRoot || "")}">
        </div>
        ${actionButton("update-compliance-root-live", "Update Root", "secondary", "sync", `data-id="${escapeHtml(coin.id)}"`)}
      </article>

      <article class="panel" data-operation-panel="proof-receipt-live">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Proof Receipts</h3>
            <p class="panel-subtitle">Submit or revoke proof receipts for a subject wallet.</p>
          </div>
        </div>
        <div class="field">
          <label>Subject</label>
          <input data-operation-field="subject" type="text" placeholder="Wallet public key">
        </div>
        <div class="field">
          <label>Proof commitment</label>
          <input data-operation-field="proofCommitment" type="text" placeholder="64 hex chars">
        </div>
        <div class="field">
          <label>Compliance root</label>
          <input data-operation-field="complianceRoot" type="text" placeholder="Root snapshot used by proof">
        </div>
        <div class="button-row">
          ${actionButton("submit-proof-receipt-live", "Submit Proof", "primary", "verified", `data-id="${escapeHtml(coin.id)}"`)}
          ${actionButton("revoke-proof-receipt-live", "Revoke Proof", "ghost", "block", `data-id="${escapeHtml(coin.id)}"`)}
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Subject</th><th>Status</th><th>Root</th><th>Submitted</th></tr></thead>
          <tbody>
            ${proofReceipts.length ? proofReceipts.map((receipt) => `
              <tr>
                <td class="mono">${escapeHtml(shortAddress(receipt.subject))}</td>
                <td>${pill(receipt.status || "Valid", receipt.status === "Revoked" ? "danger" : "success")}</td>
                <td class="mono">${escapeHtml(shortAddress(receipt.complianceRoot || ""))}</td>
                <td>${escapeHtml(receipt.submittedAt || "Just now")}</td>
              </tr>
            `).join("") : '<tr><td colspan="4" class="muted">No proof receipts recorded yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderStablecoinRegistry(coin) {
  const live = shouldUseLiveActions(coin);
  const payload = {
    preset: coin.tier,
    standardVersion: "v1.0.0",
    configHash: coin.configHash,
    authority: coin.authorities?.[0]?.[1] || currentWalletAddress() || "Unknown",
    mint: coin.mint,
    homepage: coin.registryInfo?.find(([key]) => key === "Website")?.[1] || "",
    jurisdiction: coin.jurisdiction || "",
  };
  return `
    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Registry Status</h3>
            <p class="panel-subtitle">Registration summary based on the stitch registry management page.</p>
          </div>
          ${pill(coin.registry, coin.registryTone)}
        </div>
        <div class="data-list">
          ${[
            ["Preset", coin.tier],
            ["Config hash", coin.configHash],
            ["Jurisdiction", coin.jurisdiction],
            ["Website", coin.registryInfo?.find(([key]) => key === "Website")?.[1] || "Missing"],
            ["Compliance docs", coin.registryInfo?.find(([key]) => key === "Compliance docs")?.[1] || "Missing"],
          ].map(([key, value]) => `<div class="data-row"><span>${escapeHtml(key)}</span><strong class="${String(value).includes("http") || String(value).length > 20 ? "mono" : ""}">${escapeHtml(value)}</strong></div>`).join("")}
        </div>
        ${live && coin.registry !== "Registered"
          ? actionButton("register-live-coin", "Register Stablecoin", "primary", "menu_book", `data-id="${escapeHtml(coin.id)}"`)
          : `<p class="muted">${coin.registry === "Registered" ? "This stablecoin is already registered from the frontend perspective." : "Import or deploy this stablecoin live to submit a registry transaction."}</p>`}
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Registry Payload</h3>
            <p class="panel-subtitle">Payload preview for the configured mint.</p>
          </div>
          ${actionButton("preview-registry-payload", "Preview JSON", "ghost", "data_object", `data-id="${escapeHtml(coin.id)}"`)}
        </div>
        <pre class="code-block mono">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      </article>
    </section>
  `;
}

function renderStablecoinActivity(coin) {
  const activity = recentCoinActivity(coin);
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Stablecoin Activity</h3>
          <p class="panel-subtitle">Frontend-captured events scoped to this mint.</p>
        </div>
      </div>
      <div class="timeline">
        ${activity.length ? activity.map((item) => `
          <div class="timeline-item">
            <span class="timeline-marker ${item.type}"></span>
            <div>
              <h4>${escapeHtml(item.title)}</h4>
              <p>${escapeHtml(item.detail)}</p>
            </div>
            <div class="timeline-time">${escapeHtml(item.when)}</div>
          </div>
        `).join("") : '<div class="empty-state muted">No activity has been recorded for this stablecoin yet.</div>'}
      </div>
    </section>
  `;
}

function renderStablecoinConfig(coin) {
  const live = shouldUseLiveActions(coin);
  const registryPayload = {
    registry_version: 1,
    mint: coin.mint,
    config: coin.configAddress || "",
    authority: coin.authorities?.[0]?.[1] || "",
    compliance_flags: coin.featureFlags || [],
  };
  const configJson = {
    name: coin.name,
    symbol: coin.symbol,
    tier: coin.tier,
    configHash: coin.configHash,
    programId: coin.programId || "",
    decimals: coinDecimals(coin),
    currentSupply: coin.currentSupply,
    complianceRoot: coin.complianceRoot || null,
  };
  return `
    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Summarized Config</h3>
            <p class="panel-subtitle">Readable configuration summary.</p>
          </div>
          ${live ? actionButton("refresh-live-coin", "Refresh Config", "ghost", "autorenew", `data-id="${escapeHtml(coin.id)}"`) : ""}
        </div>
        <div class="data-list">
          ${[
            ["Mint", coin.mint],
            ["Program", coin.programId || "n/a"],
            ["Config PDA", coin.configAddress || "n/a"],
            ["Decimals", String(coinDecimals(coin))],
            ["Config hash", coin.configHash],
            ["Current supply", coin.currentSupply],
          ].map(([key, value]) => `<div class="data-row"><span>${escapeHtml(key)}</span><strong class="mono">${escapeHtml(value)}</strong></div>`).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Config Hash Details</h3>
            <p class="panel-subtitle">This hash is the registry-visible fingerprint of the deployment configuration.</p>
          </div>
        </div>
        <p>The frontend updates this view from the SDK config and local registry metadata, mirroring the stitch configuration screen.</p>
      </article>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Raw JSON Config</h3>
            <p class="panel-subtitle">Client-side serialization for export and review.</p>
          </div>
          ${actionButton("preview-config-json", "Open JSON", "ghost", "data_object", `data-id="${escapeHtml(coin.id)}"`)}
        </div>
        <pre class="code-block mono">${escapeHtml(JSON.stringify(configJson, null, 2))}</pre>
      </article>
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Raw Registry Payload</h3>
            <p class="panel-subtitle">Companion registry data associated with the mint.</p>
          </div>
        </div>
        <pre class="code-block mono">${escapeHtml(JSON.stringify(registryPayload, null, 2))}</pre>
      </article>
    </section>
  `;
}

function renderStablecoinIntegrations(coin) {
  const live = shouldUseLiveActions(coin);
  const hooks = allWebhooks().filter((hook) => !hook.coinId || hook.coinId === coin.id);
  return `
    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Integration Surface</h3>
            <p class="panel-subtitle">Per-stablecoin webhooks and delivery wiring.</p>
          </div>
          ${button("webhooks", "Open Global Webhooks", "secondary", "north_east")}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Endpoint</th><th>Event</th><th>Status</th></tr></thead>
            <tbody>
              ${hooks.map((hook) => `<tr><td class="mono">${escapeHtml(hook.endpoint)}</td><td>${escapeHtml(hook.eventType)}</td><td>${pill(hook.status, hook.tone)}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">No integrations have been scoped to this stablecoin yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel" data-operation-panel="add-webhook">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Attach Webhook</h3>
            <p class="panel-subtitle">Store a webhook subscription against this stablecoin in the frontend state.</p>
          </div>
        </div>
        <div class="field">
          <label>Webhook URL</label>
          <input data-operation-field="endpoint" type="url" placeholder="https://your-api.com/hooks/sss">
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Event type</label>
            <select data-operation-field="eventType">
              ${["MINT_COMPLETED", "BLACKLIST_UPDATED", "PROOF_RECEIPT_SUBMITTED", "ROLE_UPDATED"].map((eventType) => `<option value="${eventType}">${eventType}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Secret label</label>
            <input data-operation-field="secretLabel" type="text" placeholder="stablecoin-hook-01">
          </div>
        </div>
        <div class="field">
          <label>Retry policy</label>
          <input data-operation-field="retryPolicy" type="text" placeholder="3 retries">
        </div>
        ${live ? actionButton("add-webhook", "Attach Webhook", "primary", "add_link", `data-id="${escapeHtml(coin.id)}"`) : '<p class="muted">Webhook binding is enabled for live imported or deployed assets.</p>'}
      </article>
    </section>
  `;
}

function renderStablecoinOperations(coin) {
  const live = shouldUseLiveActions(coin);
  const activity = recentCoinActivity(coin);
  if (!live) {
    return `
      <section class="action-grid">
        <article class="action-card">
          <div class="icon-chip"><span class="material-symbols-outlined">add</span></div>
          <h3>Mint Tokens</h3>
          <p>Issue new ${escapeHtml(coin.symbol)} using the configured mint authority and quota limits.</p>
          ${actionButton("fake-op", "Mint 50,000", "primary", "arrow_forward", `data-op="Minted 50,000 ${escapeHtml(coin.symbol)}"`)}
        </article>
        <article class="action-card">
          <div class="icon-chip"><span class="material-symbols-outlined">remove</span></div>
          <h3>Burn Tokens</h3>
          <p>Reduce supply from treasury-controlled accounts or authorized circulation sinks.</p>
          ${actionButton("fake-op", "Burn 5,000", "secondary", "arrow_forward", `data-op="Burned 5,000 ${escapeHtml(coin.symbol)}"`)}
        </article>
        <article class="action-card">
          <div class="icon-chip"><span class="material-symbols-outlined">ac_unit</span></div>
          <h3>Freeze Account</h3>
          <p>Apply compliance intervention to a wallet flagged by monitoring or sanctions logic.</p>
          ${actionButton("fake-op", "Queue Freeze", "danger", "warning", `data-op="Freeze request queued for ${escapeHtml(coin.symbol)}"`)}
        </article>
      </section>

      <section class="two-col">
        <article class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Protocol State</h3>
              <p class="panel-subtitle">Pause and release behavior built from the operations prototype.</p>
            </div>
            ${pill(coin.status, coin.statusTone)}
          </div>
          <div class="button-row">
            ${actionButton("fake-op", coin.status === "Paused" ? "Unpause Protocol" : "Pause Protocol", "secondary", "sync", `data-op="${coin.status === "Paused" ? "Protocol unpaused" : "Protocol paused"}"`)}
            ${actionButton("fake-op", "Refresh Status", "ghost", "autorenew", 'data-op="Protocol status refreshed"')}
          </div>
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Transfer Authority</h3>
              <p class="panel-subtitle">Prepare new admin handoff under controlled review.</p>
            </div>
            ${pill("Warning: master authority", "warning")}
          </div>
          <div class="field">
            <label>New pending authority</label>
            <input type="text" value="8D4s...Qa21" readonly>
          </div>
          ${actionButton("fake-op", "Submit transfer", "primary", "arrow_forward", 'data-op="Authority transfer submitted"')}
        </article>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Operation Log</h3>
            <p class="panel-subtitle">Recent commands affecting this stablecoin.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Signer</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              ${[
                [`Mint 50,000 ${coin.symbol}`, "4fP2...nQd8", "Success", "2 mins ago"],
                ["Freeze account 91oP...9aWd", "A8d2...LmE4", "Pending", "42 mins ago"],
                ["Registry status refresh", "7xKz...f9Qa", "Success", "Today 08:21"],
              ].map(([event, signer, status, when]) => `
                <tr>
                  <td>${escapeHtml(event)}</td>
                  <td class="mono">${escapeHtml(signer)}</td>
                  <td>${pill(status, status === "Pending" ? "warning" : "success")}</td>
                  <td>${escapeHtml(when)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  return `
    <section class="three-col">
      <article class="action-card" data-operation-panel="mint-live">
        <div class="icon-chip"><span class="material-symbols-outlined">add</span></div>
        <h3>Mint Tokens</h3>
        <p>Mint to a wallet owner. The frontend will derive and create the Token-2022 ATA if it does not exist yet.</p>
        <div class="field">
          <label>Destination owner</label>
          <input data-operation-field="destinationOwner" type="text" placeholder="Wallet public key">
        </div>
        <div class="field">
          <label>Amount</label>
          <input data-operation-field="amount" type="text" placeholder="Amount (${coinDecimals(coin)} decimals)">
        </div>
        ${actionButton("mint-live", "Mint", "primary", "arrow_forward", `data-id="${escapeHtml(coin.id)}"`)}
      </article>
      <article class="action-card" data-operation-panel="burn-live">
        <div class="icon-chip"><span class="material-symbols-outlined">remove</span></div>
        <h3>Burn Tokens</h3>
        <p>Burn from a specific Token-2022 account controlled by an authorized burner.</p>
        <div class="field">
          <label>Source token account</label>
          <input data-operation-field="sourceAccount" type="text" placeholder="Token account public key">
        </div>
        <div class="field">
          <label>Amount</label>
          <input data-operation-field="amount" type="text" placeholder="Amount (${coinDecimals(coin)} decimals)">
        </div>
        ${actionButton("burn-live", "Burn", "secondary", "arrow_forward", `data-id="${escapeHtml(coin.id)}"`)}
      </article>
      <article class="action-card" data-operation-panel="freeze-live">
        <div class="icon-chip"><span class="material-symbols-outlined">ac_unit</span></div>
        <h3>Freeze / Thaw</h3>
        <p>Apply or lift transfer restrictions on a Token-2022 account under the protocol's pause/freeze authority.</p>
        <div class="field">
          <label>Token account</label>
          <input data-operation-field="tokenAccount" type="text" placeholder="Token account public key">
        </div>
        <div class="button-row">
          ${actionButton("freeze-live", "Freeze", "danger", "warning", `data-id="${escapeHtml(coin.id)}"`)}
          ${actionButton("thaw-live", "Thaw", "ghost", "autorenew", `data-id="${escapeHtml(coin.id)}"`)}
        </div>
      </article>
    </section>

    <section class="three-col">
      <article class="action-card" data-operation-panel="blacklist-live">
        <div class="icon-chip"><span class="material-symbols-outlined">gpp_bad</span></div>
        <h3>Blacklist Control</h3>
        <p>Restrict or restore a wallet owner for transfer-hook enforced SSS-2 and SSS-3 flows.</p>
        <div class="field">
          <label>Wallet address</label>
          <input data-operation-field="address" type="text" placeholder="Wallet public key">
        </div>
        <div class="field">
          <label>Reason</label>
          <input data-operation-field="reason" type="text" placeholder="Sanctions / monitoring / review">
        </div>
        <div class="button-row">
          ${actionButton("blacklist-add-live", "Blacklist", "danger", "block", `data-id="${escapeHtml(coin.id)}"`)}
          ${actionButton("blacklist-remove-live", "Remove", "ghost", "check_circle", `data-id="${escapeHtml(coin.id)}"`)}
        </div>
      </article>

      <article class="action-card" data-operation-panel="seize-live">
        <div class="icon-chip"><span class="material-symbols-outlined">shield_locked</span></div>
        <h3>Seize Balance</h3>
        <p>Move all funds from a flagged token account into a designated treasury or recovery account.</p>
        <div class="field">
          <label>Source token account</label>
          <input data-operation-field="fromAccount" type="text" placeholder="Flagged token account">
        </div>
        <div class="field">
          <label>Destination token account</label>
          <input data-operation-field="toAccount" type="text" placeholder="Treasury or recovery token account">
        </div>
        ${actionButton("seize-live", "Seize", "danger", "warning", `data-id="${escapeHtml(coin.id)}"`)}
      </article>

      <article class="action-card" data-operation-panel="role-live">
        <div class="icon-chip"><span class="material-symbols-outlined">admin_panel_settings</span></div>
        <h3>Role Management</h3>
        <p>Grant or revoke delegated operator roles directly from the browser wallet.</p>
        <div class="field">
          <label>Holder</label>
          <input data-operation-field="holder" type="text" placeholder="Operator wallet public key">
        </div>
        <div class="field-grid">
          <div class="field">
            <label>Role</label>
            <select data-operation-field="role">
              ${["minter", "burner", "blacklister", "pauser", "seizer"].map((role) => `<option value="${role}">${role}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>State</label>
            <select data-operation-field="active">
              <option value="true">Grant</option>
              <option value="false">Revoke</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Minter quota</label>
          <input data-operation-field="mintQuota" type="text" placeholder="Optional amount (${coinDecimals(coin)} decimals)">
        </div>
        ${actionButton("update-role-live", "Submit Role Change", "secondary", "arrow_forward", `data-id="${escapeHtml(coin.id)}"`)}
      </article>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Protocol State</h3>
            <p class="panel-subtitle">Pause and release behavior built from the operations prototype.</p>
          </div>
          ${pill(coin.status, coin.statusTone)}
        </div>
        <div class="button-row">
          ${actionButton("toggle-live-pause", coin.status === "Paused" ? "Unpause Protocol" : "Pause Protocol", "secondary", "sync", `data-id="${escapeHtml(coin.id)}"`)}
          ${actionButton("refresh-live-coin", "Refresh Status", "ghost", "autorenew", `data-id="${escapeHtml(coin.id)}"`)}
          ${coin.registry !== "Registered"
            ? actionButton("register-live-coin", "Register Stablecoin", "primary", "menu_book", `data-id="${escapeHtml(coin.id)}"`)
            : ""}
        </div>
      </article>

      <article class="panel" data-operation-panel="transfer-authority-live">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Transfer Authority</h3>
            <p class="panel-subtitle">Prepare new admin handoff under controlled review.</p>
          </div>
          ${pill("Warning: master authority", "warning")}
        </div>
        <div class="field">
          <label>New pending authority</label>
          <input data-operation-field="nextAuthority" type="text" placeholder="Pending authority public key">
        </div>
        ${actionButton("transfer-authority-live", "Submit transfer", "primary", "arrow_forward", `data-id="${escapeHtml(coin.id)}"`)}
      </article>
    </section>

    <section class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Operation Log</h3>
          <p class="panel-subtitle">Recent commands affecting this stablecoin.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Detail</th>
              <th>Tone</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            ${activity.length ? activity.map((item) => `
              <tr>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.detail)}</td>
                <td>${pill(item.type, item.type === "danger" ? "danger" : item.type === "warning" ? "warning" : "success")}</td>
                <td>${escapeHtml(item.when)}</td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="4" class="muted">No operation history has been recorded for this stablecoin in this frontend session yet.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderRegistry() {
  const entries = allRegistryEntries();
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Registry</p>
        <h1 class="headline">Registry Explorer</h1>
        <p class="subline">Public discovery records, issuer disclosures, and deployment release status.</p>
      </div>
      <div class="button-row">
        ${button("create/5", "Prepare Registry Payload", "primary", "arrow_forward")}
      </div>
    </section>

    <section class="stat-grid">
      ${[
        ["Entries", entries.length, "Known stablecoins"],
        ["Published", entries.filter((entry) => entry.status === "Published").length, "Live records"],
        ["Deprecated", entries.filter((entry) => entry.status === "Deprecated").length, "Legacy deployments"],
        ["Jurisdictions", new Set(entries.map((entry) => entry.jurisdiction)).size, "Coverage"],
      ].map(([label, value, foot]) => `
        <article class="stat-card">
          <div class="eyebrow">${escapeHtml(label)}</div>
          <span class="stat-value">${escapeHtml(value)}</span>
          <div class="stat-foot">${escapeHtml(foot)}</div>
        </article>
      `).join("")}
    </section>

    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Tier</th>
              <th>Issuer</th>
              <th>Status</th>
              <th>Jurisdiction</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((entry) => `
              <tr>
                <td>
                  <div class="token-main">
                    <div class="token-icon"><span class="material-symbols-outlined">token</span></div>
                    <div>
                      <strong>${escapeHtml(entry.name)}</strong>
                      <div class="token-symbol">${escapeHtml(entry.symbol)}</div>
                    </div>
                  </div>
                </td>
                <td>${pill(entry.tier, "primary")}</td>
                <td>${escapeHtml(entry.issuer)}</td>
                <td>${pill(entry.status, entry.tone)}</td>
                <td>${escapeHtml(entry.jurisdiction)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderActivity() {
  const activity = allActivity();
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Audit</p>
        <h1 class="headline">Activity Log</h1>
        <p class="subline">End-to-end event feed for token operations, registry publishing, and compliance interventions.</p>
      </div>
    </section>

    <section class="two-col">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Timeline</h3>
            <p class="panel-subtitle">Chronological system events.</p>
          </div>
        </div>
        <div class="timeline">
          ${activity.map((item) => `
            <div class="timeline-item">
              <span class="timeline-marker ${item.type}"></span>
              <div>
                <h4>${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(item.detail)}</p>
              </div>
              <div class="timeline-time">${escapeHtml(item.when)}</div>
            </div>
          `).join("")}
        </div>
      </article>
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Audit Summary</h3>
            <p class="panel-subtitle">Operational signals surfaced from the activity prototype.</p>
          </div>
        </div>
        <div class="data-list">
          ${[
            ["Mint events today", "7"],
            ["Freeze requests", "2 open"],
            ["Registry promotions", "1 release"],
            ["Authority changes", "0 pending"],
          ].map(([left, right]) => `
            <div class="data-row">
              <span>${escapeHtml(left)}</span>
              <strong>${escapeHtml(right)}</strong>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderHelp() {
  return renderDocumentationPage({ button, pill, launchRoute, state, escapeHtml });
}

function renderSettings() {
  return `
    <section class="page-header">
      <div>
        <p class="eyebrow">Environment</p>
        <h1 class="headline">Settings</h1>
        <p class="subline">RPC, program IDs, issuer metadata, and display preferences stored locally for the frontend.</p>
      </div>
    </section>

    <section class="settings-grid">
      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">RPC Configuration</h3>
            <p class="panel-subtitle">Cluster endpoint and program IDs used by the live SDK flows.</p>
          </div>
        </div>
        <div class="field">
          <label>RPC URL</label>
          <input data-scope="settings" data-field="rpcUrl" value="${escapeHtml(state.settings.rpcUrl)}">
        </div>
        <div class="field">
          <label>Stablecoin program</label>
          <input data-scope="settings" data-field="stablecoinProgram" value="${escapeHtml(state.settings.stablecoinProgram)}" placeholder="Program public key">
        </div>
        <div class="field">
          <label>Transfer hook program</label>
          <input data-scope="settings" data-field="transferHookProgram" value="${escapeHtml(state.settings.transferHookProgram)}" placeholder="Optional">
        </div>
        <div class="field">
          <label>Registry program</label>
          <input data-scope="settings" data-field="registryProgram" value="${escapeHtml(state.settings.registryProgram)}">
        </div>
        <div class="field">
          <label>Token program</label>
          <input data-scope="settings" data-field="tokenProgram" value="${escapeHtml(state.settings.tokenProgram)}">
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Deployment Readiness</h3>
            <p class="panel-subtitle">Live deploys require a configured stablecoin program and a connected wallet.</p>
          </div>
        </div>
        <div class="data-list">
          <div class="data-row"><span>Network</span><strong>${escapeHtml(getNetworkLabel())}</strong></div>
          <div class="data-row"><span>Stablecoin program</span><strong class="mono">${escapeHtml(state.settings.stablecoinProgram || "Missing")}</strong></div>
          <div class="data-row"><span>Registry program</span><strong class="mono">${escapeHtml(state.settings.registryProgram || "Optional")}</strong></div>
          <div class="data-row"><span>Transfer hook program</span><strong class="mono">${escapeHtml(state.settings.transferHookProgram || "Optional")}</strong></div>
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Feature Flags</h3>
            <p class="panel-subtitle">Frontend-side behavior toggles.</p>
          </div>
        </div>
        <div class="toggle-grid">
          ${toggleField("settings", "autoRegister", "Registry auto-register", "Automatically queue registry payloads after deploy.", state.settings.autoRegister)}
          ${toggleField("settings", "strictMode", "Strict validation", "Keep review step warnings visible when required fields are missing.", state.settings.strictMode)}
          ${toggleField("settings", "analytics", "Local analytics", "Track interaction metrics in this frontend session.", state.settings.analytics)}
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Issuer Metadata</h3>
            <p class="panel-subtitle">Shared metadata injected into registry and review screens.</p>
          </div>
        </div>
        <div class="field">
          <label>Issuer name</label>
          <input data-scope="settings" data-field="issuerName" value="${escapeHtml(state.settings.issuerName)}">
        </div>
        <div class="field">
          <label>Issuer website</label>
          <input data-scope="settings" data-field="issuerWebsite" value="${escapeHtml(state.settings.issuerWebsite)}">
        </div>
      </article>

      <article class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">Display Preferences</h3>
            <p class="panel-subtitle">Comfortable defaults with monospaced metadata blocks.</p>
          </div>
        </div>
        <div class="field">
          <label>Density</label>
          <select data-scope="settings" data-field="displayDensity">
            ${["Compact", "Comfortable", "Spacious"].map((option) => `<option ${state.settings.displayDensity === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </div>
        ${button("dashboard", "Return to Dashboard", "secondary", "west")}
      </article>
    </section>
  `;
}

function renderCreateFlow(step) {
  const progress = Math.round((step / 7) * 100);
  const labels = ["Protocol", "Metadata", "Extensions", "Roles", "Registry", "Review", "Deploy"];

  return `
    <section class="wizard-header">
      <div class="page-header">
        <div>
          <p class="eyebrow">Create flow</p>
          <h1 class="headline">Stablecoin Wizard</h1>
          <p class="subline">Interactive build path derived from the stitched create-stablecoin screens.</p>
        </div>
        ${pill(`${state.wizard.preset} preset`, "primary")}
      </div>
      <div class="wizard-stepper">
        ${labels.map((label, index) => {
          const order = index + 1;
          const status = step === order ? "active" : step > order ? "complete" : "";
          return `
            <div class="wizard-step ${status}">
              <div class="wizard-step-index">${step > order ? "OK" : order}</div>
              <small>${escapeHtml(label)}</small>
            </div>
          `;
        }).join("")}
      </div>
      <div class="progress-card">
        <div class="row-split">
          <div>
            <div class="eyebrow">Current progress</div>
            <strong>Step ${step} of 7</strong>
          </div>
          <strong class="mono">${progress}%</strong>
        </div>
        <div class="progress-rail">
          <div class="progress-fill" style="width:${progress}%"></div>
        </div>
      </div>
    </section>

    ${renderWizardStep(step)}
    ${renderWizardActions(step)}
  `;
}

function renderWizardStep(step) {
  if (step === 1) return renderWizardProtocol();
  if (step === 2) return renderWizardMetadata();
  if (step === 3) return renderWizardExtensions();
  if (step === 4) return renderWizardRoles();
  if (step === 5) return renderWizardRegistry();
  if (step === 6) return renderWizardReview();
  return renderWizardSuccess();
}

function renderWizardProtocol() {
  const presets = [
    ["SSS-1", "Minimal", "Lean issuance surface with basic mint and burn."],
    ["SSS-2", "Compliant Stablecoin", "Recommended preset with roles, controls, and registry support."],
    ["SSS-3", "Privacy Forward", "Experimental path for confidential and proof-based controls."],
  ];

  return `
    <section class="wizard-panel">
      <div>
        <p class="eyebrow">Step 1</p>
        <h3 class="panel-title">Choose protocol preset</h3>
        <p class="panel-subtitle">Use a preset as the basis for enabled controls and review expectations.</p>
      </div>
      <div class="three-col">
        ${presets.map(([value, title, copy]) => `
          <article class="token-card">
            <div class="row-split">
              ${pill(value, state.wizard.preset === value ? "primary" : "secondary")}
              ${state.wizard.preset === value ? pill("Selected", "success") : ""}
            </div>
            <h3 class="display">${escapeHtml(title)}</h3>
            <p>${escapeHtml(copy)}</p>
            <button class="button ${state.wizard.preset === value ? "primary" : "secondary"}" data-action="set-preset" data-preset="${value}">${state.wizard.preset === value ? "Selected" : "Use preset"}</button>
          </article>
        `).join("")}
      </div>
      <div class="summary-card">
        <small class="eyebrow">Release alignment</small>
        <div class="summary-row"><span class="summary-key">Published SSS release</span><strong class="mono">v1.0.0</strong></div>
        <div class="summary-row"><span class="summary-key">Recommended environment</span><strong>Devnet staging before production cutover</strong></div>
      </div>
    </section>
  `;
}

function renderWizardMetadata() {
  return `
    <section class="wizard-panel">
      <div>
        <p class="eyebrow">Step 2</p>
        <h3 class="panel-title">Token metadata</h3>
        <p class="panel-subtitle">Capture the fields shown in the metadata prototype and persist them locally.</p>
      </div>
      <div class="field-grid">
        <div class="field">
          <label>Token name</label>
          <input data-scope="wizard" data-field="tokenName" value="${escapeHtml(state.wizard.tokenName)}" placeholder="USD Standard">
        </div>
        <div class="field">
          <label>Metadata URI</label>
          <input data-scope="wizard" data-field="metadataUri" value="${escapeHtml(state.wizard.metadataUri)}" placeholder="https://.../metadata.json">
        </div>
      </div>
      <div class="field-grid triple">
        <div class="field">
          <label>Token symbol</label>
          <input data-scope="wizard" data-field="symbol" value="${escapeHtml(state.wizard.symbol)}" placeholder="USDS">
        </div>
        <div class="field">
          <label>Decimals</label>
          <input data-scope="wizard" data-field="decimals" type="number" value="${escapeHtml(state.wizard.decimals)}">
        </div>
        <div class="field">
          <label>Preset version</label>
          <input value="1.0.0" readonly>
        </div>
      </div>
    </section>
  `;
}

function renderWizardExtensions() {
  return `
    <section class="wizard-panel">
      <div>
        <p class="eyebrow">Step 3</p>
        <h3 class="panel-title">Extensions and controls</h3>
        <p class="panel-subtitle">Preset-derived capabilities exposed as explicit toggles.</p>
      </div>
      <div class="toggle-grid">
        ${toggleField("wizard", "permanentDelegate", "Permanent delegate", "Enable long-lived delegate authority for managed operations.", state.wizard.permanentDelegate)}
        ${toggleField("wizard", "transferHook", "Transfer hook", "Route transfers through compliance-aware logic.", state.wizard.transferHook)}
        ${toggleField("wizard", "defaultFrozen", "Default account frozen", "Require explicit account thaw before transfers.", state.wizard.defaultFrozen)}
        ${toggleField("wizard", "confidentialTransfers", "Confidential transfers", "Preview privacy-preserving transfer mode.", state.wizard.confidentialTransfers)}
        ${toggleField("wizard", "zkProofs", "ZK compliance proofs", "Pair compliance checks with proof-based verification.", state.wizard.zkProofs)}
        ${toggleField("wizard", "compressedState", "Compressed compliance state", "Reduce state footprint for advanced deployments.", state.wizard.compressedState)}
      </div>
    </section>
  `;
}

function renderWizardRoles() {
  return `
    <section class="wizard-panel">
      <div>
        <p class="eyebrow">Step 4</p>
        <h3 class="panel-title">Authorities and roles</h3>
        <p class="panel-subtitle">Separate operational keys for safer issuance and controls.</p>
      </div>
      <div class="field">
        <label>Master authority</label>
        <input data-scope="wizard" data-field="masterAuthority" value="${escapeHtml(state.wizard.masterAuthority)}" placeholder="Solana public key">
      </div>
      <div class="field-grid triple">
        <div class="field">
          <label>Initial minter</label>
          <input data-scope="wizard" data-field="minter" value="${escapeHtml(state.wizard.minter)}">
        </div>
        <div class="field">
          <label>Minter quota</label>
          <input data-scope="wizard" data-field="minterQuota" value="${escapeHtml(state.wizard.minterQuota)}">
        </div>
        <div class="field">
          <label>Freeze authority</label>
          <input data-scope="wizard" data-field="freezeAuthority" value="${escapeHtml(state.wizard.freezeAuthority)}">
        </div>
      </div>
      <div class="field">
        <label>Initial burner</label>
        <input data-scope="wizard" data-field="burner" value="${escapeHtml(state.wizard.burner)}">
      </div>
    </section>
  `;
}

function renderWizardRegistry() {
  return `
    <section class="wizard-panel">
      <div>
        <p class="eyebrow">Step 5</p>
        <h3 class="panel-title">On-chain registry</h3>
        <p class="panel-subtitle">Broadcast disclosure metadata so the asset can be discovered and trusted.</p>
      </div>
      ${toggleField("wizard", "autoRegister", "Registry status", "Broadcast this stablecoin to public registries after deploy.", state.wizard.autoRegister)}
      <div class="field-grid">
        <div class="field">
          <label>Jurisdiction</label>
          <select data-scope="wizard" data-field="jurisdiction">
            ${["United States", "European Union", "Cayman Islands", "Singapore", "Switzerland"].map((option) => `<option ${state.wizard.jurisdiction === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Contact email</label>
          <input data-scope="wizard" data-field="contactEmail" value="${escapeHtml(state.wizard.contactEmail)}">
        </div>
      </div>
      <div class="field-grid">
        <div class="field">
          <label>Compliance docs URI</label>
          <input data-scope="wizard" data-field="docsUri" value="${escapeHtml(state.wizard.docsUri)}">
        </div>
        <div class="field">
          <label>Issuer website</label>
          <input data-scope="wizard" data-field="issuerWebsite" value="${escapeHtml(state.wizard.issuerWebsite)}">
        </div>
      </div>
    </section>
  `;
}

function renderWizardReview() {
  const warnings = requiredWizardWarnings();
  return `
    <section class="wizard-panel">
      <div>
        <p class="eyebrow">Step 6</p>
        <h3 class="panel-title">Review and deploy</h3>
        <p class="panel-subtitle">Structured summary across metadata, preset, roles, and registry metadata.</p>
      </div>
      ${warnings.length ? `
        <div class="summary-card">
          <small class="eyebrow">Validation warnings</small>
          <div class="data-list">
            ${warnings.map((warning) => `<div class="inline-main"><span class="material-symbols-outlined">warning</span><span>${escapeHtml(warning)}</span></div>`).join("")}
          </div>
        </div>
      ` : `
        <div class="summary-card">
          <small class="eyebrow">Validation</small>
          <strong>All required fields are present for a live SDK-backed deploy.</strong>
        </div>
      `}
      <div class="summary-grid">
        <article class="summary-card">
          <small class="eyebrow">Token metadata</small>
          ${summaryRow("Name", state.wizard.tokenName)}
          ${summaryRow("Symbol", state.wizard.symbol)}
          ${summaryRow("Decimals", state.wizard.decimals)}
          ${summaryRow("Metadata URI", state.wizard.metadataUri)}
        </article>
        <article class="summary-card">
          <small class="eyebrow">Preset and extensions</small>
          ${summaryRow("Preset", state.wizard.preset)}
          ${summaryRow("Transfer hook", boolLabel(state.wizard.transferHook))}
          ${summaryRow("Default frozen", boolLabel(state.wizard.defaultFrozen))}
          ${summaryRow("Confidential", boolLabel(state.wizard.confidentialTransfers))}
        </article>
        <article class="summary-card">
          <small class="eyebrow">Role assignments</small>
          ${summaryRow("Master authority", state.wizard.masterAuthority)}
          ${summaryRow("Minter", state.wizard.minter)}
          ${summaryRow("Burner", state.wizard.burner)}
          ${summaryRow("Freeze authority", state.wizard.freezeAuthority)}
        </article>
        <article class="summary-card">
          <small class="eyebrow">Registry metadata</small>
          ${summaryRow("Auto-register", boolLabel(state.wizard.autoRegister))}
          ${summaryRow("Jurisdiction", state.wizard.jurisdiction)}
          ${summaryRow("Docs URI", state.wizard.docsUri)}
          ${summaryRow("Contact", state.wizard.contactEmail)}
        </article>
      </div>
      <div class="summary-card">
        <small class="eyebrow">Transaction intent</small>
        ${summaryRow("Expected accounts", "Mint, metadata, registry payload, role PDAs")}
        ${summaryRow("Stablecoin program", state.settings.stablecoinProgram || "Missing")}
        ${summaryRow("Registry program", state.settings.registryProgram || "Optional")}
        ${summaryRow("Config hash preview", makeConfigHash())}
      </div>
    </section>
  `;
}

function renderWizardSuccess() {
  const deployed = state.lastDeployment || makePreviewDeployment();
  return `
    <section class="wizard-panel">
      <div class="success-shell">
        <div class="success-mark"><span class="material-symbols-outlined">check</span></div>
        <div>
          <p class="eyebrow">Step 7</p>
          <h3 class="panel-title">Stablecoin deployed successfully.</h3>
          <p class="panel-subtitle">${escapeHtml(deployed.name)} (${escapeHtml(deployed.symbol)}) has been added to the frontend dataset and can now be reviewed in the token list and registry explorer.</p>
        </div>
        <div class="summary-card stretch">
          ${summaryRow("Mint address", deployed.mint)}
          ${summaryRow("Config PDA", deployed.configAddress)}
          ${summaryRow("Preset", deployed.tier)}
          ${summaryRow("Registry status", deployed.registry)}
          ${summaryRow("Config hash", deployed.configHash)}
          ${summaryRow("Init signature", deployed.signature)}
          ${deployed.registrySignature ? summaryRow("Registry signature", deployed.registrySignature) : ""}
        </div>
        <div class="button-row">
          ${button(`stablecoin/${deployed.id}/overview`, "Open Stablecoin", "primary", "north_east")}
          ${button("registry", "Open Registry", "secondary", "menu_book")}
          <button class="button ghost" data-action="reset-wizard">Create Another</button>
        </div>
      </div>
    </section>
  `;
}

function renderWizardActions(step) {
  if (step === 7) return "";
  const prevRoute = step === 1 ? "stablecoins" : `create/${step - 1}`;
  const nextLabel = step === 6 ? "Deploy Stablecoin" : "Continue";
  const nextAction = step === 6 ? "deploy-wizard" : "wizard-next";
  return `
    <section class="wizard-actions">
      ${button(prevRoute, "Back", "ghost", "west")}
      ${actionButton(nextAction, nextLabel, "primary", "arrow_forward", `data-step="${step}"`)}
    </section>
  `;
}

function toggleField(scope, field, title, copy, checked) {
  return `
    <label class="toggle-card">
      <div>
        <small>${escapeHtml(title)}</small>
        <div><strong>${escapeHtml(title)}</strong></div>
        <p class="helper">${escapeHtml(copy)}</p>
      </div>
      <span class="switch">
        <input type="checkbox" data-scope="${escapeHtml(scope)}" data-field="${escapeHtml(field)}" ${checked ? "checked" : ""}>
        <span></span>
      </span>
    </label>
  `;
}

function summaryRow(key, value) {
  return `<div class="summary-row"><span class="summary-key">${escapeHtml(key)}</span><strong>${escapeHtml(value || "Missing")}</strong></div>`;
}

function boolLabel(value) {
  return value ? "Enabled" : "Disabled";
}

function requiredWizardWarnings() {
  const warnings = [];
  if (!state.wizard.tokenName.trim()) warnings.push("Token name is required.");
  if (!state.wizard.symbol.trim()) warnings.push("Token symbol is required.");
  if (!state.wizard.metadataUri.trim()) warnings.push("Metadata URI is required.");
  if (!state.wizard.masterAuthority.trim()) warnings.push("Master authority is required.");
  if (!state.settings.stablecoinProgram.trim()) warnings.push("Stablecoin program ID is required for live deploys.");
  if (state.wizard.transferHook && !state.settings.transferHookProgram.trim()) warnings.push("Transfer hook program ID is required when transfer hook is enabled.");
  if (state.wizard.autoRegister && !state.wizard.contactEmail.trim()) warnings.push("Contact email is required when registry auto-register is enabled.");
  return warnings;
}

function makeMintAddress(symbol) {
  const seed = `${symbol}${Date.now()}`.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `${seed.slice(0, 4) || "MINT"}...${seed.slice(-4) || "0001"}`;
}

function makeConfigHash() {
  const token = `${state.wizard.tokenName}|${state.wizard.symbol}|${state.wizard.preset}|${state.wizard.jurisdiction}`;
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = ((hash << 5) - hash + token.charCodeAt(index)) | 0;
  return `cfg-${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

function makePreviewDeployment() {
  const symbol = state.wizard.symbol.trim() || "NEW";
  return {
    id: `${symbol.toLowerCase()}-preview`,
    name: state.wizard.tokenName.trim() || "New Stablecoin",
    symbol,
    tier: state.wizard.preset,
    registry: state.wizard.autoRegister ? "Registered" : "Draft",
    registryTone: state.wizard.autoRegister ? "primary" : "warning",
    configHash: makeConfigHash(),
    mint: makeMintAddress(symbol),
    configAddress: "Pending",
    signature: "Pending",
    registrySignature: "",
  };
}

async function connectWallet(providerName) {
  clearFeedback();
  if (isFileProtocol() && providerName !== "Demo Wallet") {
    setError("Extension wallets cannot connect from file:// pages. Serve the frontend on http://127.0.0.1:4173 or deploy it to HTTPS, then retry.");
    render();
    return;
  }
  const provider = detectWalletProvider(providerName);
  if (!provider) {
    setError(`${providerName} was not detected in this browser.`);
    render();
    return;
  }

  setBusy(`Connecting ${providerName}...`);
  render();
  const response = await provider.connect();
  runtime.provider = provider;
  runtime.lastSignature = "";
  state.connected = true;
  state.walletProvider = providerName;
  state.walletAddress = walletAddressFrom(provider, response);
  if (!state.walletAddress) {
    throw new Error("Wallet connected, but no public key was exposed by the provider.");
  }
  state.wizard.masterAuthority = state.walletAddress;
  state.wizard.minter = state.wizard.minter || state.walletAddress;
  state.wizard.burner = state.wizard.burner || state.walletAddress;
  state.wizard.freezeAuthority = state.wizard.freezeAuthority || state.walletAddress;
  if (providerName === "Demo Wallet") {
    ensureDemoWorkspace();
  }
  saveState();
  setBusy("");
  setNotice(`${providerName} connected as ${shortAddress(state.walletAddress)}.`);
  navigate("dashboard");
}

async function disconnectWallet() {
  clearFeedback();
  if (runtime.provider?.disconnect) {
    await runtime.provider.disconnect();
  }
  runtime.provider = null;
  runtime.lastSignature = "";
  state.connected = false;
  state.walletAddress = "";
  state.mobileMenuOpen = false;
  saveState();
  setNotice("Wallet disconnected.");
  navigate("connect");
}

async function restoreWalletConnection() {
  if (!state.connected || !state.walletProvider) return;
  const provider = detectWalletProvider(state.walletProvider);
  if (!provider?.connect) {
    state.connected = false;
    state.walletAddress = "";
    saveState();
    return;
  }

  try {
    const response = await provider.connect({ onlyIfTrusted: true });
    runtime.provider = provider;
    state.walletAddress = walletAddressFrom(provider, response);
    saveState();
  } catch (_error) {
    state.connected = false;
    state.walletAddress = "";
    saveState();
  }
}

async function registerStablecoin(coin) {
  const provider = getWalletSigner();
  const registryProgramId = parsePublicKey(state.settings.registryProgram, "Registry program");
  const stablecoinProgramId = parsePublicKey(coin.programId, "Stablecoin program");
  const connection = getConnection();
  const stable = await SolanaStablecoin.connect({
    connection,
    authority: provider,
    programId: stablecoinProgramId,
    mint: parsePublicKey(coin.mint, "Mint"),
    registryMetadata: {
      homepage: state.wizard.issuerWebsite || state.settings.issuerWebsite,
      jurisdiction: coin.jurisdiction,
    },
  });
  const entry = await stable.getRegistryEntry();
  const signature = await submitFrontendTransaction({
    connection,
    transaction: buildRegistryTransaction(
      buildRegisterStablecoinInstruction(
        {
          stablecoinProgramId,
          entry,
        },
        registryProgramId
      )
    ),
    signer: provider,
  });

  runtime.lastSignature = signature;
  updateCustomCoin(coin.id, (next) => {
    next.registry = "Registered";
    next.registryTone = "primary";
    next.registrySignature = signature;
    next.registryInfo = [
      ["Record status", "Published"],
      ["Website", state.wizard.issuerWebsite || state.settings.issuerWebsite || "Missing"],
      ["Compliance docs", state.wizard.docsUri || "Missing"],
      ["Jurisdiction", next.jurisdiction || "Missing"],
    ];
    return next;
  });
  state.customRegistryEntries = [
    {
      name: coin.name,
      symbol: coin.symbol,
      tier: coin.tier,
      issuer: state.settings.issuerName || "Stable Studio",
      status: "Published",
      tone: "primary",
      jurisdiction: coin.jurisdiction,
    },
    ...state.customRegistryEntries.filter((entry) => entry.symbol !== coin.symbol),
  ];
  saveState();
  prependActivity({
    type: "success",
    title: `Registered ${coin.symbol}`,
    detail: `Registry write confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Registry write confirmed for ${coin.symbol}.`);
}

async function refreshLiveCoin(coinId) {
  const { connection, coin, stable } = await getLiveCoinContext(coinId);
  const config = await stable.getConfig();
  const mintInfo = await getMint(connection, parsePublicKey(coin.mint, "Mint"), "confirmed", TOKEN_2022_PROGRAM_ID);
  updateCustomCoin(coinId, (next) => {
    next.status = config.isPaused ? "Paused" : "Active";
    next.statusTone = config.isPaused ? "warning" : "success";
    next.configHash = config.configHash;
    next.decimals = config.decimals;
    next.complianceRoot = config.compressedComplianceRoot || next.complianceRoot || "";
    next.supplyAtomic = mintInfo.supply.toString();
    next.currentSupply = formatTokenAmount(mintInfo.supply, config.decimals);
    next.supply = formatCoinSupplyDisplay(mintInfo.supply, { ...next, decimals: config.decimals });
    next.featureFlags = buildFeatureFlagsFromConfig(config);
    next.authorities = buildAuthoritiesFromConfig(config);
    return next;
  });
  setNotice(`Refreshed ${coin.symbol} from chain state.`);
}

async function toggleLivePause(coinId) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const nextPausedState = coin.status !== "Paused";
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildPauseTransaction(nextPausedState),
    signer: provider,
  });
  runtime.lastSignature = signature;
  updateCustomCoin(coinId, (next) => {
    next.status = nextPausedState ? "Paused" : "Active";
    next.statusTone = nextPausedState ? "warning" : "success";
    return next;
  });
  prependActivity({
    type: nextPausedState ? "warning" : "success",
    title: `${nextPausedState ? "Paused" : "Unpaused"} ${coin.symbol}`,
    detail: `Transaction confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`${coin.symbol} is now ${nextPausedState ? "paused" : "active"}.`);
}

async function importLiveStablecoin(fields) {
  const provider = getWalletSigner();
  const connection = getConnection();
  const mint = parsePublicKey(fields.mint, "Mint address");
  const stablecoinProgramId = parsePublicKey(state.settings.stablecoinProgram, "Stablecoin program");
  const stable = await SolanaStablecoin.connect({
    connection,
    authority: provider,
    programId: stablecoinProgramId,
    mint,
    registryMetadata: {
      homepage: state.settings.issuerWebsite,
      jurisdiction: "",
    },
  });
  const config = await stable.getConfig();
  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const symbolKey = `${config.symbol.toLowerCase()}-${mint.toBase58().slice(0, 6).toLowerCase()}`;
  const importedCoin = {
    id: symbolKey,
    name: config.name,
    symbol: config.symbol,
    tier: stablecoinTierLabel(config),
    supply: formatCoinSupplyDisplay(mintInfo.supply, { symbol: config.symbol, decimals: config.decimals }),
    status: config.isPaused ? "Paused" : "Active",
    registry: "Imported",
    registryTone: "warning",
    statusTone: config.isPaused ? "warning" : "success",
    mint: mint.toBase58(),
    configHash: config.configHash,
    configAddress: stable.getConfigAddress().toBase58(),
    programId: stablecoinProgramId.toBase58(),
    signature: "",
    registrySignature: "",
    live: true,
    decimals: config.decimals,
    jurisdiction: fields.jurisdiction?.trim() || "Unknown",
    description: describePreset(config),
    totalMinted: "Unknown",
    totalBurned: "Unknown",
    currentSupply: formatTokenAmount(mintInfo.supply, config.decimals),
    supplyAtomic: mintInfo.supply.toString(),
    mintedAtomic: "0",
    burnedAtomic: "0",
    complianceRoot: config.compressedComplianceRoot || "",
    proofReceipts: [],
    roleAssignments: [],
    frozenAccounts: "0",
    blacklisted: "0",
    featureFlags: buildFeatureFlagsFromConfig(config),
    authorities: buildAuthoritiesFromConfig(config),
    registryInfo: [
      ["Record status", "Imported"],
      ["Website", state.settings.issuerWebsite || "Missing"],
      ["Compliance docs", "Unknown"],
      ["Jurisdiction", fields.jurisdiction?.trim() || "Unknown"],
    ],
  };

  state.customStablecoins = [
    importedCoin,
    ...state.customStablecoins.filter((coin) => coin.mint !== importedCoin.mint),
  ];
  saveState();
  prependActivity({
    type: "success",
    title: `Imported ${importedCoin.symbol}`,
    detail: `Frontend attached to live mint ${shortAddress(importedCoin.mint)}.`,
    when: "Just now",
  });
  setNotice(`Imported live stablecoin ${importedCoin.symbol}.`);
  navigate(`stablecoin/${importedCoin.id}/overview`);
}

async function mintLiveCoin(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const destinationOwner = parsePublicKey(fields.destinationOwner, "Destination owner");
  const amount = parseTokenAmount(fields.amount, "Mint amount", coinDecimals(coin));
  const destinationAta = getAssociatedTokenAddressSync(
    stable.getMintAddress(),
    destinationOwner,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      provider.publicKey,
      destinationAta,
      destinationOwner,
      stable.getMintAddress(),
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    ...(await stable.buildMintTransaction({
      destination: destinationAta,
      amount,
      minter: provider.publicKey,
    })).instructions
  );
  const signature = await submitFrontendTransaction({ connection, transaction, signer: provider });
  runtime.lastSignature = signature;
  applyCoinAccounting(coinId, { mintedDelta: amount });
  await refreshLiveCoin(coinId);
  prependActivity({
    type: "success",
    title: `Minted ${formatTokenAmount(amount, coinDecimals(coin))} ${coin.symbol}`,
    detail: `Destination ATA ${destinationAta.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Mint confirmed for ${coin.symbol}.`);
}

async function burnLiveCoin(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const source = parsePublicKey(fields.sourceAccount, "Source token account");
  const amount = parseTokenAmount(fields.amount, "Burn amount", coinDecimals(coin));
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildBurnTransaction({
      source,
      amount,
      burner: provider.publicKey,
    }),
    signer: provider,
  });
  runtime.lastSignature = signature;
  applyCoinAccounting(coinId, { burnedDelta: amount });
  await refreshLiveCoin(coinId);
  prependActivity({
    type: "success",
    title: `Burned ${formatTokenAmount(amount, coinDecimals(coin))} ${coin.symbol}`,
    detail: `Burn source ${source.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Burn confirmed for ${coin.symbol}.`);
}

async function setFreezeStateLive(coinId, fields, thaw) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const address = parsePublicKey(fields.tokenAccount, "Token account");
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildFreezeTransaction(address, thaw),
    signer: provider,
  });
  runtime.lastSignature = signature;
  prependActivity({
    type: thaw ? "success" : "warning",
    title: `${thaw ? "Thawed" : "Froze"} account for ${coin.symbol}`,
    detail: `${address.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  updateCoinMetrics(coinId, (next) => {
    const currentFrozen = parseCount(next.frozenAccounts);
    next.frozenAccounts = String(Math.max(0, currentFrozen + (thaw ? -1 : 1)));
    return next;
  });
  setNotice(`${thaw ? "Thaw" : "Freeze"} confirmed for ${coin.symbol}.`);
}

async function updateBlacklistLive(coinId, fields, active) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const address = parsePublicKey(fields.address, "Wallet address");
  const transaction = active
    ? await stable.buildBlacklistAddTransaction({
      address,
      reason: requireActionValue(fields.reason, "Blacklist reason"),
    })
    : await stable.buildBlacklistRemoveTransaction(address);
  const signature = await submitFrontendTransaction({ connection, transaction, signer: provider });
  runtime.lastSignature = signature;
  prependActivity({
    type: active ? "warning" : "success",
    title: `${active ? "Blacklisted" : "Removed blacklist for"} ${coin.symbol}`,
    detail: `${address.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  updateCoinMetrics(coinId, (next) => {
    const currentBlacklisted = parseCount(next.blacklisted);
    next.blacklisted = String(Math.max(0, currentBlacklisted + (active ? 1 : -1)));
    return next;
  });
  setNotice(`${active ? "Blacklist add" : "Blacklist removal"} confirmed for ${coin.symbol}.`);
}

async function seizeLiveCoin(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const fromAccount = parsePublicKey(fields.fromAccount, "Source token account");
  const toAccount = parsePublicKey(fields.toAccount, "Destination token account");
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildSeizeTransaction({
      fromAccount,
      toAccount,
      seizer: provider.publicKey,
    }),
    signer: provider,
  });
  runtime.lastSignature = signature;
  prependActivity({
    type: "warning",
    title: `Seized ${coin.symbol} account`,
    detail: `${fromAccount.toBase58()} -> ${toAccount.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Seizure confirmed for ${coin.symbol}.`);
}

async function updateRoleLive(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const holder = parsePublicKey(fields.holder, "Role holder");
  const role = requireActionValue(fields.role, "Role");
  const isActive = fields.active === "true";
  const mintQuota = role === "minter" && String(fields.mintQuota || "").trim()
    ? parseTokenAmount(fields.mintQuota, "Mint quota", coinDecimals(coin))
    : null;
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildUpdateRoleTransaction({
      holder,
      role,
      isActive,
      mintQuota,
    }),
    signer: provider,
  });
  runtime.lastSignature = signature;
  updateCustomCoin(coinId, (next) => {
    next.roleAssignments = [
      {
        holder: holder.toBase58(),
        role,
        active: isActive,
        mintQuota: mintQuota ? formatTokenAmount(mintQuota, coinDecimals(next)) : "",
      },
      ...(next.roleAssignments || []).filter((item) => !(item.holder === holder.toBase58() && item.role === role)),
    ];
    return next;
  });
  prependActivity({
    type: isActive ? "success" : "warning",
    title: `${isActive ? "Granted" : "Revoked"} ${role} role`,
    detail: `${holder.toBase58()} confirmed for ${coin.symbol}. ${signature}`,
    when: "Just now",
  });
  setNotice(`Role update confirmed for ${coin.symbol}.`);
}

async function transferAuthorityLive(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const nextAuthority = parsePublicKey(fields.nextAuthority, "Pending authority");
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildAuthorityTransferTransaction(nextAuthority),
    signer: provider,
  });
  runtime.lastSignature = signature;
  prependActivity({
    type: "warning",
    title: `Proposed authority transfer for ${coin.symbol}`,
    detail: `Pending authority ${nextAuthority.toBase58()} submitted. ${signature}`,
    when: "Just now",
  });
  setNotice(`Authority transfer proposal submitted for ${coin.symbol}.`);
}

async function updateComplianceRootLive(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const root = requireActionValue(fields.root, "Compliance root");
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildUpdateComplianceRootTransaction(root),
    signer: provider,
  });
  runtime.lastSignature = signature;
  updateCustomCoin(coinId, (next) => {
    next.complianceRoot = root;
    return next;
  });
  prependActivity({
    type: "success",
    title: `Updated compliance root for ${coin.symbol}`,
    detail: `${root} confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Compliance root updated for ${coin.symbol}.`);
}

async function submitProofReceiptLive(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const subject = parsePublicKey(fields.subject, "Subject");
  const complianceRoot = requireActionValue(fields.complianceRoot, "Compliance root");
  const proofCommitment = parseHex32(fields.proofCommitment, "Proof commitment");
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildSubmitProofReceiptTransaction({
      subject,
      proofCommitment,
      complianceRoot,
    }),
    signer: provider,
  });
  runtime.lastSignature = signature;
  updateCustomCoin(coinId, (next) => {
    next.proofReceipts = [
      {
        subject: subject.toBase58(),
        status: "Valid",
        complianceRoot,
        submittedAt: "Just now",
      },
      ...(next.proofReceipts || []).filter((item) => item.subject !== subject.toBase58()),
    ];
    next.complianceRoot = complianceRoot;
    return next;
  });
  prependActivity({
    type: "success",
    title: `Submitted proof receipt for ${coin.symbol}`,
    detail: `${subject.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Proof receipt submitted for ${coin.symbol}.`);
}

async function revokeProofReceiptLive(coinId, fields) {
  const { provider, coin, connection, stable } = await getLiveCoinContext(coinId);
  const subject = parsePublicKey(fields.subject, "Subject");
  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildRevokeProofReceiptTransaction(subject),
    signer: provider,
  });
  runtime.lastSignature = signature;
  updateCustomCoin(coinId, (next) => {
    next.proofReceipts = (next.proofReceipts || []).map((item) => (
      item.subject === subject.toBase58() ? { ...item, status: "Revoked", submittedAt: "Just now" } : item
    ));
    return next;
  });
  prependActivity({
    type: "warning",
    title: `Revoked proof receipt for ${coin.symbol}`,
    detail: `${subject.toBase58()} confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Proof receipt revoked for ${coin.symbol}.`);
}

async function publishReleaseLive(fields) {
  const provider = getWalletSigner();
  const registryProgramId = parsePublicKey(state.settings.registryProgram, "Registry program");
  const authorityMismatch = await getRegistryAuthorityMismatch(registryProgramId);
  if (authorityMismatch) {
    throw new Error(`Registry authority mismatch. This registry is controlled by ${authorityMismatch.registryAuthority}, but your wallet is ${authorityMismatch.walletAuthority}.`);
  }
  const release = {
    id: `${requireActionValue(fields.standardVersion, "Standard version")}-${registryPresetValue(fields.preset)}`,
    standardVersion: requireActionValue(fields.standardVersion, "Standard version"),
    preset: requireActionValue(fields.preset, "Preset"),
    schemaHash: requireActionValue(fields.schemaHash, "Schema hash"),
    notesUri: requireActionValue(fields.notesUri, "Notes URI"),
    deprecated: fields.deprecated === "true",
    replacementVersion: String(fields.replacementVersion || "").trim(),
  };
  const signature = await submitFrontendTransaction({
    connection: getConnection(),
    transaction: buildRegistryTransaction(
      buildRegisterReleaseInstruction(
        {
          authority: provider.publicKey,
          standardVersion: release.standardVersion,
          preset: registryPresetValue(release.preset),
          schemaHash: release.schemaHash,
          notesUri: release.notesUri,
          deprecated: release.deprecated,
          replacementVersion: release.replacementVersion || null,
        },
        registryProgramId
      )
    ),
    signer: provider,
  });
  runtime.lastSignature = signature;
  upsertRelease({
    ...release,
    tone: release.deprecated ? "warning" : "success",
    status: release.deprecated ? "Deprecated" : "Published",
    signature,
  });
  prependActivity({
    type: "success",
    title: `Published release ${release.standardVersion}`,
    detail: `Registry release write confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Release ${release.standardVersion} published.`);
  navigate("release-registry");
}

async function deprecateReleaseLive(releaseId, replacementVersion = "") {
  const provider = getWalletSigner();
  const registryProgramId = parsePublicKey(state.settings.registryProgram, "Registry program");
  const authorityMismatch = await getRegistryAuthorityMismatch(registryProgramId);
  if (authorityMismatch) {
    throw new Error(`Registry authority mismatch. This registry is controlled by ${authorityMismatch.registryAuthority}, but your wallet is ${authorityMismatch.walletAuthority}.`);
  }
  const release = findRelease(releaseId);
  if (!release) {
    throw new Error("Release record not found.");
  }
  const signature = await submitFrontendTransaction({
    connection: getConnection(),
    transaction: buildRegistryTransaction(
      buildDeprecateReleaseInstruction(
        provider.publicKey,
        release.standardVersion,
        replacementVersion || release.replacementVersion || null,
        registryProgramId
      )
    ),
    signer: provider,
  });
  runtime.lastSignature = signature;
  upsertRelease({
    ...release,
    deprecated: true,
    replacementVersion: replacementVersion || release.replacementVersion || "",
    tone: "warning",
    status: "Deprecated",
    signature,
  });
  prependActivity({
    type: "warning",
    title: `Deprecated release ${release.standardVersion}`,
    detail: `Registry deprecation confirmed. ${signature}`,
    when: "Just now",
  });
  setNotice(`Release ${release.standardVersion} marked deprecated.`);
}

function addWebhook(fields, coinId = "") {
  const hook = {
    id: `hook-${Date.now()}`,
    endpoint: requireActionValue(fields.endpoint, "Webhook URL"),
    eventType: requireActionValue(fields.eventType, "Event type"),
    secretLabel: requireActionValue(fields.secretLabel, "Secret label"),
    retryPolicy: requireActionValue(fields.retryPolicy, "Retry policy"),
    status: "Healthy",
    tone: "success",
    deliveryRate: "Pending",
    coinId,
  };
  upsertWebhook(hook);
  prependActivity({
    type: "success",
    title: `Added webhook ${hook.eventType}`,
    detail: `${hook.endpoint} saved to frontend integrations.`,
    when: "Just now",
  });
  setNotice("Webhook saved.");
}

function removeWebhook(hookId) {
  const hook = findWebhook(hookId);
  state.customWebhooks = state.customWebhooks.filter((item) => item.id !== hookId);
  saveState();
  setNotice(`Removed webhook ${hook?.eventType || hookId}.`);
}

function testWebhook(hookId) {
  const hook = findWebhook(hookId);
  setNotice(`Test delivery queued for ${hook?.eventType || "webhook"} -> ${hook?.endpoint || "unknown endpoint"}.`);
}

function createMintRequest(fields) {
  const coin = findCoin(requireActionValue(fields.coinId, "Stablecoin"));
  const request = {
    id: `mint-request-${Date.now()}`,
    coinId: coin.id,
    symbol: coin.symbol,
    destinationOwner: requireActionValue(fields.destinationOwner, "Destination owner"),
    amount: requireActionValue(fields.amount, "Amount"),
    requestedBy: requireActionValue(fields.requestedBy, "Requested by"),
    reason: requireActionValue(fields.reason, "Reason"),
    status: "Pending",
  };
  state.customMintRequests = [request, ...state.customMintRequests];
  saveState();
  prependActivity({
    type: "warning",
    title: `Queued mint request for ${coin.symbol}`,
    detail: `${request.amount} requested for ${shortAddress(request.destinationOwner)}.`,
    when: "Just now",
  });
  setNotice(`Mint request queued for ${coin.symbol}.`);
}

function setMintRequestStatus(requestId, status) {
  updateMintRequest(requestId, (request) => ({ ...request, status }));
  setNotice(`Mint request ${status.toLowerCase()}.`);
}

async function executeMintRequest(requestId) {
  const request = findMintRequest(requestId);
  if (!request) {
    throw new Error("Mint request not found.");
  }
  const coin = findCoin(request.coinId);
  if (request.simulated || coin?.demo) {
    updateMintRequest(requestId, (current) => ({ ...current, status: "Complete" }));
    prependActivity({
      type: "success",
      title: `Executed mint request for ${request.symbol}`,
      detail: `${request.amount} simulated for ${shortAddress(request.destinationOwner)} in demo mode.`,
      when: "Just now",
    });
    setNotice(`Mint request executed in demo mode for ${request.symbol}.`);
    return;
  }
  await mintLiveCoin(request.coinId, {
    destinationOwner: request.destinationOwner,
    amount: request.amount,
  });
  updateMintRequest(requestId, (current) => ({ ...current, status: "Complete" }));
}

async function deployWizard() {
  const warnings = requiredWizardWarnings();
  if (warnings.length && state.settings.strictMode) {
    throw new Error(warnings[0]);
  }

  const provider = getWalletSigner();
  const authorityAddress = walletAddressFrom(provider) || provider.publicKey?.toBase58?.() || "";
  const stablecoinProgramId = parsePublicKey(state.settings.stablecoinProgram, "Stablecoin program");
  const transferHookProgramId = state.wizard.transferHook
    ? optionalPublicKey(state.settings.transferHookProgram, "Transfer hook program")
    : undefined;
  const decimals = Number(state.wizard.decimals);
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("Decimals must be between 0 and 9.");
  }

  const connection = getConnection();
  const mint = Keypair.generate();
  const stable = await SolanaStablecoin.create({
    connection,
    authority: provider,
    programId: stablecoinProgramId,
    preset: sdkPreset(state.wizard.preset),
    name: state.wizard.tokenName.trim(),
    symbol: state.wizard.symbol.trim(),
    uri: state.wizard.metadataUri.trim(),
    decimals,
    mint: mint.publicKey,
    transferHookProgramId,
    registryMetadata: {
      homepage: state.wizard.issuerWebsite || state.settings.issuerWebsite,
      jurisdiction: state.wizard.jurisdiction,
    },
    extensions: wizardExtensions(),
  });

  const signature = await submitFrontendTransaction({
    connection,
    transaction: await stable.buildInitializeTransaction(),
    signer: provider,
    extraSigners: [mint],
  });

  const config = await stable.getConfig();
  let registrySignature = "";
  let registryBlockedNotice = "";
  if (state.wizard.autoRegister && state.settings.registryProgram.trim()) {
    const registryProgramId = parsePublicKey(state.settings.registryProgram, "Registry program");
    try {
      const entry = await stable.getRegistryEntry();
      registrySignature = await submitFrontendTransaction({
        connection,
        transaction: buildRegistryTransaction(
          buildRegisterStablecoinInstruction(
            {
              stablecoinProgramId,
              entry,
            },
            registryProgramId
          )
        ),
        signer: provider,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      registryBlockedNotice = `Deploy succeeded, but auto-register failed: ${message}`;
    }
  }

  runtime.lastSignature = registrySignature || signature;
  const stableAuthorityAddress = authorityAddress || stable.getAuthorityPublicKey().toBase58();
  const stablecoin = {
    id: `${state.wizard.symbol.trim().toLowerCase()}-${stable.getMintAddress().toBase58().slice(0, 6).toLowerCase()}`,
    name: state.wizard.tokenName.trim(),
    symbol: state.wizard.symbol.trim(),
    tier: state.wizard.preset,
    supply: "$0",
    status: "Active",
    statusTone: "success",
    registry: registrySignature ? "Registered" : (state.wizard.autoRegister ? "Pending" : "Draft"),
    registryTone: registrySignature ? "primary" : "warning",
    configHash: config.configHash,
    mint: stable.getMintAddress().toBase58(),
    configAddress: stable.getConfigAddress().toBase58(),
    programId: stable.getProgramId().toBase58(),
    signature,
    registrySignature,
    live: true,
    decimals,
    jurisdiction: state.wizard.jurisdiction,
    description: "Live deployment created through the browser wallet and SDK transaction builders.",
    totalMinted: "0",
    totalBurned: "0",
    currentSupply: "0",
    supplyAtomic: "0",
    mintedAtomic: "0",
    burnedAtomic: "0",
    complianceRoot: config.compressedComplianceRoot || "",
    proofReceipts: [],
    roleAssignments: [],
    frozenAccounts: "0",
    blacklisted: "0",
    featureFlags: [
      state.wizard.transferHook ? "Transfer hook enabled" : "Transfer hook disabled",
      state.wizard.defaultFrozen ? "Default account frozen" : "Accounts transferable by default",
      state.wizard.confidentialTransfers ? "Confidential transfers enabled" : "Confidential transfers disabled",
      registrySignature ? "Registry registration confirmed" : "Registry registration pending",
      registryBlockedNotice ? "Registry authority mismatch detected" : "",
    ].filter(Boolean),
    authorities: [
      ["Master authority", stableAuthorityAddress],
      ["Mint authority", state.wizard.minter || stableAuthorityAddress],
      ["Burner", state.wizard.burner || stableAuthorityAddress],
      ["Freeze authority", state.wizard.freezeAuthority || stableAuthorityAddress],
    ],
    registryInfo: [
      ["Record status", registrySignature ? "Published" : (state.wizard.autoRegister ? "Pending" : "Draft")],
      ["Website", state.wizard.issuerWebsite || state.settings.issuerWebsite || "Missing"],
      ["Compliance docs", state.wizard.docsUri || "Missing"],
      ["Jurisdiction", state.wizard.jurisdiction || "Missing"],
    ],
  };

  state.customStablecoins = [stablecoin, ...state.customStablecoins.filter((coin) => coin.id !== stablecoin.id)];
  if (registrySignature) {
    state.customRegistryEntries = [
      {
        name: stablecoin.name,
        symbol: stablecoin.symbol,
        tier: stablecoin.tier,
        issuer: state.settings.issuerName || "Stable Studio",
        status: "Published",
        tone: "primary",
        jurisdiction: stablecoin.jurisdiction,
      },
      ...state.customRegistryEntries.filter((entry) => entry.symbol !== stablecoin.symbol),
    ];
  }
  prependActivity({
    type: "success",
    title: `Deployed ${stablecoin.symbol}`,
    detail: `Init confirmed for ${stablecoin.mint}. ${signature}`,
    when: "Just now",
  });
  state.lastDeployment = stablecoin;
  saveState();
  setNotice(
    registryBlockedNotice
      ? registryBlockedNotice
      : `Stablecoin deployed successfully. ${registrySignature ? "Registry registration also confirmed." : "You can register it from the operations view."}`
  );
}

function isRouteActive(current, target) {
  if (target === "stablecoins") return current === "stablecoins" || current.startsWith("stablecoin/");
  if (target === "create/1") return current.startsWith("create/");
  return current === target;
}

document.addEventListener("click", (event) => {
  const docTargetTrigger = event.target.closest("[data-doc-target]");
  if (docTargetTrigger) {
    event.preventDefault();
    const target = document.getElementById(docTargetTrigger.dataset.docTarget || "");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const routeTrigger = event.target.closest("[data-route]");
  if (routeTrigger) {
    event.preventDefault();
    state.mobileMenuOpen = false;
    saveState();
    navigate(routeTrigger.dataset.route);
    return;
  }

  const actionTrigger = event.target.closest("[data-action]");
  if (!actionTrigger) return;

  const action = actionTrigger.dataset.action;
  if (action === "toggle-menu") {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    saveState();
    render();
    return;
  }
  if (action === "close-menu") {
    state.mobileMenuOpen = false;
    saveState();
    render();
    return;
  }
  if (action === "dismiss-toast") {
    runtime.toasts = runtime.toasts.filter((toast) => toast.id !== actionTrigger.dataset.id);
    render();
    return;
  }
  if (action === "close-modal") {
    closeModal();
    render();
    return;
  }
  if (action === "confirm-modal") {
    void (async () => {
      try {
        if (!runtime.modal?.onConfirm) {
          closeModal();
          render();
          return;
        }
        const modalFields = collectModalFields();
        if (runtime.modal.confirmPhrase && modalFields.confirmPhrase !== runtime.modal.confirmPhrase) {
          throw new Error(`Type ${runtime.modal.confirmPhrase} to continue.`);
        }
        setBusy(runtime.modal.busy || "Submitting transaction...");
        render();
        await runtime.modal.onConfirm(modalFields);
        setBusy("");
        closeModal();
        render();
      } catch (error) {
        setBusy("");
        setError(error.message || "Confirmation failed.");
        render();
      }
    })();
    return;
  }
  if (action === "connect-wallet") {
    void (async () => {
      try {
        await connectWallet(actionTrigger.dataset.provider || "Phantom");
      } catch (error) {
        setBusy("");
        setError(error.message || "Wallet connection failed.");
        render();
      }
    })();
    return;
  }
  if (action === "disconnect-wallet") {
    void disconnectWallet();
    return;
  }
  if (action === "set-filter") {
    state.stablecoinFilter = actionTrigger.dataset.filter || "ALL";
    saveState();
    render();
    return;
  }
  if (action === "set-preset") {
    state.wizard.preset = actionTrigger.dataset.preset || "SSS-2";
    if (state.wizard.preset === "SSS-1") {
      state.wizard.transferHook = false;
      state.wizard.defaultFrozen = false;
      state.wizard.confidentialTransfers = false;
      state.wizard.zkProofs = false;
      state.wizard.compressedState = false;
    } else if (state.wizard.preset === "SSS-2") {
      state.wizard.transferHook = true;
      state.wizard.defaultFrozen = true;
      state.wizard.confidentialTransfers = false;
      state.wizard.zkProofs = false;
      state.wizard.compressedState = false;
    } else {
      state.wizard.transferHook = true;
      state.wizard.defaultFrozen = true;
      state.wizard.confidentialTransfers = true;
      state.wizard.zkProofs = true;
      state.wizard.compressedState = true;
    }
    saveState();
    render();
    return;
  }
  if (action === "wizard-next") {
    const current = Number(actionTrigger.dataset.step || getWizardStep(getRoute()));
    navigate(`create/${Math.min(current + 1, 7)}`);
    return;
  }
  if (action === "deploy-wizard") {
    void (async () => {
      try {
        setBusy("Submitting initialize transaction...");
        render();
        await deployWizard();
        setBusy("");
        navigate("create/7");
      } catch (error) {
        setBusy("");
        setError(error.message || "Deploy failed.");
        render();
      }
    })();
    return;
  }
  if (action === "reset-wizard") {
    state.wizard = { ...DEFAULT_STATE.wizard };
    saveState();
    navigate("create/1");
    return;
  }
  if (action === "fake-op") {
    const op = actionTrigger.dataset.op || "Operation completed";
    prependActivity({
      type: op.toLowerCase().includes("freeze") ? "warning" : "success",
      title: op,
      detail: "Generated by the interactive frontend operation surface.",
      when: "Just now",
    });
    render();
    return;
  }
  if (action === "refresh-service-health") {
    setNotice("Service health refreshed from the frontend monitoring view.");
    render();
    return;
  }
  if (action === "preview-registry-payload" || action === "preview-config-json") {
    const coin = findCoin(actionTrigger.dataset.id);
    const payload = action === "preview-registry-payload"
      ? {
        preset: coin.tier,
        configHash: coin.configHash,
        mint: coin.mint,
        jurisdiction: coin.jurisdiction,
      }
      : {
        name: coin.name,
        symbol: coin.symbol,
        mint: coin.mint,
        programId: coin.programId,
        decimals: coinDecimals(coin),
        complianceRoot: coin.complianceRoot || null,
      };
    openModal({
      tone: "primary",
      eyebrow: action === "preview-registry-payload" ? "Registry Payload" : "Config JSON",
      title: action === "preview-registry-payload" ? `${coin.symbol} Registry Preview` : `${coin.symbol} Config Preview`,
      body: "Review the serialized payload before copying it into another system.",
      code: JSON.stringify(payload, null, 2),
      rows: [["Payload bytes", `${JSON.stringify(payload).length}`]],
      confirmLabel: "Close",
      onConfirm: async () => {},
    });
    render();
    return;
  }
  if (action === "screen-address") {
    const fields = collectOperationFields(actionTrigger);
    const address = requireActionValue(fields.address, "Screen address");
    const risk = address.endsWith("Z") ? "High Risk" : "Cleared";
    openModal({
      tone: risk === "High Risk" ? "warning" : "success",
      eyebrow: "Screening Result",
      title: `${risk} Result`,
      body: `Manual sanctions screening result for ${address}.`,
      rows: [["Address", address], ["Decision", risk], ["Reviewer", currentWalletAddress() || "Frontend operator"]],
      confirmLabel: "Acknowledge",
      onConfirm: async () => {},
    });
    render();
    return;
  }
  if (action === "add-webhook") {
    try {
      addWebhook(collectOperationFields(actionTrigger), actionTrigger.dataset.id || "");
      render();
    } catch (error) {
      setError(error.message || "Webhook creation failed.");
      render();
    }
    return;
  }
  if (action === "test-webhook") {
    testWebhook(actionTrigger.dataset.id);
    render();
    return;
  }
  if (action === "remove-webhook") {
    removeWebhook(actionTrigger.dataset.id);
    render();
    return;
  }
  if (action === "create-mint-request") {
    try {
      createMintRequest(collectOperationFields(actionTrigger));
      render();
    } catch (error) {
      setError(error.message || "Mint request creation failed.");
      render();
    }
    return;
  }
  if (action === "approve-mint-request") {
    setMintRequestStatus(actionTrigger.dataset.id, "Approved");
    render();
    return;
  }
  if (action === "reject-mint-request") {
    setMintRequestStatus(actionTrigger.dataset.id, "Rejected");
    render();
    return;
  }
  if (action === "execute-mint-request") {
    void (async () => {
      try {
        setBusy("Executing approved mint request...");
        render();
        await executeMintRequest(actionTrigger.dataset.id);
        setBusy("");
        render();
      } catch (error) {
        setBusy("");
        setError(error.message || "Mint request execution failed.");
        render();
      }
    })();
    return;
  }
  if (action === "deprecate-release") {
    const release = findRelease(actionTrigger.dataset.id);
    openModal({
      tone: "danger",
      eyebrow: "Release Registry",
      title: `Deprecate ${release?.standardVersion || "release"}`,
      body: "This updates the release registry and affects discoverability for protocol deployments.",
      rows: [
        ["Version", release?.standardVersion || "Unknown"],
        ["Preset", release?.preset || "Unknown"],
        ["Replacement", release?.replacementVersion || "Optional"],
      ],
      confirmPhrase: "CONFIRM",
      confirmLabel: "Mark Deprecated",
      busy: "Submitting release deprecation...",
      onConfirm: async () => {
        await deprecateReleaseLive(actionTrigger.dataset.id);
      },
    });
    render();
    return;
  }
  if (action === "toggle-live-pause") {
    void (async () => {
      try {
        setBusy("Submitting pause state change...");
        render();
        await toggleLivePause(actionTrigger.dataset.id);
        setBusy("");
        render();
      } catch (error) {
        setBusy("");
        setError(error.message || "Pause action failed.");
        render();
      }
    })();
    return;
  }
  if (action === "refresh-live-coin") {
    void (async () => {
      try {
        setBusy("Refreshing on-chain state...");
        render();
        await refreshLiveCoin(actionTrigger.dataset.id);
        setBusy("");
        render();
      } catch (error) {
        setBusy("");
        setError(error.message || "Refresh failed.");
        render();
      }
    })();
    return;
  }
  if (action === "register-live-coin") {
    void (async () => {
      try {
        setBusy("Submitting registry transaction...");
        render();
        await registerStablecoin(findCoin(actionTrigger.dataset.id));
        setBusy("");
        render();
      } catch (error) {
        setBusy("");
        setError(error.message || "Registry write failed.");
        render();
      }
    })();
    return;
  }
  if (
    action === "import-live-coin"
    || action === "mint-live"
    || action === "burn-live"
    || action === "freeze-live"
    || action === "thaw-live"
    || action === "blacklist-add-live"
    || action === "blacklist-remove-live"
    || action === "seize-live"
    || action === "update-role-live"
    || action === "update-compliance-root-live"
    || action === "submit-proof-receipt-live"
    || action === "revoke-proof-receipt-live"
    || action === "transfer-authority-live"
    || action === "publish-release-live"
    || action === "revoke-role-entry"
  ) {
    void (async () => {
      let actionConfig;
      try {
        const fields = action === "revoke-role-entry"
          ? {
            holder: actionTrigger.dataset.holder,
            role: actionTrigger.dataset.role,
            active: "false",
            mintQuota: "",
          }
          : collectOperationFields(actionTrigger);
        const coinId = actionTrigger.dataset.id;
        if (action === "seize-live") {
          openModal({
            tone: "danger",
            eyebrow: "Confirm Seizure",
            title: `Seize ${findCoin(coinId).symbol} Balance`,
            body: "This action affects live protocol state and should only be used for recovery or enforcement operations.",
            rows: [
              ["From", fields.fromAccount || "Missing"],
              ["To", fields.toAccount || "Missing"],
            ],
            confirmPhrase: "CONFIRM",
            confirmLabel: "Confirm Seizure",
            busy: "Submitting seizure transaction...",
            onConfirm: async () => {
              await seizeLiveCoin(coinId, fields);
            },
          });
          render();
          return;
        }
        actionConfig = {
          "import-live-coin": {
            busy: "Importing live stablecoin...",
            failure: "Import failed.",
            run: () => importLiveStablecoin(fields),
          },
          "mint-live": {
            busy: "Submitting mint transaction...",
            failure: "Mint failed.",
            run: () => mintLiveCoin(coinId, fields),
          },
          "burn-live": {
            busy: "Submitting burn transaction...",
            failure: "Burn failed.",
            run: () => burnLiveCoin(coinId, fields),
          },
          "freeze-live": {
            busy: "Submitting freeze transaction...",
            failure: "Freeze failed.",
            run: () => setFreezeStateLive(coinId, fields, false),
          },
          "thaw-live": {
            busy: "Submitting thaw transaction...",
            failure: "Thaw failed.",
            run: () => setFreezeStateLive(coinId, fields, true),
          },
          "blacklist-add-live": {
            busy: "Submitting blacklist update...",
            failure: "Blacklist update failed.",
            run: () => updateBlacklistLive(coinId, fields, true),
          },
          "blacklist-remove-live": {
            busy: "Submitting blacklist removal...",
            failure: "Blacklist removal failed.",
            run: () => updateBlacklistLive(coinId, fields, false),
          },
          "update-role-live": {
            busy: "Submitting role update...",
            failure: "Role update failed.",
            run: () => updateRoleLive(coinId, fields),
          },
          "update-compliance-root-live": {
            busy: "Submitting compliance root update...",
            failure: "Compliance root update failed.",
            run: () => updateComplianceRootLive(coinId, fields),
          },
          "submit-proof-receipt-live": {
            busy: "Submitting proof receipt...",
            failure: "Proof receipt submission failed.",
            run: () => submitProofReceiptLive(coinId, fields),
          },
          "revoke-proof-receipt-live": {
            busy: "Revoking proof receipt...",
            failure: "Proof receipt revoke failed.",
            run: () => revokeProofReceiptLive(coinId, fields),
          },
          "transfer-authority-live": {
            busy: "Submitting authority transfer...",
            failure: "Authority transfer failed.",
            run: () => transferAuthorityLive(coinId, fields),
          },
          "publish-release-live": {
            busy: "Publishing release record...",
            failure: "Release publish failed.",
            run: () => publishReleaseLive(fields),
          },
          "revoke-role-entry": {
            busy: "Revoking delegated role...",
            failure: "Role revoke failed.",
            run: () => updateRoleLive(coinId, fields),
          },
        }[action];

        setBusy(actionConfig.busy);
        render();
        await actionConfig.run();
        setBusy("");
        render();
      } catch (error) {
        setBusy("");
        setError(error.message || actionConfig?.failure || "Protocol action failed.");
        render();
      }
    })();
    return;
  }
});

function handleFieldUpdate(target) {
  const scope = target.dataset.scope;
  const field = target.dataset.field;
  if (!scope || !field) return;
  const value = target.type === "checkbox" ? target.checked : target.value;
  if (scope === "wizard") state.wizard[field] = value;
  if (scope === "settings") state.settings[field] = value;
  saveState();
}

document.addEventListener("input", (event) => {
  if (event.target.matches("[data-scope][data-field]")) handleFieldUpdate(event.target);
});

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-scope][data-field]")) handleFieldUpdate(event.target);
});

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", async () => {
  await restoreWalletConnection();
  if (!window.location.hash) {
    navigate("landing");
    return;
  }
  render();
});
