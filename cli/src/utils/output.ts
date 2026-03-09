/**
 * Standardizes terminal output format for CLI consumption.
 * Supports raw JSON serialization for pipeline use, or human-readable format.
 */
export function formatOutput(data: any, asJson: boolean = false): void {
  if (asJson) {
    // Print strict JSON string without any prefixing or logging decorators
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    // Human readable text/table printing
    console.log(data);
  }
}

/**
 * Prints an error safely to stderr avoiding standard output stream corruption
 * when piping JSON responses.
 */
export function printError(error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}
