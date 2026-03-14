import blessed from "blessed";
import contrib from "blessed-contrib";
import { DashboardStats, LogLink, OperationItem, UiLogLevel } from "./types";

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

interface LogRow {
  text: string;
  link?: LogLink;
}

export class DashboardUi {
  readonly screen: blessed.Widgets.Screen;
  private readonly grid: contrib.Widgets.GridElement;
  private readonly header: blessed.Widgets.BoxElement;
  private readonly footer: blessed.Widgets.BoxElement;
  private readonly supplyBox: blessed.Widgets.BoxElement;
  private readonly mintedBox: blessed.Widgets.BoxElement;
  private readonly burnedBox: blessed.Widgets.BoxElement;
  private readonly statusBox: blessed.Widgets.BoxElement;
  private readonly activityBox: blessed.Widgets.BoxElement;
  private readonly logList: blessed.Widgets.ListElement;
  private readonly table: contrib.Widgets.TableElement;
  private readonly menu: blessed.Widgets.ListElement;

  private readonly maxLogChars = 180;
  private readonly maxLogRows = 200;
  private readonly mintDeltas: bigint[] = [];
  private readonly burnDeltas: bigint[] = [];

  private previousMinted: bigint | null = null;
  private previousBurned: bigint | null = null;
  private operations: OperationItem[] = [];
  private logRows: LogRow[] = [];

  constructor(cluster: string, mint: string | null, walletShort: string) {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "SSS Admin TUI",
      fullUnicode: true,
    });

    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    this.header = this.grid.set(0, 0, 1, 12, blessed.box, {
      tags: true,
      wrap: false,
      border: { type: "line" },
      style: {
        fg: "white",
        bg: "#0b1220",
        border: { fg: "#334155" },
      },
      content:
        `{bold}{#7c3aed-fg}SSS Admin TUI{/}  {#64748b-fg}│{/} ` +
        `{#10b981-fg}●{/} ${cluster}  {#64748b-fg}│{/} ` +
        `mint {#f59e0b-fg}${mint ? mint.slice(0, 8) + "…" : "none"}{/}  {#64748b-fg}│{/} ` +
        `wallet {#60a5fa-fg}${walletShort}{/}`,
    });

    this.supplyBox = this.card(1, 0, "Total Supply", "#60a5fa");
    this.mintedBox = this.card(1, 3, "Total Minted", "#10b981");
    this.burnedBox = this.card(1, 6, "Total Burned", "#ef4444");
    this.statusBox = this.card(1, 9, "Protocol", "#f59e0b");

    this.activityBox = this.grid.set(3, 0, 4, 8, blessed.box, {
      label: " Activity ",
      tags: true,
      wrap: true,
      border: { type: "line" },
      style: {
        bg: "#0b1020",
        fg: "#dbeafe",
        border: { fg: "#334155" },
      },
      content: "{#94a3b8-fg}Waiting for first refresh...{/}",
    });

    this.menu = this.grid.set(3, 8, 4, 4, blessed.list, {
      label: " Operations ",
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      border: { type: "line" },
      style: {
        bg: "#0f172a",
        fg: "#e2e8f0",
        border: { fg: "#334155" },
        selected: { bg: "#0f172a", fg: "#e2e8f0", bold: false },
        item: { fg: "#e2e8f0" },
        focus: { border: { fg: "#334155" } },
      },
      items: [],
    });

    this.logList = this.grid.set(7, 0, 4, 8, blessed.list, {
      label: " Event Stream (Enter/o opens explorer) ",
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      border: { type: "line" },
      wrap: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: { ch: " ", inverse: true },
      style: {
        fg: "#e2e8f0",
        bg: "#020617",
        border: { fg: "#334155" },
        selected: { bg: "#020617", fg: "#e2e8f0", bold: false },
        item: { fg: "#e2e8f0" },
        focus: { border: { fg: "#334155" } },
      },
      items: [],
    });

    this.table = this.grid.set(7, 8, 4, 4, contrib.table, {
      label: " Top Holders ",
      border: { type: "line" },
      keys: true,
      vi: true,
      mouse: true,
      interactive: true,
      style: {
        border: { fg: "#334155" },
        header: { fg: "#93c5fd", bold: true },
        fg: "#e2e8f0",
      },
      columnSpacing: 2,
      columnWidth: [13, 12],
    });

    this.table.setData({ headers: ["Address", "Balance"], data: [["—", "—"]] });

    this.footer = this.grid.set(11, 0, 1, 12, blessed.box, {
      tags: true,
      wrap: false,
      border: { type: "line" },
      style: {
        fg: "#cbd5e1",
        bg: "#0b1220",
        border: { fg: "#334155" },
      },
      content: "{#94a3b8-fg}Loading...{/}",
    });

    this.bindKeys();
  }

  setOperations(items: OperationItem[]): void {
    this.operations = items;
    const rendered = items.map((item, idx) => {
      const num = String(idx + 1).padStart(2, "0");
      if (item.enabled) return `{#10b981-fg}${num}.{/} ${item.label}`;
      return `{#475569-fg}${num}. ${item.label} (disabled){/}`;
    });
    this.menu.setItems(rendered);
    this.render();
  }

  onOperation(handler: (item: OperationItem) => void): void {
    this.menu.on("select", (_item, index) => {
      const op = this.operations[index];
      if (op) handler(op);
    });
  }

  onRefresh(handler: () => void): void {
    this.screen.key(["r"], handler);
  }

  onQuit(handler: () => void): void {
    this.screen.key(["q", "C-c"], handler);
  }

  onOpenLogLink(handler: (link: LogLink) => void): void {
    const openCurrent = () => {
      const selected = ((this.logList as unknown) as { selected: number }).selected;
      const row = this.logRows[selected];
      if (row?.link && (row.link.signatureUrl || row.link.addressUrl)) {
        handler(row.link);
      }
    };
    this.logList.key(["enter", "o"], openCurrent);
  }

  focusMenu(): void {
    this.menu.focus();
  }

  pushLog(message: string, level: UiLogLevel = "info", link?: LogLink): void {
    const now = new Date().toLocaleTimeString();
    const color = {
      info: "#94a3b8",
      success: "#10b981",
      warn: "#f59e0b",
      error: "#ef4444",
      event: "#60a5fa",
    }[level];

    const suffix = link?.signatureUrl || link?.addressUrl
      ? " {#64748b-fg}[open]{/}"
      : "";
    const clipped = this.clip(message, this.maxLogChars);
    const text = `{#475569-fg}[${now}]{/} {${color}-fg}${clipped}{/}${suffix}`;

    this.logRows.push({ text, link });
    if (this.logRows.length > this.maxLogRows) {
      this.logRows.shift();
    }

    this.logList.setItems(this.logRows.map((row) => row.text));
    this.logList.select(Math.max(0, this.logRows.length - 1));
    this.logList.scrollTo(this.logRows.length);
    this.render();
  }

  updateStats(stats: DashboardStats): void {
    this.supplyBox.setContent(`{center}\n{bold}${stats.supply}{/bold}\n{/center}`);
    this.mintedBox.setContent(`{center}\n{bold}${stats.totalMinted}{/bold}\n{/center}`);
    this.burnedBox.setContent(`{center}\n{bold}${stats.totalBurned}{/bold}\n{/center}`);

    const status = stats.paused ? "{#ef4444-fg}PAUSED{/}" : "{#10b981-fg}ACTIVE{/}";
    this.statusBox.setContent(
      `{center}\n${status}\n{#94a3b8-fg}${stats.preset}{/}\n{#94a3b8-fg}${stats.holders} holders{/}{/center}`,
    );

    const mintedDelta = this.previousMinted === null ? 0n : stats.totalMintedValue - this.previousMinted;
    const burnedDelta = this.previousBurned === null ? 0n : stats.totalBurnedValue - this.previousBurned;

    this.previousMinted = stats.totalMintedValue;
    this.previousBurned = stats.totalBurnedValue;

    this.pushDelta(this.mintDeltas, mintedDelta < 0n ? 0n : mintedDelta);
    this.pushDelta(this.burnDeltas, burnedDelta < 0n ? 0n : burnedDelta);

    this.activityBox.setContent(
      `{bold}This refresh{/bold}\n` +
      ` {#22c55e-fg}+Minted{/} ${this.formatBigint(mintedDelta)}    {#ef4444-fg}+Burned{/} ${this.formatBigint(burnedDelta)}\n\n` +
      `{bold}Recent mint deltas{/bold}\n` +
      ` {#22c55e-fg}${this.sparkline(this.mintDeltas)}{/}\n` +
      `{bold}Recent burn deltas{/bold}\n` +
      ` {#ef4444-fg}${this.sparkline(this.burnDeltas)}{/}\n\n` +
      `{#94a3b8-fg}Tip: r refreshes now and resets interval timer{/}`,
    );

    this.footer.setContent(
      ` {#94a3b8-fg}Wallet balance:{/} {#22c55e-fg}${stats.walletBalance}{/}` +
      `  {#64748b-fg}│{/}  {#94a3b8-fg}Block:{/} {#f59e0b-fg}${stats.blockHeight}{/}` +
      `  {#64748b-fg}│{/}  {#94a3b8-fg}Minters:{/} {#60a5fa-fg}${stats.minters}{/}`,
    );

    this.render();
  }

  updateHolders(rows: Array<[string, string]>): void {
    this.table.setData({ headers: ["Address", "Balance"], data: rows });
    this.render();
  }

  prompt(question: string): Promise<string | null> {
    return new Promise((resolve) => {
      const prompt = blessed.prompt({
        parent: this.screen,
        top: "center",
        left: "center",
        width: "55%",
        height: 8,
        border: { type: "line" },
        label: ` ${question} `,
        tags: true,
        style: {
          bg: "#111827",
          border: { fg: "#6366f1" },
          label: { fg: "#a5b4fc" },
        },
      });

      prompt.input(question, "", (_err, value) => {
        prompt.destroy();
        this.render();
        resolve(value || null);
      });
    });
  }

  render(): void {
    this.screen.render();
  }

  private bindKeys(): void {
    this.screen.key(["tab"], () => {
      if (this.screen.focused === this.menu) {
        this.logList.focus();
      } else if (this.screen.focused === this.logList) {
        this.menu.focus();
      } else {
        this.menu.focus();
      }
    });
  }

  private card(row: number, col: number, label: string, color: string): blessed.Widgets.BoxElement {
    return this.grid.set(row, col, 2, 3, blessed.box, {
      label: ` ${label} `,
      tags: true,
      border: { type: "line" },
      content: "{center}—{/center}",
      style: {
        bg: "#0f172a",
        fg: color,
        border: { fg: color },
        label: { fg: color },
        focus: { border: { fg: color } },
      },
    });
  }

  private pushDelta(series: bigint[], value: bigint): void {
    series.push(value);
    if (series.length > 16) series.shift();
  }

  private sparkline(values: bigint[]): string {
    if (values.length === 0) return "-";
    const max = values.reduce((acc, cur) => (cur > acc ? cur : acc), 0n);
    if (max === 0n) return "-";

    return values
      .map((value) => {
        const idx = Number((value * BigInt(SPARK.length - 1)) / max);
        return SPARK[Math.max(0, Math.min(SPARK.length - 1, idx))];
      })
      .join("");
  }

  private clip(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 1))}…`;
  }

  private formatBigint(value: bigint): string {
    const abs = value < 0n ? -value : value;
    if (abs >= 1_000_000_000n) return `${Number(abs / 1_000_000n) / 1000}B`;
    if (abs >= 1_000_000n) return `${Number(abs / 1_000n) / 1000}M`;
    if (abs >= 1_000n) return `${Number(abs) / 1000}K`;
    return value.toString();
  }
}
