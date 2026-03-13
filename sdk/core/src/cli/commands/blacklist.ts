import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info, warn } from "../output";

export const blacklistCommand = new Command("blacklist")
  .description("Manage blacklist (SSS-2 only)");

blacklistCommand
  .command("add <address>")
  .description("Add an address to the blacklist")
  .requiredOption("--reason <reason>", "Reason for blacklisting")
  .option("--keypair <path>", "Path to blacklister keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const blacklister = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        blacklister,
        programId
      );

      info(`Adding ${address} to blacklist...`);

      const sig = await stable.compliance.blacklistAdd({
        address: new PublicKey(address),
        reason: opts.reason,
        blacklister,
      });

      success(`Address blacklisted. Reason: "${opts.reason}". Signature: ${sig}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });

blacklistCommand
  .command("remove <address>")
  .description("Remove an address from the blacklist")
  .option("--keypair <path>", "Path to blacklister keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const blacklister = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        blacklister,
        programId
      );

      info(`Removing ${address} from blacklist...`);

      const sig = await stable.compliance.blacklistRemove(
        new PublicKey(address),
        blacklister
      );

      success(`Address removed from blacklist. Signature: ${sig}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });

blacklistCommand
  .command("check <address>")
  .description("Check if an address is blacklisted")
  .option("--keypair <path>", "Path to keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const keypair = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        keypair,
        programId
      );

      const blacklisted = await stable.compliance.isBlacklisted(
        new PublicKey(address)
      );

      if (blacklisted) {
        warn(`Address ${address} IS blacklisted`);
      } else {
        info(`Address ${address} is NOT blacklisted`);
      }
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
