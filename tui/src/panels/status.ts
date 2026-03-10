import blessed from "blessed";
import { formatTimestamp, networkName } from "../lib/format";

export function createStatusPanel(parent: blessed.Widgets.Node): blessed.Widgets.BoxElement {
  const box = blessed.box({
    parent,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    border: {
      type: "line",
    },
    style: {
      border: {
        fg: "blue",
      },
      bg: "black",
    },
    content: " Initializing...",
  });

  return box;
}

export function updateStatusPanel(
  box: blessed.Widgets.BoxElement,
  rpcUrl: string,
  lastRefresh: Date | null,
  refreshInterval: number,
  error: string | null
): void {
  const network = networkName(rpcUrl);
  const keybinds = "{bold}[q]{/bold} Quit  {bold}[r]{/bold} Refresh  {bold}[Tab]{/bold} Focus";
  const refreshStr = lastRefresh
    ? `{green-fg}${formatTimestamp(lastRefresh)}{/green-fg}`
    : "{yellow-fg}pending{/yellow-fg}";

  const errorStr = error
    ? `  {red-fg}\u26A0 ${error.length > 40 ? error.slice(0, 40) + "..." : error}{/red-fg}`
    : "";

  box.setContent(
    ` ${keybinds}    {bold}Last:{/bold} ${refreshStr}    {bold}RPC:{/bold} {magenta-fg}${network}{/magenta-fg}    {bold}Interval:{/bold} ${refreshInterval}s${errorStr}`
  );
}
