import chalk from "chalk";

export function success(msg: string): void {
  console.log(chalk.green("✓ ") + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("✗ ") + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue("ℹ ") + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("⚠ ") + msg);
}

export function table(data: Record<string, string | number | boolean | bigint>): void {
  const maxKeyLen = Math.max(...Object.keys(data).map((k) => k.length));
  for (const [key, value] of Object.entries(data)) {
    const paddedKey = key.padEnd(maxKeyLen);
    console.log(`  ${chalk.gray(paddedKey)}  ${value}`);
  }
}

export function header(title: string): void {
  console.log();
  console.log(chalk.bold.underline(title));
  console.log();
}
