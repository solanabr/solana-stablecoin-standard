/**
 * Output helpers — plain text and --json mode.
 */

let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

/** Print a success message or JSON object. */
export function printSuccess(label: string, data: Record<string, unknown>): void {
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, ...data }, null, 2));
  } else {
    console.log(`✓ ${label}`);
    for (const [k, v] of Object.entries(data)) {
      console.log(`  ${k}: ${String(v)}`);
    }
  }
}

/** Print a table of rows. */
export function printTable(rows: Record<string, unknown>[]): void {
  if (jsonMode) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const row of rows) {
    const parts = Object.entries(row)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("  |  ");
    console.log(`  ${parts}`);
  }
}

/** Print an error and exit 1. */
export function printError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (jsonMode) {
    console.error(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✗ Error: ${msg}`);
  }
  process.exit(1);
}
