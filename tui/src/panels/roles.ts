import blessed from "blessed";
import { DashboardData } from "../lib/fetcher";
import { truncateAddress } from "../lib/format";
import { PublicKey } from "@solana/web3.js";

export function createRolesPanel(parent: blessed.Widgets.Node, left: number | string, width: number | string): blessed.Widgets.BoxElement {
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
        fg: "yellow",
      },
      bg: "black",
    },
    label: " {bold}{yellow-fg}Role Assignments{/yellow-fg}{/bold} ",
    content: " Loading...",
    scrollable: true,
  });

  return box;
}

function isDefaultKey(key: PublicKey): boolean {
  return key.equals(PublicKey.default);
}

export function updateRolesPanel(
  box: blessed.Widgets.BoxElement,
  data: DashboardData
): void {
  if (!data.config) {
    box.setContent(" {yellow-fg}No data{/yellow-fg}");
    return;
  }

  const config = data.config;

  const roles: [string, PublicKey][] = [
    ["Authority", config.authority],
    ["MasterMinter", config.masterMinter],
    ["Pauser", config.pauser],
  ];

  if (config.preset === 2) {
    roles.push(["Blacklister", config.blacklister]);
  }

  // Check for pending authority transfer
  if (!isDefaultKey(config.pendingAuthority)) {
    roles.push(["PendingAuth", config.pendingAuthority]);
  }

  const labelWidth = 13;
  const lines = [""];

  for (const [role, address] of roles) {
    const addrStr = truncateAddress(address);
    const roleLabel = role.padEnd(labelWidth);
    const color = role === "Authority" ? "cyan" : role === "PendingAuth" ? "yellow" : "white";
    lines.push(`  {bold}${roleLabel}{/bold} {${color}-fg}${addrStr}{/${color}-fg}`);
  }

  // Horizontal rule using box characters
  const inner = Math.max(20, (box.width as number) - 4);
  lines.unshift(`  ${"─".repeat(inner)}`);
  lines.push(`  ${"─".repeat(inner)}`);

  box.setContent(lines.join("\n"));
}
