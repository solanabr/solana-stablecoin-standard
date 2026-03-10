#!/usr/bin/env node
import { Command } from "commander";
import { launchDashboard } from "./dashboard";

const DEVNET_RPC = "https://api.devnet.solana.com";

const program = new Command();

program
  .name("sss-tui")
  .description("Admin TUI dashboard for Solana Stablecoin Standard")
  .version("0.1.0")
  .requiredOption("--mint <address>", "Stablecoin mint address (required)")
  .option("--rpc <url>", "Solana RPC endpoint", DEVNET_RPC)
  .option("--interval <seconds>", "Auto-refresh interval in seconds", "10")
  .option("--keypair <path>", "Path to keypair file (optional, for future signing)")
  .action((opts) => {
    const mintAddress = opts.mint;
    const rpcUrl = opts.rpc;
    const refreshInterval = parseInt(opts.interval, 10) || 10;

    // Validate mint address format
    try {
      const { PublicKey } = require("@solana/web3.js");
      new PublicKey(mintAddress);
    } catch {
      console.error(`Error: Invalid mint address "${mintAddress}"`);
      process.exit(1);
    }

    launchDashboard({
      rpcUrl,
      mintAddress,
      refreshInterval,
    });
  });

program.parse();
