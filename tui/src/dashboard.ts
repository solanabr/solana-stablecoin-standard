import blessed from "blessed";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchDashboardData, DashboardData } from "./lib/fetcher";
import { createHeaderPanel, updateHeaderPanel } from "./panels/header";
import { createSupplyPanel, updateSupplyPanel } from "./panels/supply";
import { createRolesPanel, updateRolesPanel } from "./panels/roles";
import { createMintersPanel, updateMintersPanel } from "./panels/minters";
import { createBlacklistPanel, updateBlacklistPanel } from "./panels/blacklist";
import { createStatusPanel, updateStatusPanel } from "./panels/status";

export interface DashboardOptions {
  rpcUrl: string;
  mintAddress: string;
  refreshInterval: number; // seconds
}

export function launchDashboard(options: DashboardOptions): void {
  const { rpcUrl, mintAddress, refreshInterval } = options;

  // Create blessed screen
  const screen = blessed.screen({
    smartCSR: true,
    title: "SSS Admin Dashboard",
    fullUnicode: true,
    tags: true,
  });

  // Connection
  const connection = new Connection(rpcUrl, "confirmed");
  const mint = new PublicKey(mintAddress);

  // Track state
  let lastRefresh: Date | null = null;
  let lastError: string | null = null;
  let isRefreshing = false;
  let currentData: DashboardData | null = null;
  let isSSS2 = false;

  // ──────────────────────────────────────────────
  // Create panels
  // ──────────────────────────────────────────────
  const headerBox = createHeaderPanel(screen);
  const statusBox = createStatusPanel(screen);

  // Supply and roles panels (will reposition after first fetch)
  let supplyBox = createSupplyPanel(screen, 0, "50%");
  let rolesBox = createRolesPanel(screen, "50%", "50%");
  let blacklistBox: blessed.Widgets.BoxElement | null = null;
  let mintersBox = createMintersPanel(screen, 15);

  // Focusable panels for Tab navigation
  let focusable: blessed.Widgets.BoxElement[] = [mintersBox];
  let focusIndex = 0;

  // Loading overlay
  const loadingBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 40,
    height: 5,
    tags: true,
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "cyan",
      },
      bg: "black",
    },
    content: "{center}\n{bold}{cyan-fg}\u23F3 Fetching on-chain data...{/cyan-fg}{/bold}{/center}",
  });

  screen.render();

  // ──────────────────────────────────────────────
  // Layout functions
  // ──────────────────────────────────────────────

  function rebuildLayout(): void {
    // Remove old panels from screen
    supplyBox.detach();
    rolesBox.detach();
    if (blacklistBox) {
      blacklistBox.detach();
      blacklistBox = null;
    }
    mintersBox.detach();

    if (isSSS2) {
      // SSS-2: 3-column middle row
      supplyBox = createSupplyPanel(screen, 0, "34%");
      rolesBox = createRolesPanel(screen, "34%", "33%");
      blacklistBox = createBlacklistPanel(screen, "67%", "33%");
      mintersBox = createMintersPanel(screen, 15);
      focusable = [mintersBox, blacklistBox];
    } else {
      // SSS-1: 2-column middle row
      supplyBox = createSupplyPanel(screen, 0, "50%");
      rolesBox = createRolesPanel(screen, "50%", "50%");
      mintersBox = createMintersPanel(screen, 15);
      focusable = [mintersBox];
    }
    focusIndex = 0;
  }

  // ──────────────────────────────────────────────
  // Update all panels
  // ──────────────────────────────────────────────

  function updateAllPanels(data: DashboardData): void {
    // Detect preset change
    const newIsSSS2 = data.config?.preset === 2;
    if (newIsSSS2 !== isSSS2) {
      isSSS2 = newIsSSS2 ?? false;
      rebuildLayout();
    }

    updateHeaderPanel(headerBox, data, rpcUrl, mintAddress);
    updateSupplyPanel(supplyBox, data);
    updateRolesPanel(rolesBox, data);
    updateMintersPanel(mintersBox, data);

    if (blacklistBox && isSSS2) {
      updateBlacklistPanel(blacklistBox, data);
    }

    updateStatusPanel(statusBox, rpcUrl, lastRefresh, refreshInterval, lastError);

    // Hide loading overlay
    loadingBox.detach();

    screen.render();
  }

  // ──────────────────────────────────────────────
  // Refresh data
  // ──────────────────────────────────────────────

  async function refresh(): Promise<void> {
    if (isRefreshing) return;
    isRefreshing = true;

    try {
      const data = await fetchDashboardData(connection, mint);
      currentData = data;
      lastRefresh = new Date();
      lastError = data.error;
      updateAllPanels(data);
    } catch (err: any) {
      lastError = err.message || String(err);
      updateStatusPanel(statusBox, rpcUrl, lastRefresh, refreshInterval, lastError);
      // Hide loading on error too
      loadingBox.detach();
      screen.render();
    } finally {
      isRefreshing = false;
    }
  }

  // ──────────────────────────────────────────────
  // Keyboard bindings
  // ──────────────────────────────────────────────

  screen.key(["q", "C-c"], () => {
    clearInterval(timer);
    screen.destroy();
    process.exit(0);
  });

  screen.key(["r"], () => {
    if (!isRefreshing) {
      // Show a brief refreshing indicator
      lastError = null;
      updateStatusPanel(statusBox, rpcUrl, lastRefresh, refreshInterval, "Refreshing...");
      screen.render();
      refresh();
    }
  });

  screen.key(["tab"], () => {
    if (focusable.length === 0) return;
    focusIndex = (focusIndex + 1) % focusable.length;
    focusable[focusIndex].focus();
    screen.render();
  });

  screen.key(["S-tab"], () => {
    if (focusable.length === 0) return;
    focusIndex = (focusIndex - 1 + focusable.length) % focusable.length;
    focusable[focusIndex].focus();
    screen.render();
  });

  // ──────────────────────────────────────────────
  // Handle resize
  // ──────────────────────────────────────────────

  screen.on("resize", () => {
    if (currentData) {
      updateAllPanels(currentData);
    }
    screen.render();
  });

  // ──────────────────────────────────────────────
  // Auto-refresh timer
  // ──────────────────────────────────────────────

  const timer = setInterval(refresh, refreshInterval * 1000);

  // Initial fetch
  refresh();
}
