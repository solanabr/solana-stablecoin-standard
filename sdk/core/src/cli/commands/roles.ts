import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { ROLE_FLAGS } from "../../types";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { success, error, info, table, header } from "../output";

const ROLE_NAMES: Record<string, number> = {
  minter: ROLE_FLAGS.MINTER,
  burner: ROLE_FLAGS.BURNER,
  pauser: ROLE_FLAGS.PAUSER,
  blacklister: ROLE_FLAGS.BLACKLISTER,
  seizer: ROLE_FLAGS.SEIZER,
  freezer: ROLE_FLAGS.FREEZER,
};

export const rolesCommand = new Command("roles")
  .description("Manage roles");

rolesCommand
  .command("grant <address> <role>")
  .description("Grant a role to an address")
  .option("--keypair <path>", "Path to authority keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, role: string, opts) => {
    try {
      const roleFlag = ROLE_NAMES[role.toLowerCase()];
      if (!roleFlag) {
        error(`Unknown role: ${role}. Valid roles: ${Object.keys(ROLE_NAMES).join(", ")}`);
        process.exit(1);
      }

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

      info(`Granting ${role} to ${address}...`);
      await stable.updateRoles(new PublicKey(address), roleFlag, true, authority);
      success(`Role "${role}" granted to ${address}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });

rolesCommand
  .command("revoke <address> <role>")
  .description("Revoke a role from an address")
  .option("--keypair <path>", "Path to authority keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (address: string, role: string, opts) => {
    try {
      const roleFlag = ROLE_NAMES[role.toLowerCase()];
      if (!roleFlag) {
        error(`Unknown role: ${role}. Valid roles: ${Object.keys(ROLE_NAMES).join(", ")}`);
        process.exit(1);
      }

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

      info(`Revoking ${role} from ${address}...`);
      await stable.updateRoles(new PublicKey(address), roleFlag, false, authority);
      success(`Role "${role}" revoked from ${address}`);
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });

rolesCommand
  .command("info <address>")
  .description("Show roles for an address")
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

      const roles = await stable.getRoles(new PublicKey(address));
      if (!roles) {
        info("No roles found for this address.");
        return;
      }

      header(`Roles for ${address}`);
      table({
        "Minter": roles.isMinter,
        "Burner": roles.isBurner,
        "Pauser": roles.isPauser,
        "Freezer": roles.isFreezer,
        "Blacklister": roles.isBlacklister,
        "Seizer": roles.isSeizer,
      });
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
