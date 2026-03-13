import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { ROLE_FLAGS } from "../../types";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info, table, header } from "../output";

export const mintersCommand = new Command("minters")
  .description("Manage minters");

mintersCommand
  .command("add <address>")
  .description("Add a new minter")
  .option("--quota <amount>", "Minting quota (0 = unlimited)", "0")
  .option("--keypair <path>", "Path to authority keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const authority = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        authority,
        programId
      );

      const minterKey = new PublicKey(address);

      info(`Adding minter ${address} with quota ${opts.quota}...`);

      // Grant MINTER role
      await stable.updateRoles(minterKey, ROLE_FLAGS.MINTER, true, authority);

      // Create minter config with quota
      await stable.updateMinter(minterKey, BigInt(opts.quota), true, authority);

      success(`Minter added: ${address}`);
      table({
        "Quota": opts.quota === "0" ? "Unlimited" : opts.quota,
        "Active": true,
      });
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });

mintersCommand
  .command("remove <address>")
  .description("Deactivate a minter")
  .option("--keypair <path>", "Path to authority keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured.");
        process.exit(1);
      }

      const connection = getConnection({ ...config, rpcUrl: opts.rpc || config.rpcUrl });
      const authority = loadKeypair(opts.keypair || config.keypairPath);
      const programId = getProgramId(config);

      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(config.mint),
        authority,
        programId
      );

      const minterKey = new PublicKey(address);

      info(`Removing minter ${address}...`);

      await stable.updateMinter(minterKey, BigInt(0), false, authority);
      await stable.updateRoles(minterKey, ROLE_FLAGS.MINTER, false, authority);

      success(`Minter deactivated: ${address}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });

mintersCommand
  .command("info <address>")
  .description("Get minter info")
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

      const minter = await stable.getMinter(new PublicKey(address));
      if (!minter) {
        info("Minter not found");
        return;
      }

      header("Minter Info");
      table({
        "Address": minter.address.toBase58(),
        "Quota": minter.quota === BigInt(0) ? "Unlimited" : minter.quota.toString(),
        "Minted": minter.minted.toString(),
        "Active": minter.active,
      });
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
