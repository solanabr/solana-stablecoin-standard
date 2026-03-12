import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { StablecoinClient } from "../../client";
import { PRESET_MINIMAL } from "../../constants";
import {
  getProvider,
  formatOutput,
  logError,
  parsePublicKey,
} from "../utils";

/**
 * Register the `status` and `supply` commands onto the given commander program.
 *
 * Usage:
 *   sss-token status --mint <pubkey>   Show stablecoin status overview
 *   sss-token supply --mint <pubkey>   Show current supply info
 */
export function registerStatusCommands(program: Command): void {
  // ----- status -----
  program
    .command("status")
    .description("Show stablecoin status: preset, pause state, supply, and roles")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const cfg = await client.getConfig(mintPubkey);

        // Fetch on-chain mint supply
        let onChainSupply = "N/A";
        try {
          const mintInfo = await connection.getTokenSupply(mintPubkey);
          onChainSupply = mintInfo.value.amount;
        } catch {
          // Fall back to computed supply if RPC call fails
          onChainSupply = cfg.totalMinted.sub(cfg.totalBurned).toString();
        }

        const presetLabel = cfg.preset === PRESET_MINIMAL
          ? "SSS-1 (Minimal)"
          : "SSS-2 (Compliant)";

        const output = {
          mint: mintPubkey.toBase58(),
          preset: presetLabel,
          paused: cfg.paused ? "PAUSED" : "ACTIVE",
          totalMinted: cfg.totalMinted.toString(),
          totalBurned: cfg.totalBurned.toString(),
          totalSeized: cfg.totalSeized.toString(),
          onChainSupply,
          authority: cfg.authority.toBase58(),
          masterMinter: cfg.masterMinter.toBase58(),
          pauser: cfg.pauser.toBase58(),
          blacklister: cfg.blacklister.toBase58(),
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to fetch status: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- supply -----
  program
    .command("supply")
    .description("Show current supply info for a stablecoin mint")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const cfg = await client.getConfig(mintPubkey);

        // Fetch on-chain supply for the mint
        let onChainSupply = "N/A";
        let decimals = 0;
        try {
          const mintInfo = await connection.getTokenSupply(mintPubkey);
          onChainSupply = mintInfo.value.amount;
          decimals = mintInfo.value.decimals;
        } catch {
          onChainSupply = cfg.totalMinted.sub(cfg.totalBurned).toString();
        }

        const output = {
          mint: mintPubkey.toBase58(),
          onChainSupply,
          decimals,
          totalMinted: cfg.totalMinted.toString(),
          totalBurned: cfg.totalBurned.toString(),
          totalSeized: cfg.totalSeized.toString(),
          netMinted: cfg.totalMinted.sub(cfg.totalBurned).toString(),
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to fetch supply: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
