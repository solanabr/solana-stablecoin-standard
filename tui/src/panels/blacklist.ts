import blessed from "blessed";
import { DashboardData } from "../lib/fetcher";
import { truncateAddress } from "../lib/format";

export function createBlacklistPanel(parent: blessed.Widgets.Node, left: number | string, width: number | string): blessed.Widgets.BoxElement {
  const box = blessed.box({
    parent,
    top: 5,
    left,
    width,
    height: 10,
    tags: true,
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "red",
      },
      bg: "black",
    },
    label: " {bold}{red-fg}Blacklist{/red-fg}{/bold} ",
    content: " Loading...",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
  });

  return box;
}

export function updateBlacklistPanel(
  box: blessed.Widgets.BoxElement,
  data: DashboardData
): void {
  if (!data.config || data.config.preset !== 2) {
    box.setContent("\n  {yellow-fg}N/A (SSS-1){/yellow-fg}");
    return;
  }

  const entries = data.blacklistEntries;

  if (entries.length === 0) {
    box.setContent("\n  {green-fg}No blacklisted wallets{/green-fg}");
    return;
  }

  const lines = [
    "{bold} Wallet       Reason{/bold}",
    " " + "─".repeat(30),
  ];

  for (const entry of entries) {
    const wallet = truncateAddress(entry.wallet);
    const reason = entry.reason.length > 16 ? entry.reason.slice(0, 16) + "..." : entry.reason;
    lines.push(` {red-fg}${wallet.padEnd(13)}{/red-fg}${reason}`);
  }

  lines.push(" " + "─".repeat(30));
  lines.push(` {red-fg}Total: ${entries.length} blacklisted{/red-fg}`);

  box.setContent(lines.join("\n"));
}
