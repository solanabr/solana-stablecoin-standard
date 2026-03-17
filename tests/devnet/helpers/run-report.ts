/**
 * Records program IDs and transaction signatures during a devnet test run,
 * then writes tests/devnet/run-report.md for inspection and re-testing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";
const EXPLORER = "https://explorer.solana.com";
const REPORT_PATH = resolve(__dirname, "../run-report.md");

interface RecordedTx {
  label: string;
  signature: string;
}

const txs: RecordedTx[] = [];

export function recordTx(label: string, signature: string): void {
  txs.push({ label, signature });
}

function explorerTxUrl(signature: string): string {
  const cluster = CLUSTER === "devnet" ? "?cluster=devnet" : "";
  return `${EXPLORER}/tx/${signature}${cluster}`;
}

function loadProgramIds(): { stablecoinProgramId?: string; transferHookProgramId?: string } | null {
  const path = resolve(__dirname, "../fixtures/program-ids.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as {
      stablecoinProgramId?: string;
      transferHookProgramId?: string;
    };
  } catch {
    return null;
  }
}

export function writeReport(): void {
  const ids = loadProgramIds();
  const now = new Date().toISOString();

  const lines: string[] = [
    "# Devnet run report",
    "",
    `**Generated:** ${now}`,
    `**Cluster:** ${CLUSTER}`,
    "",
    "## Program IDs",
    "",
    "Use these when re-running or debugging (e.g. `SSS_STABLECOIN_PROGRAM_ID`, API, SDK).",
    "",
    "| Program | Address | Explorer |",
    "|---------|---------|----------|",
  ];

  if (ids?.stablecoinProgramId) {
    const url = `${EXPLORER}/address/${ids.stablecoinProgramId}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
    lines.push(`| Stablecoin | \`${ids.stablecoinProgramId}\` | [View](${url}) |`);
  } else {
    lines.push("| Stablecoin | *(not set)* | |");
  }

  if (ids?.transferHookProgramId) {
    const url = `${EXPLORER}/address/${ids.transferHookProgramId}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
    lines.push(`| Transfer hook | \`${ids.transferHookProgramId}\` | [View](${url}) |`);
  } else {
    lines.push("| Transfer hook | *(not set)* | |");
  }

  lines.push("", "## Transaction signatures", "");
  lines.push("| # | Label | Signature | Explorer |");
  lines.push("|---|-------|------------|----------|");

  txs.forEach(({ label, signature }, i) => {
    const url = explorerTxUrl(signature);
    lines.push(`| ${i + 1} | ${label} | \`${signature}\` | [Tx](${url}) |`);
  });

  if (txs.length === 0) {
    lines.push("| *(none recorded)* | | | |");
  }

  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  // eslint-disable-next-line no-console
  console.log(`Run report written to ${REPORT_PATH}`);
}
