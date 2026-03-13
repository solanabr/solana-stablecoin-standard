import { Command } from "commander";
import chalk from "chalk";
import { registerCreateCommand } from "./commands/create";
import { registerMintCommand } from "./commands/mint";
import { registerBurnCommand } from "./commands/burn";
import { registerConfigCommand } from "./commands/config";
// Новые импорты
import { registerBlacklistCommand } from "./commands/blacklist";
import { registerSeizeCommand } from "./commands/seize";
import { registerTuiCommand } from "./commands/tui";

const program = new Command();

program
  .name("sss-token")
  .description(chalk.blue("Solana Stablecoin Standard (SSS) CLI Operator Tool"))
  .version("1.0.0");

// Регистрируем все команды
registerCreateCommand(program);
registerMintCommand(program);
registerBurnCommand(program);
registerConfigCommand(program);
registerBlacklistCommand(program);
registerSeizeCommand(program);
registerTuiCommand(program);

program.parse(process.argv);