import chalk from "chalk";
import ora from "ora";

export function exitWithError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exit(1);
}

export function failSpinner(spinner: ora.Ora, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  spinner.fail(chalk.red(message));
  process.exit(1);
}
