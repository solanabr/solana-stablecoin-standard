export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}
