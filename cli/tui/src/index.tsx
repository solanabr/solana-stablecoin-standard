#!/usr/bin/env node
/**
 * SSS TUI — Interactive terminal admin for Solana Stablecoin Standard
 *
 * Usage: sss-tui [--mint <address>] [--cluster devnet|mainnet-beta|localnet]
 *
 * Controls:
 *   ↑/↓     Navigate menu
 *   Enter   Select
 *   q / Esc Go back / Quit
 *   r       Refresh data
 */
import React from "react";
import { render } from "ink";
import { App } from "./App";

const args = process.argv.slice(2);
let mintArg: string | undefined;
let cluster = "devnet";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--mint" && args[i + 1]) mintArg = args[++i];
  if (args[i] === "--cluster" && args[i + 1]) cluster = args[++i];
}

render(<App initialMint={mintArg} cluster={cluster} />);
