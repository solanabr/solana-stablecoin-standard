import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { StablecoinClient } from "../../client";
import { StablecoinConfig, MinterState } from "../../types";
import {
  getProvider,
  formatOutput,
  logError,
  parsePublicKey,
} from "../utils";

/** Flatten a StablecoinConfig into a plain string-keyed record for display. */
function flattenConfig(cfg: StablecoinConfig): Record<string, string> {
  return {
    mint: cfg.mint.toBase58(),
    preset: cfg.preset === 1 ? "1 (SSS-1 Minimal)" : "2 (SSS-2 Compliant)",
    authority: cfg.authority.toBase58(),
    pendingAuthority: cfg.pendingAuthority.toBase58(),
    masterMinter: cfg.masterMinter.toBase58(),
    pauser: cfg.pauser.toBase58(),
    blacklister: cfg.blacklister.toBase58(),
    paused: cfg.paused ? "true" : "false",
    totalMinted: cfg.totalMinted.toString(),
    totalBurned: cfg.totalBurned.toString(),
    bump: String(cfg.bump),
    mintAuthorityBump: String(cfg.mintAuthorityBump),
  };
}

/** Flatten a MinterState into a plain string-keyed record for display. */
function flattenMinterState(state: MinterState): Record<string, string> {
  return {
    config: state.config.toBase58(),
    minter: state.minter.toBase58(),
    quota: state.quota.toString(),
    mintedAmount: state.mintedAmount.toString(),
    remaining: state.quota.sub(state.mintedAmount).toString(),
    enabled: state.enabled ? "true" : "false",
    bump: String(state.bump),
  };
}

/**
 * Register the `info` command and its sub-command `minter` onto the given
 * commander program.
 *
 * Usage:
 *   sss-token info          --mint <pubkey>                          Show full stablecoin config
 *   sss-token info minter   --mint <pubkey> --minter <pubkey>        Show minter state
 */
export function registerInfoCommands(program: Command): void {
  const info = program
    .command("info")
    .description("Fetch and display on-chain account data")
    .option("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      // If a sub-command was invoked, do nothing at this level
      if (cmd.args.length > 0) return;

      const globalOpts = cmd.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";

      if (!opts.mint) {
        logError("--mint <pubkey> is required for `info`");
        process.exit(1);
      }

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
        const flat = flattenConfig(cfg);

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(flat, null, 2) + "\n");
        } else {
          process.stdout.write(formatOutput(flat, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to fetch stablecoin info: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- info minter -----
  info
    .command("minter")
    .description("Show the minter state for a specific minter wallet")
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption("--minter <pubkey>", "Minter wallet address")
    .action(async (opts, cmd) => {
      // Walk: minter -> info -> program
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";

      let mintPubkey: PublicKey;
      let minterPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        minterPubkey = parsePublicKey(opts.minter, "--minter");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const state = await client.getMinterState(mintPubkey, minterPubkey);
        const flat = flattenMinterState(state);

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(flat, null, 2) + "\n");
        } else {
          process.stdout.write(formatOutput(flat, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to fetch minter info: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
