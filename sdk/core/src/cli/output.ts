import type { CliContext } from "./context";

export function renderKeyValueLines(entries: Array<[string, string | number | boolean]>): string {
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join("\n");
}

export function writeJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function writeText(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

export function writeStructuredOutput(
  context: CliContext,
  payload: unknown,
  text: string
): void {
  if (context.output === "json") {
    writeJson(payload);
    return;
  }

  writeText(text);
}

export function maskValue(value: string): string {
  if (value.length <= 8) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

