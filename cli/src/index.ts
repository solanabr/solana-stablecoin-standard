import { Command } from "commander";
import chalk from "chalk";
import { registerCreateCommand } from "./commands/create";

const program = new Command();

program
  .name("sss-token")
  .description(chalk.blue("Solana Stablecoin Standard (SSS) CLI Operator Tool"))
  .version("1.0.0");

// Регистрируем команду init
registerCreateCommand(program);

// Парсим аргументы из консоли
program.parse(process.argv);