export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "status", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value.startsWith("--")) {
      const next = rest[index + 1];
      if (!next || next.startsWith("--")) {
        flags[value] = true;
      } else {
        flags[value] = next;
        index += 1;
      }
      continue;
    }

    positionals.push(value);
  }

  return { command, positionals, flags };
}

export function flagValue(parsed: ParsedArgs, flag: string): string | undefined {
  const value = parsed.flags[flag];
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(parsed: ParsedArgs, flag: string): boolean {
  return Boolean(parsed.flags[flag]);
}
