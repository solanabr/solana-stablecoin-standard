import blessed from "blessed";
import { BN } from "@coral-xyz/anchor";
import { DashboardData } from "../lib/fetcher";
import { formatAmount } from "../lib/format";

export function createSupplyPanel(parent: blessed.Widgets.Node, left: number | string, width: number | string): blessed.Widgets.BoxElement {
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
        fg: "green",
      },
      bg: "black",
    },
    label: " {bold}{green-fg}Supply Overview{/green-fg}{/bold} ",
    content: " Loading...",
    scrollable: true,
  });

  return box;
}

export function updateSupplyPanel(
  box: blessed.Widgets.BoxElement,
  data: DashboardData
): void {
  if (!data.config) {
    box.setContent(" {yellow-fg}No data{/yellow-fg}");
    return;
  }

  const config = data.config;
  const decimals = data.decimals;
  const totalMinted = config.totalMinted;
  const totalBurned = config.totalBurned;
  const totalSeized = config.totalSeized;

  // Net supply = minted - burned (seized tokens are transferred, not destroyed)
  const netSupply = new BN(totalMinted.toString()).sub(new BN(totalBurned.toString()));

  const mintedStr = formatAmount(totalMinted, decimals);
  const burnedStr = formatAmount(totalBurned, decimals);
  const seizedStr = formatAmount(totalSeized, decimals);
  const netStr = formatAmount(netSupply, decimals);

  // Build a visual bar for net vs minted
  const barWidth = Math.max(20, (box.width as number) - 6);
  let ratio = 0;
  if (!new BN(totalMinted.toString()).isZero()) {
    ratio = Math.min(1, netSupply.toNumber() / new BN(totalMinted.toString()).toNumber());
  }
  const filled = Math.round(ratio * barWidth);
  const barFill = "\u2588".repeat(Math.max(0, filled));
  const barEmpty = "\u2591".repeat(Math.max(0, barWidth - filled));

  const lines = [
    "",
    `  {bold}Total Minted:{/bold}  {green-fg}${mintedStr.padStart(16)}{/green-fg}`,
    `  {bold}Total Burned:{/bold}  {red-fg}${burnedStr.padStart(16)}{/red-fg}`,
  ];

  if (data.config.preset === 2) {
    lines.push(`  {bold}Total Seized:{/bold}  {yellow-fg}${seizedStr.padStart(16)}{/yellow-fg}`);
  }

  lines.push(
    `  ${"─".repeat(30)}`,
    `  {bold}Net Supply:{/bold}    {cyan-fg}{bold}${netStr.padStart(16)}{/bold}{/cyan-fg}`,
    "",
    `  {green-fg}${barFill}{/green-fg}{white-fg}${barEmpty}{/white-fg}`,
  );

  box.setContent(lines.join("\n"));
}
