import blessed from "blessed";
import { DashboardData } from "../lib/fetcher";
import { truncateAddress, presetName, networkName } from "../lib/format";

export function createHeaderPanel(parent: blessed.Widgets.Node): blessed.Widgets.BoxElement {
  const box = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: "100%",
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
    content: "{center}{bold}{cyan-fg}SSS Admin Dashboard{/cyan-fg}{/bold}{/center}\n Loading...",
  });

  return box;
}

export function updateHeaderPanel(
  box: blessed.Widgets.BoxElement,
  data: DashboardData,
  rpcUrl: string,
  mintAddress: string
): void {
  if (data.error && !data.config) {
    box.setContent(
      "{center}{bold}{cyan-fg}SSS Admin Dashboard{/cyan-fg}{/bold}{/center}\n" +
      ` {red-fg}Error: ${data.error}{/red-fg}`
    );
    return;
  }

  const config = data.config;
  if (!config) {
    box.setContent(
      "{center}{bold}{cyan-fg}SSS Admin Dashboard{/cyan-fg}{/bold}{/center}\n" +
      " {yellow-fg}No config found for this mint{/yellow-fg}"
    );
    return;
  }

  const tokenLabel = data.tokenName !== "Unknown" && data.tokenName !== "Unknown Token"
    ? `${data.tokenName} (${data.tokenSymbol})`
    : truncateAddress(mintAddress);

  const preset = presetName(config.preset);
  const network = networkName(rpcUrl);
  const pauseStatus = config.paused
    ? "{red-fg}{bold}\u25C9 PAUSED{/bold}{/red-fg}"
    : "{green-fg}{bold}\u25CF ACTIVE{/bold}{/green-fg}";

  const line1 = `{center}{bold}{cyan-fg}\u2588\u2584 SSS Admin Dashboard \u2584\u2588{/cyan-fg}{/bold}{/center}`;
  const line2 = ` {bold}Token:{/bold} ${tokenLabel}    {bold}Mint:{/bold} {cyan-fg}${truncateAddress(mintAddress)}{/cyan-fg}    {bold}Preset:{/bold} {yellow-fg}${preset}{/yellow-fg}`;
  const line3 = ` {bold}Network:{/bold} {magenta-fg}${network}{/magenta-fg}    {bold}Status:{/bold} ${pauseStatus}    {bold}Decimals:{/bold} ${data.decimals}`;

  box.setContent(`${line1}\n${line2}\n${line3}`);
}
