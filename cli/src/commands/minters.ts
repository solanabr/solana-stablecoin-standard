import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError, printTable } from "../utils/output.js";

export function registerMinters(program: Command): void {
  const minters = program
    .command("minters")
    .description("Manage minters (list, add, remove)");

  minters
    .command("list")
    .description("List all registered minters with their quotas")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const info = await coin.getInfo();
        const divisor = BigInt(10 ** info.decimals);
        const entries = await coin.getMinters();

        const rows = entries.map((m) => ({
          address: m.address.toBase58(),
          quota: m.quota === 0n ? "unlimited" : `${Number(m.quota) / Number(divisor)} ${info.symbol}`,
          minted: `${Number(m.minted) / Number(divisor)} ${info.symbol}`,
          remaining: m.quota === 0n ? "unlimited" : `${Number(m.quota - m.minted) / Number(divisor)} ${info.symbol}`,
        }));

        if (rows.length === 0) {
          printSuccess("Minters", { count: 0 });
        } else {
          printTable(rows);
        }
      } catch (err) {
        printError(err);
      }
    });

  minters
    .command("add <address>")
    .description("Add a new minter with a quota")
    .requiredOption("--quota <amount>", "Maximum tokens this minter may mint (in display units)")
    .action(async (address: string, opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const info = await coin.getInfo();
        const rawQuota = BigInt(Math.round(parseFloat(opts.quota) * 10 ** info.decimals));

        const sig = await coin.addMinter(authority, new PublicKey(address), rawQuota);
        printSuccess("Minter added", { address, quota: opts.quota, signature: sig });
      } catch (err) {
        printError(err);
      }
    });

  minters
    .command("remove <address>")
    .description("Remove a minter from the role list")
    .action(async (address: string, _opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));

        const sig = await coin.removeMinter(authority, new PublicKey(address));
        printSuccess("Minter removed", { address, signature: sig });
      } catch (err) {
        printError(err);
      }
    });
}
