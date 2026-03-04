import chalk from "chalk";

export function success(msg: string): void {
  console.log(chalk.green("  ✓ ") + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue("  ℹ ") + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow("  ⚠ ") + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("  ✗ ") + msg);
}

export function header(title: string): void {
  console.log();
  console.log(chalk.bold.white(`  ${title}`));
  console.log(chalk.dim("  " + "─".repeat(title.length + 2)));
}

export function field(label: string, value: string | number | boolean): void {
  console.log(`  ${chalk.dim(label.padEnd(18))} ${value}`);
}

export function txLink(signature: string, cluster: string = "devnet"): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}
