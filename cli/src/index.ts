#!/usr/bin/env node

import { Command } from "commander";
import {
  registerInitCommand,
  registerMintCommand,
  registerBurnCommand,
  registerFreezeCommand,
  registerThawCommand,
  registerPauseCommand,
  registerUnpauseCommand,
  registerStatusCommand,
  registerSupplyCommand,
} from "./commands";

const program = new Command();

program
  .name("sss-token")
  .description("Solana Stablecoin Standard — Token Management CLI")
  .version("0.1.0");

// Register all commands
registerInitCommand(program);
registerMintCommand(program);
registerBurnCommand(program);
registerFreezeCommand(program);
registerThawCommand(program);
registerPauseCommand(program);
registerUnpauseCommand(program);
registerStatusCommand(program);
registerSupplyCommand(program);

program.parse(process.argv);
