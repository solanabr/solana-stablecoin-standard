#!/usr/bin/env node
/**
 * SSS Token Dashboard - Terminal UI for Solana Stablecoin Standard
 * Displays token info, supply, status, events, minters, and quick actions.
 */

import "dotenv/config";
import blessed from "blessed";
import contrib from "blessed-contrib";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import chalk from "chalk";

// ============ Types ============

interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  preset: string;
  authority: string;
}

interface SupplyInfo {
  current: bigint;
  minted: bigint;
  burned: bigint;
  cap: bigint | null;
  utilizationPercent: number;
}

interface StatusInfo {
  paused: boolean;
  transferHook: boolean;
  permanentDelegate: boolean;
  defaultFrozen: boolean;
}

interface MinterInfo {
  address: string;
  quota: string;
  minted: string;
  active: boolean;
}

interface DashboardData {
  tokenInfo: TokenInfo;
  supply: SupplyInfo;
  status: StatusInfo;
  minters: MinterInfo[];
  events: string[];
  connected: boolean;
}

// ============ Constants ============

const PROGRAM_ID = new PublicKey("SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz");
const STABLECOIN_SEED = Buffer.from("stablecoin");
const MINTER_SEED = Buffer.from("minter");
const REFRESH_INTERVAL_MS = 10_000;

// ============ Mock Data ============

function getMockData(): DashboardData {
  return {
    tokenInfo: {
      name: "Demo Stablecoin",
      symbol: "DEMO",
      decimals: 6,
      preset: "SSS-2",
      authority: "11111111111111111111111111111111",
    },
    supply: {
      current: BigInt("1500000000000"),
      minted: BigInt("2000000000000"),
      burned: BigInt("500000000000"),
      cap: BigInt("5000000000000"),
      utilizationPercent: 30,
    },
    status: {
      paused: false,
      transferHook: true,
      permanentDelegate: true,
      defaultFrozen: false,
    },
    minters: [
      { address: "Minter1...abc", quota: "1,000,000", minted: "500,000", active: true },
      { address: "Minter2...def", quota: "∞", minted: "250,000", active: true },
      { address: "Minter3...ghi", quota: "500,000", minted: "500,000", active: false },
    ],
    events: [
      "14:32:01 TokensMinted 1,000 DEMO → 7xK...",
      "14:28:45 TokensBurned 500 DEMO by 9mN...",
      "14:25:12 AccountFrozen 4pQ... by authority",
      "14:20:33 StablecoinUnpaused by pauser",
      "14:15:00 BlacklistRemoved 2wE...",
      "14:10:22 TokensMinted 2,500 DEMO → 5hR...",
    ],
    connected: false,
  };
}

// ============ Real Data Fetcher ============

async function fetchRealData(rpcUrl: string, mintAddress: string): Promise<DashboardData | null> {
  try {
    const connection = new Connection(rpcUrl, { commitment: "confirmed" });
    const dummyWallet = new Wallet(Keypair.generate());
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });

    const idl = await Program.fetchIdl(PROGRAM_ID, provider);
    if (!idl) return null;

    const program = new Program(idl as any, provider);
    const mint = new PublicKey(mintAddress);

    const [configPDA] = PublicKey.findProgramAddressSync(
      [STABLECOIN_SEED, mint.toBuffer()],
      PROGRAM_ID
    );

    const configData = await (program.account as any).stablecoinConfig.fetch(configPDA);
    const totalMinted = BigInt(configData.totalMinted.toString());
    const totalBurned = BigInt(configData.totalBurned.toString());
    const currentSupply = totalMinted - totalBurned;

    // Determine preset from extensions
    let preset = "Custom";
    if (configData.enablePermanentDelegate && configData.enableTransferHook) {
      preset = "SSS-2";
    } else if (!configData.enablePermanentDelegate && !configData.enableTransferHook) {
      preset = "SSS-1";
    }

    const capVal = (configData as any).supplyCap;
    const supplyCap =
      capVal != null && BigInt(capVal.toString()) > 0n ? BigInt(capVal.toString()) : null;
    const utilizationPercent =
      supplyCap && supplyCap > 0n
        ? Math.min(100, Number((currentSupply * 100n) / supplyCap))
        : 0;

    return {
      tokenInfo: {
        name: configData.name,
        symbol: configData.symbol,
        decimals: configData.decimals,
        preset,
        authority: configData.authority.toBase58().slice(0, 8) + "...",
      },
      supply: {
        current: currentSupply,
        minted: totalMinted,
        burned: totalBurned,
        cap: supplyCap,
        utilizationPercent,
      },
      status: {
        paused: configData.paused,
        transferHook: configData.enableTransferHook,
        permanentDelegate: configData.enablePermanentDelegate,
        defaultFrozen: configData.defaultAccountFrozen,
      },
      minters: [], // Would require getProgramAccounts - leave empty for now
      events: [
        `Connected at ${new Date().toLocaleTimeString()}`,
        `Mint: ${mint.toBase58().slice(0, 16)}...`,
      ],
      connected: true,
    };
  } catch (err) {
    console.error("Fetch error:", err);
    return null;
  }
}

// ============ Format Helpers ============

function formatAmount(val: bigint, decimals: number): string {
  const div = BigInt(10 ** decimals);
  const whole = val / div;
  const frac = val % div;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return whole.toString() + (fracStr !== "0" ? "." + fracStr : "");
}

function formatShort(val: bigint): string {
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ============ Dashboard ============

function createDashboard() {
  const screen = blessed.screen({
    smartCSR: true,
    title: "SSS Token Dashboard",
    fullUnicode: true,
  });

  const grid = new contrib.grid({
    rows: 12,
    cols: 12,
    screen,
    hideBorder: false,
  } as any);

  // Panel styles
  const boxStyle = {
    border: { type: "line", fg: "cyan" },
    style: { fg: "white", border: { fg: "cyan" } },
    padding: { top: 1, right: 1, bottom: 1, left: 1 },
  };

  const labelStyle = {
    ...boxStyle,
    tags: true,
    label: " ",
  };

  // (a) Token Info - top-left
  const tokenInfoBox = grid.set(0, 0, 3, 4, blessed.box, {
    ...labelStyle,
    label: " {bold}{cyan-fg}Token Info{/} ",
  } as any);

  // (b) Supply - top-center (includes numbers + utilization bar)
  const supplyBox = grid.set(0, 4, 3, 4, blessed.box, {
    ...labelStyle,
    label: " {bold}{cyan-fg}Supply{/} ",
  } as any);

  // (c) Status - top-right
  const statusBox = grid.set(0, 8, 3, 4, blessed.box, {
    ...labelStyle,
    label: " {bold}{cyan-fg}Status{/} ",
  } as any);

  // (d) Recent Events - middle left (contrib.log for scrollable event history)
  const eventsBox = grid.set(3, 0, 6, 6, contrib.log, {
    fg: "green",
    selectedFg: "black",
    selectedBg: "green",
    border: { type: "line", fg: "cyan" },
    tags: true,
    label: " {bold}{cyan-fg}Recent Events{/} ",
  } as any);

  // (e) Minters - middle right
  const mintersTable = grid.set(3, 6, 6, 6, contrib.table, {
    keys: true,
    fg: "white",
    selectedFg: "black",
    selectedBg: "green",
    label: " Minters ",
    border: { type: "line", fg: "cyan" },
    columnSpacing: 2,
    columnWidth: [16, 10, 10, 6],
  } as any);

  // (f) Quick Actions - bottom
  const actionsBox = grid.set(9, 0, 3, 12, blessed.box, {
    ...labelStyle,
    label: " {bold}{cyan-fg}Quick Actions{/} ",
  } as any);

  // ============ Update Functions ============

  function updateTokenInfo(data: TokenInfo) {
    tokenInfoBox.setContent(
      [
        `{bold}Name:{/bold}     ${data.name}`,
        `{bold}Symbol:{/bold}   ${data.symbol}`,
        `{bold}Decimals:{/bold} ${data.decimals}`,
        `{bold}Preset:{/bold}   ${data.preset}`,
        `{bold}Authority:{/bold} ${data.authority}`,
      ].join("\n")
    );
  }

  function updateSupply(data: SupplyInfo, decimals: number) {
    const currentStr = formatAmount(data.current, decimals);
    const mintedStr = formatAmount(data.minted, decimals);
    const burnedStr = formatAmount(data.burned, decimals);
    const capStr = data.cap ? formatAmount(data.cap, decimals) : "∞";

    // ASCII utilization bar (20 chars)
    const pct = Math.min(100, data.utilizationPercent);
    const filled = Math.round((pct / 100) * 20);
    const empty = 20 - filled;
    const barColor = pct >= 90 ? "red" : pct >= 70 ? "yellow" : "green";
    const bar = `{${barColor}-fg}${"█".repeat(filled)}{/}{gray-fg}${"░".repeat(empty)}{/}`;

    supplyBox.setContent(
      [
        `{bold}Current:{/bold}  ${currentStr}`,
        `{bold}Minted:{/bold}   ${mintedStr}`,
        `{bold}Burned:{/bold}   ${burnedStr}`,
        `{bold}Cap:{/bold}      ${capStr}`,
        ``,
        `Utilization: ${pct}%`,
        `[${bar}]`,
      ].join("\n")
    );
  }

  function updateStatus(data: StatusInfo) {
    const pausedColor = data.paused ? "{red-fg}" : "{green-fg}";
    const pausedText = data.paused ? "PAUSED" : "Active";

    statusBox.setContent(
      [
        `{bold}Paused:{/bold} ${pausedColor}${pausedText}{/}`,
        `{bold}Transfer Hook:{/bold} ${data.transferHook ? "{green-fg}Yes{/}" : "No"}`,
        `{bold}Perm Delegate:{/bold} ${data.permanentDelegate ? "{green-fg}Yes{/}" : "No"}`,
        `{bold}Default Frozen:{/bold} ${data.defaultFrozen ? "{yellow-fg}Yes{/}" : "No"}`,
      ].join("\n")
    );
  }

  function updateEvents(events: string[]) {
    eventsBox.setContent(events.join("\n"));
  }

  function updateMinters(minters: MinterInfo[]) {
    if (minters.length === 0) {
      mintersTable.setData({
        headers: ["Address", "Quota", "Minted", "Active"],
        data: [["(no minters)", "-", "-", "-"]],
      });
    } else {
      mintersTable.setData({
        headers: ["Address", "Quota", "Minted", "Active"],
        data: minters.map((m) => [
          m.address,
          m.quota,
          m.minted,
          m.active ? "✓" : "✗",
        ]),
      });
    }
  }

  function updateActions(connected: boolean) {
    actionsBox.setContent(
      [
        `{bold}[p]{/bold} Pause  {bold}[u]{/bold} Unpause  {bold}[r]{/bold} Refresh  {bold}[q]{/bold} Quit`,
        connected
          ? `{green-fg}●{/} Connected to RPC | Mint: ${process.env.MINT_ADDRESS?.slice(0, 16) || "N/A"}...`
          : `{yellow-fg}○{/} Mock mode | Set RPC_URL and MINT_ADDRESS for live data`,
      ].join("\n")
    );
  }

  function renderAll(data: DashboardData) {
    updateTokenInfo(data.tokenInfo);
    updateSupply(data.supply, data.tokenInfo.decimals);
    updateStatus(data.status);
    updateEvents(data.events);
    updateMinters(data.minters);
    updateActions(data.connected);
    screen.render();
  }

  // ============ Data Fetch Loop ============

  let currentData = getMockData();

  async function refresh() {
    const rpcUrl = process.env.RPC_URL;
    const mintAddress = process.env.MINT_ADDRESS;

    if (rpcUrl && mintAddress) {
      const real = await fetchRealData(rpcUrl, mintAddress);
      if (real) {
        currentData = real;
      }
      // On error, keep previous data
    } else {
      currentData = getMockData();
    }

    renderAll(currentData);
  }

  // Initial load
  refresh();

  const refreshInterval = setInterval(refresh, REFRESH_INTERVAL_MS);

  // ============ Keyboard Shortcuts ============

  screen.key(["q", "C-c"], () => {
    clearInterval(refreshInterval);
    process.exit(0);
  });

  screen.key(["r", "R"], () => {
    refresh();
  });

  screen.key(["p", "P"], () => {
    const msg = "Pause: Requires CLI with pauser keypair (not implemented in TUI)";
    (eventsBox as any).log(`{yellow-fg}${msg}{/}`);
    screen.render();
  });

  screen.key(["u", "U"], () => {
    const msg = "Unpause: Requires CLI with pauser keypair (not implemented in TUI)";
    (eventsBox as any).log(`{yellow-fg}${msg}{/}`);
    screen.render();
  });

  // Focus navigation
  screen.key(["tab"], () => {
    (mintersTable as any).focus();
    screen.render();
  });

  // ============ Render ============

  screen.render();

  return { screen, refresh };
}

// ============ Main ============

function main() {
  try {
    createDashboard();
  } catch (err) {
    console.error("Dashboard error:", err);
    process.exit(1);
  }
}

main();
