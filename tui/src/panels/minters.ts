import blessed from "blessed";
import { BN } from "@coral-xyz/anchor";
import { DashboardData, MinterStateData } from "../lib/fetcher";
import { truncateAddress, formatAmount, percentUsed } from "../lib/format";

export function createMintersPanel(parent: blessed.Widgets.Node, topOffset: number): blessed.Widgets.BoxElement {
  const box = blessed.box({
    parent,
    top: topOffset,
    left: 0,
    width: "100%",
    height: 10,
    tags: true,
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "magenta",
      },
      bg: "black",
    },
    label: " {bold}{magenta-fg}Active Minters{/magenta-fg}{/bold} ",
    content: " Loading...",
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
  });

  return box;
}

export function updateMintersPanel(
  box: blessed.Widgets.BoxElement,
  data: DashboardData
): void {
  if (!data.config) {
    box.setContent(" {yellow-fg}No data{/yellow-fg}");
    return;
  }

  const minters = data.minters;
  if (minters.length === 0) {
    box.setContent("\n  {yellow-fg}No minters configured{/yellow-fg}");
    return;
  }

  const decimals = data.decimals;

  // Table header
  const colWallet = 12;
  const colQuota = 16;
  const colMinted = 16;
  const colRemain = 16;
  const colPct = 7;
  const colStatus = 8;

  const header =
    " " +
    "Wallet".padEnd(colWallet) +
    "Quota".padStart(colQuota) +
    "Minted".padStart(colMinted) +
    "Remaining".padStart(colRemain) +
    "Used%".padStart(colPct) +
    "Status".padStart(colStatus);

  const separator =
    " " + "─".repeat(colWallet + colQuota + colMinted + colRemain + colPct + colStatus);

  const lines = [
    `{bold}${header}{/bold}`,
    separator,
  ];

  for (const minter of minters) {
    const wallet = truncateAddress(minter.minter);
    const quota = formatAmount(minter.quota, decimals);
    const minted = formatAmount(minter.mintedAmount, decimals);
    const remaining = formatAmount(
      new BN(minter.quota.toString()).sub(new BN(minter.mintedAmount.toString())),
      decimals
    );
    const pct = percentUsed(
      new BN(minter.mintedAmount.toString()),
      new BN(minter.quota.toString())
    );

    const statusIcon = minter.enabled
      ? "{green-fg}\u25CF ON{/green-fg}"
      : "{red-fg}\u25CB OFF{/red-fg}";

    const pctColor = pct >= 90 ? "red" : pct >= 70 ? "yellow" : "green";
    const pctStr = `{${pctColor}-fg}${(pct.toFixed(0) + "%").padStart(5)}{/${pctColor}-fg}`;

    const line =
      " " +
      wallet.padEnd(colWallet) +
      quota.padStart(colQuota) +
      minted.padStart(colMinted) +
      remaining.padStart(colRemain) +
      `${pctStr}  ` +
      statusIcon;

    lines.push(line);
  }

  // Summary
  lines.push(separator);
  const enabledCount = minters.filter((m) => m.enabled).length;
  const totalCount = minters.length;
  lines.push(
    ` {cyan-fg}Total: ${totalCount} minter(s), ${enabledCount} active{/cyan-fg}`
  );

  box.setContent(lines.join("\n"));
}
