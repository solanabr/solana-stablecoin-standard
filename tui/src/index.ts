#!/usr/bin/env node

/**
 * SSS Admin TUI — Interactive Terminal Dashboard
 *
 * Premium terminal UI for stablecoin operations.
 *
 * Usage:
 *   cd tui && npx ts-node src/index.ts --mint <address> [--url <rpc>]
 *
 * Navigation:
 *   ↑/↓ or j/k  — Navigate menu
 *   Enter        — Select action
 *   r            — Refresh data
 *   q / Ctrl+C   — Quit
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  fetchStablecoinConfig,
  fetchRoleManager,
  deriveConfigPda,
  deriveRolesPda,
} from "@stbr/sss-token";
import type { StablecoinConfig, RoleManager } from "@stbr/sss-token";
import * as readline from "readline";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

// ── ANSI Codes ──────────────────────────────────────────────────────────

const ESC = "\x1b";
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR = `${ESC}[2J${ESC}[H`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const ITALIC = `${ESC}[3m`;
const RESET = `${ESC}[0m`;

// Gradient palette (indigo → violet → cyan)
const C = {
  bg: `${ESC}[48;5;234m`,
  headerBg: `${ESC}[48;5;17m`,
  // Gradient text colors
  g1: `${ESC}[38;5;63m`,   // deep indigo
  g2: `${ESC}[38;5;99m`,   // purple
  g3: `${ESC}[38;5;135m`,  // violet
  g4: `${ESC}[38;5;141m`,  // lavender
  g5: `${ESC}[38;5;177m`,  // light purple
  // Semantic colors
  green: `${ESC}[38;5;114m`,
  red: `${ESC}[38;5;203m`,
  yellow: `${ESC}[38;5;221m`,
  cyan: `${ESC}[38;5;117m`,
  white: `${ESC}[38;5;255m`,
  dim: `${ESC}[38;5;245m`,
  dimmer: `${ESC}[38;5;240m`,
  dimmest: `${ESC}[38;5;236m`,
  accent: `${ESC}[38;5;141m`,
  accentBold: `${ESC}[1;38;5;141m`,
};

// Box drawing
const BOX = {
  tl: "╭", tr: "╮", bl: "╰", br: "╯",
  h: "─", v: "│",
  ltee: "├", rtee: "┤",
  cross: "┼",
};

// Spinner frames
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ── Config ──────────────────────────────────────────────────────────────

function parseArgs(): { mint: string; url: string } {
  const args = process.argv.slice(2);
  let mint = process.env.SSS_MINT || "";
  let url = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mint" && args[i + 1]) mint = args[++i];
    if (args[i] === "--url" && args[i + 1]) url = args[++i];
  }

  if (!url) {
    const configPath = path.join(os.homedir(), ".config", "solana", "cli", "config.yml");
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf8");
      const match = content.match(/json_rpc_url:\s*"?([^\s"]+)"?/);
      if (match) url = match[1];
    }
  }
  if (!url) url = "http://localhost:8899";

  return { mint, url };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function shortKey(key: PublicKey | string): string {
  const s = typeof key === "string" ? key : key.toBase58();
  if (s.length < 12) return s;
  return `${s.slice(0, 4)}..${s.slice(-4)}`;
}

function formatAmount(amount: number | bigint, decimals: number): string {
  const n = Number(amount) / 10 ** decimals;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad(str: string, len: number): string {
  // Strip ANSI for length calculation
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - visible.length;
  return diff > 0 ? str + " ".repeat(diff) : str;
}

function center(str: string, width: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const left = Math.max(0, Math.floor((width - visible.length) / 2));
  const right = Math.max(0, width - visible.length - left);
  return " ".repeat(left) + str + " ".repeat(right);
}

// ── Menu Items ──────────────────────────────────────────────────────────

interface MenuItem {
  icon: string;
  label: string;
  key: string;
  description: string;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: "◈", label: "Overview", key: "overview", description: "Supply, features, and status" },
  { icon: "⊡", label: "Roles", key: "roles", description: "Authority and role assignments" },
  { icon: "⬡", label: "Minters", key: "minters", description: "Active minters and quotas" },
  { icon: "◎", label: "Holders", key: "holders", description: "Top token holder accounts" },
  { icon: "⊘", label: "Blacklist", key: "blacklist", description: "Check address blacklist status" },
];

// ── View Types ──────────────────────────────────────────────────────────

type ViewKey = "overview" | "roles" | "minters" | "holders" | "blacklist";

// ── Rendering Engine ────────────────────────────────────────────────────

class TuiRenderer {
  private w: number;
  private lines: string[] = [];

  constructor() {
    this.w = Math.min(process.stdout.columns || 80, 88);
  }

  private push(line: string) {
    this.lines.push(line);
  }

  private hLine(left: string, fill: string, right: string, color: string = C.dimmest) {
    this.push(`  ${color}${left}${fill.repeat(this.w - 4)}${right}${RESET}`);
  }

  private row(content: string) {
    this.push(`  ${C.dimmest}${BOX.v}${RESET} ${pad(content, this.w - 6)} ${C.dimmest}${BOX.v}${RESET}`);
  }

  private emptyRow() {
    this.row("");
  }

  // ── Header ──

  renderHeader() {
    const gradient = [C.g1, C.g2, C.g3, C.g4, C.g5];
    const title = "SSS Admin";
    const subtitle = "Solana Stablecoin Standard";

    this.push("");
    this.hLine(BOX.tl, BOX.h, BOX.tr, C.g3);

    // Gradient title
    let titleStr = "";
    for (let i = 0; i < title.length; i++) {
      titleStr += gradient[Math.floor((i / title.length) * gradient.length)] + title[i];
    }
    titleStr += RESET;
    this.row(`${BOLD}${titleStr}${RESET}  ${C.dim}${subtitle}${RESET}`);

    this.hLine(BOX.ltee, BOX.h, BOX.rtee, C.dimmest);
  }

  // ── Status Bar ──

  renderStatusBar(connected: boolean, url: string, mint: string, refreshing: boolean, lastRefresh: Date) {
    const dot = connected ? `${C.green}●${RESET}` : `${C.red}●${RESET}`;
    const rpcLabel = url.includes("devnet") ? "devnet" : url.includes("mainnet") ? "mainnet" : "local";
    const time = lastRefresh.toLocaleTimeString("en-US", { hour12: false });
    const refreshIndicator = refreshing
      ? `  ${C.dimmer}│${RESET}  ${C.yellow}Refreshing...${RESET}`
      : `  ${C.dimmer}│${RESET}  ${C.dim}${time}${RESET}`;

    this.row(
      `${dot} ${C.dim}${rpcLabel}${RESET}  ${C.dimmer}│${RESET}  ` +
      `${C.dim}mint${RESET} ${C.dimmer}${shortKey(mint)}${RESET}` +
      refreshIndicator
    );
    this.hLine(BOX.ltee, BOX.h, BOX.rtee, C.dimmest);
  }

  // ── Menu ──

  renderMenu(selected: number) {
    this.emptyRow();
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      const item = MENU_ITEMS[i];
      if (i === selected) {
        this.row(
          `  ${C.accentBold}❯ ${item.icon} ${item.label}${RESET}  ${C.dim}${item.description}${RESET}`
        );
      } else {
        this.row(`    ${C.dimmer}${item.icon}${RESET} ${C.dim}${item.label}${RESET}`);
      }
    }
    this.emptyRow();
    this.hLine(BOX.ltee, BOX.h, BOX.rtee, C.dimmest);
  }

  // ── Overview View ──

  renderOverview(config: StablecoinConfig) {
    const supply = Number(config.totalMinted) - Number(config.totalBurned);
    const statusText = config.isPaused
      ? `${C.red}${BOLD}⏸ PAUSED${RESET}`
      : `${C.green}${BOLD}● ACTIVE${RESET}`;

    this.emptyRow();
    this.row(`${BOLD}${C.white}${config.name}${RESET} ${C.dim}(${config.symbol})${RESET}  ${statusText}`);
    this.emptyRow();

    // Supply stats with bar chart visual
    const fmt = (v: number | bigint) => formatAmount(v, config.decimals);
    const minted = Number(config.totalMinted);
    const burned = Number(config.totalBurned);
    const burnRatio = minted > 0 ? Math.round((burned / minted) * 20) : 0;
    const bar = `${C.green}${"█".repeat(20 - burnRatio)}${C.red}${"█".repeat(burnRatio)}${RESET}`;

    this.row(`  ${C.dim}Supply${RESET}     ${C.white}${BOLD}${fmt(supply)} ${config.symbol}${RESET}`);
    this.row(`  ${C.dim}Minted${RESET}     ${C.green}+${fmt(config.totalMinted)}${RESET}`);
    this.row(`  ${C.dim}Burned${RESET}     ${C.red}-${fmt(config.totalBurned)}${RESET}`);
    this.row(`  ${C.dim}Health${RESET}     ${bar}`);
    this.emptyRow();

    // Features
    this.row(`  ${C.accent}Features${RESET}`);
    const feat = (on: boolean, label: string) =>
      on ? `${C.green}✓${RESET} ${C.dim}${label}${RESET}` : `${C.dimmer}✗ ${label}${RESET}`;

    this.row(
      `  ${feat(config.enablePermanentDelegate, "Permanent Delegate")}   ${feat(config.enableTransferHook, "Transfer Hook")}`
    );
    this.row(
      `  ${feat(config.enableConfidentialTransfers, "Confidential TX")}      ${feat(config.defaultAccountFrozen, "Default Frozen")}`
    );
    this.emptyRow();
  }

  // ── Roles View ──

  renderRoles(roles: RoleManager) {
    this.emptyRow();
    this.row(`  ${C.accent}Role Assignments${RESET}`);
    this.emptyRow();

    const roleItems = [
      { icon: "♛", name: "Master Authority", key: roles.masterAuthority, color: C.g5 },
      { icon: "⏸", name: "Pauser", key: roles.pauser, color: C.yellow },
      { icon: "⊘", name: "Blacklister", key: roles.blacklister, color: C.red },
      { icon: "⚡", name: "Seizer", key: roles.seizer, color: C.red },
    ];

    for (const r of roleItems) {
      const fullKey = typeof r.key === "string" ? r.key : r.key.toBase58();
      this.row(
        `  ${r.color}${r.icon}${RESET}  ${pad(`${C.dim}${r.name}${RESET}`, 35)} ${C.dimmer}${shortKey(fullKey)}${RESET}`
      );
    }
    this.emptyRow();
    this.row(`  ${C.dim}Minters: ${C.white}${roles.minters.length}${RESET}  ${C.dim}Burners: ${C.white}${roles.burners.length}${RESET}`);
    this.emptyRow();
  }

  // ── Minters View ──

  renderMinters(roles: RoleManager, decimals: number) {
    this.emptyRow();
    this.row(`  ${C.accent}Minter Registry${RESET}  ${C.dim}(${roles.minters.length} active)${RESET}`);
    this.emptyRow();

    if (roles.minters.length === 0) {
      this.row(`  ${C.dimmer}${ITALIC}No minters configured${RESET}`);
      this.emptyRow();
      return;
    }

    // Table header
    this.row(
      `  ${C.dimmer}${pad("ADDRESS", 14)} ${pad("QUOTA", 14)} ${pad("USED", 14)} ${pad("UTILIZATION", 20)}${RESET}`
    );
    this.row(`  ${C.dimmest}${"─".repeat(this.w - 8)}${RESET}`);

    for (const m of roles.minters) {
      const quota = Number(m.quota);
      const minted = Number(m.minted);
      const pct = quota > 0 ? Math.round((minted / quota) * 100) : 0;
      const barLen = 12;
      const filled = Math.round((pct / 100) * barLen);
      const barColor = pct > 90 ? C.red : pct > 60 ? C.yellow : C.green;
      const bar = `${barColor}${"█".repeat(filled)}${C.dimmest}${"░".repeat(barLen - filled)}${RESET} ${C.dim}${pct}%${RESET}`;

      this.row(
        `  ${C.dim}${pad(shortKey(m.address), 14)} ${pad(formatAmount(m.quota, decimals), 14)} ${pad(formatAmount(m.minted, decimals), 14)} ${bar}`
      );
    }
    this.emptyRow();
  }

  // ── Holders View ──

  renderHolders(holders: { address: string; amount: string }[], decimals: number) {
    this.emptyRow();
    this.row(`  ${C.accent}Top Holders${RESET}  ${C.dim}(${holders.length} accounts)${RESET}`);
    this.emptyRow();

    if (holders.length === 0) {
      this.row(`  ${C.dimmer}${ITALIC}No holders found${RESET}`);
      this.emptyRow();
      return;
    }

    this.row(`  ${C.dimmer}${pad("#", 4)} ${pad("ADDRESS", 14)} ${pad("BALANCE", 18)}${RESET}`);
    this.row(`  ${C.dimmest}${"─".repeat(this.w - 8)}${RESET}`);

    for (let i = 0; i < Math.min(holders.length, 10); i++) {
      const h = holders[i];
      const rank = `${C.dimmer}${(i + 1).toString().padStart(2)}.${RESET}`;
      this.row(
        `  ${rank} ${C.dim}${pad(shortKey(h.address), 14)} ${C.white}${pad(formatAmount(Number(h.amount), decimals), 18)}${RESET}`
      );
    }
    this.emptyRow();
  }

  // ── Blacklist View ──

  renderBlacklist() {
    this.emptyRow();
    this.row(`  ${C.accent}Blacklist Lookup${RESET}`);
    this.emptyRow();
    this.row(`  ${C.dim}Use the CLI to check blacklist status:${RESET}`);
    this.row(`  ${C.dimmer}$ sss-cli blacklist check <ADDRESS> --mint <MINT>${RESET}`);
    this.emptyRow();
  }

  // ── Footer ──

  renderFooter() {
    this.hLine(BOX.ltee, BOX.h, BOX.rtee, C.dimmest);
    this.row(
      `${C.dimmer}↑↓${RESET} ${C.dim}navigate${RESET}  ` +
      `${C.dimmer}⏎${RESET} ${C.dim}select${RESET}  ` +
      `${C.dimmer}r${RESET} ${C.dim}refresh${RESET}  ` +
      `${C.dimmer}q${RESET} ${C.dim}quit${RESET}`
    );
    this.hLine(BOX.bl, BOX.h, BOX.br, C.dimmest);
  }

  // ── Loading ──

  renderLoading(frame: number) {
    this.lines = [];
    this.push("");
    this.hLine(BOX.tl, BOX.h, BOX.tr, C.g3);
    const spinner = SPINNER[frame % SPINNER.length];
    this.row(center(`${C.accent}${spinner}${RESET} ${C.dim}Connecting...${RESET}`, this.w - 6));
    this.hLine(BOX.bl, BOX.h, BOX.br, C.dimmest);
    this.push("");
    return this.flush();
  }

  // ── Error ──

  renderError(message: string, url: string, mint: string) {
    this.lines = [];
    this.renderHeader();
    this.emptyRow();
    this.row(`  ${C.red}✕${RESET} ${C.dim}${message}${RESET}`);
    this.emptyRow();
    this.row(`  ${C.dimmer}RPC:  ${url}${RESET}`);
    this.row(`  ${C.dimmer}Mint: ${mint}${RESET}`);
    this.emptyRow();
    this.row(`  ${C.dim}Press ${C.dimmer}r${RESET}${C.dim} to retry or ${C.dimmer}q${RESET}${C.dim} to quit${RESET}`);
    this.emptyRow();
    this.hLine(BOX.bl, BOX.h, BOX.br, C.dimmest);
    this.push("");
    return this.flush();
  }

  // ── Full Dashboard ──

  renderDashboard(
    config: StablecoinConfig,
    roles: RoleManager,
    mint: string,
    url: string,
    selectedMenu: number,
    view: ViewKey,
    holders: { address: string; amount: string }[],
    refreshing: boolean = false,
    lastRefresh: Date = new Date(),
  ): string {
    this.lines = [];
    this.w = Math.min(process.stdout.columns || 80, 88);

    this.renderHeader();
    this.renderStatusBar(true, url, mint, refreshing, lastRefresh);
    this.renderMenu(selectedMenu);

    switch (view) {
      case "overview":
        this.renderOverview(config);
        break;
      case "roles":
        this.renderRoles(roles);
        break;
      case "minters":
        this.renderMinters(roles, config.decimals);
        break;
      case "holders":
        this.renderHolders(holders, config.decimals);
        break;
      case "blacklist":
        this.renderBlacklist();
        break;
    }

    this.renderFooter();
    this.push("");

    return this.flush();
  }

  private flush(): string {
    const result = this.lines.join("\n");
    this.lines = [];
    return result;
  }
}

interface AppState {
  config: StablecoinConfig | null;
  roles: RoleManager | null;
  selectedMenu: number;
  view: ViewKey;
  holders: { address: string; amount: string }[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastRefresh: Date;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { mint, url } = parseArgs();

  if (!mint) {
    console.log(`
  ${C.accent}SSS Admin TUI${RESET}

  ${C.dim}Usage:${RESET}
    ${C.dimmer}cd tui && npx ts-node src/index.ts --mint <ADDRESS>${RESET}

  ${C.dim}Options:${RESET}
    ${C.dimmer}--mint <address>  Token mint address (required)${RESET}
    ${C.dimmer}--url <rpc>       RPC endpoint (default: from Solana CLI config)${RESET}

  ${C.dim}Or set:${RESET}
    ${C.dimmer}SSS_MINT=<address> npx ts-node src/index.ts${RESET}
`);
    process.exit(0);
  }

  const connection = new Connection(url, "confirmed");
  const mintPk = new PublicKey(mint);
  const [configPda] = deriveConfigPda(mintPk);
  const [rolesPda] = deriveRolesPda(configPda);
  const renderer = new TuiRenderer();

  const state: AppState = {
    config: null,
    roles: null,
    selectedMenu: 0,
    view: "overview",
    holders: [],
    loading: true,
    refreshing: false,
    error: null,
    lastRefresh: new Date(),
  };

  // Hide cursor and set up raw mode
  process.stdout.write(HIDE_CURSOR);
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
  }

  // Clean exit
  const cleanup = () => {
    process.stdout.write(SHOW_CURSOR + RESET + "\n");
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // ── Spinner (only for initial load) ──

  let spinFrame = 0;
  const spinInterval = setInterval(() => {
    if (state.loading) {
      process.stdout.write(CLEAR + renderer.renderLoading(spinFrame++));
    }
  }, 80);

  // ── Data Fetching ──

  const fetchData = async (showSpinner = false) => {
    if (showSpinner) state.loading = true;
    try {
      const [config, roles] = await Promise.all([
        fetchStablecoinConfig(connection, configPda),
        fetchRoleManager(connection, rolesPda),
      ]);
      state.config = config;
      state.roles = roles;
      state.error = null;

      // Fetch holders if viewing that tab
      if (state.view === "holders") {
        try {
          const { value } = await connection.getTokenLargestAccounts(mintPk);
          state.holders = value.map((a) => ({
            address: a.address.toBase58(),
            amount: a.amount,
          }));
        } catch {
          state.holders = [];
        }
      }
    } catch (err) {
      state.error = (err as Error).message;
    }
    state.loading = false;
    state.refreshing = false;
    state.lastRefresh = new Date();
  };

  const render = () => {
    if (state.loading) return; // spinner handles initial loading display

    if (state.error) {
      process.stdout.write(CLEAR + renderer.renderError(state.error, url, mint));
      return;
    }

    if (state.config && state.roles) {
      process.stdout.write(
        CLEAR +
        renderer.renderDashboard(
          state.config,
          state.roles,
          mint,
          url,
          state.selectedMenu,
          state.view,
          state.holders,
          state.refreshing,
          state.lastRefresh,
        )
      );
    }
  };


  // ── Keyboard Input ──

  process.stdin.on("keypress", async (str, key) => {
    if (!key && !str) return;

    const ch = key?.name || str || "";

    // Quit
    if (ch === "q" || (key?.ctrl && key?.name === "c")) {
      cleanup();
      return;
    }

    // Navigate up (highlight only, doesn't switch view)
    if (ch === "up" || ch === "k") {
      state.selectedMenu = Math.max(0, state.selectedMenu - 1);
      render();
      return;
    }

    // Navigate down (highlight only, doesn't switch view)
    if (ch === "down" || ch === "j") {
      state.selectedMenu = Math.min(MENU_ITEMS.length - 1, state.selectedMenu + 1);
      render();
      return;
    }

    // Select — actually switch the view
    if (ch === "return") {
      const newView = MENU_ITEMS[state.selectedMenu].key as ViewKey;
      state.view = newView;
      if (newView === "holders" && state.holders.length === 0) {
        await fetchData();
      }
      render();
      return;
    }

    // Refresh — inline status with 1s minimum display
    if (ch === "r") {
      state.refreshing = true;
      render();
      const minDelay = new Promise((r) => setTimeout(r, 1000));
      await Promise.all([fetchData(), minDelay]);
      render();
      return;
    }

    // Number keys for quick nav (highlight + select)
    const num = parseInt(str || "", 10);
    if (num >= 1 && num <= MENU_ITEMS.length) {
      state.selectedMenu = num - 1;
      state.view = MENU_ITEMS[state.selectedMenu].key as ViewKey;
      if (state.view === "holders" && state.holders.length === 0) {
        await fetchData();
      }
      render();
      return;
    }
  });

  // ── Initial Fetch ──

  await fetchData(true); // initial load with spinner
  clearInterval(spinInterval);
  render();

  // Auto-refresh every 15 seconds
  setInterval(async () => {
    await fetchData();
    render();
  }, 15000);
}

main().catch((err) => {
  process.stdout.write(SHOW_CURSOR + RESET);
  console.error(err);
  process.exit(1);
});
