#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./cli/commands/init";
import { mintCommand } from "./cli/commands/mint";
import { burnCommand } from "./cli/commands/burn";
import { freezeCommand } from "./cli/commands/freeze";
import { pauseCommand } from "./cli/commands/pause";
import { blacklistCommand } from "./cli/commands/blacklist";
import { seizeCommand } from "./cli/commands/seize";
import { statusCommand } from "./cli/commands/status";
import { mintersCommand } from "./cli/commands/minters";
import { rolesCommand } from "./cli/commands/roles";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard — Admin CLI")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(mintCommand);
program.addCommand(burnCommand);
program.addCommand(freezeCommand);
program.addCommand(pauseCommand);
program.addCommand(blacklistCommand);
program.addCommand(seizeCommand);
program.addCommand(statusCommand);
program.addCommand(mintersCommand);
program.addCommand(rolesCommand);

program.parse();
