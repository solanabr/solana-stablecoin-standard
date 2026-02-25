import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin, deriveBlacklistEntry } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printTable, printError } from "../utils/output.js";

export function registerBlacklist(program: Command): void {
  const blacklist = program
    .command("blacklist")
    .description("Manage the SSS-2 compliance blacklist");

  blacklist
    .command("add")
    .description("Add a wallet address to the blacklist (SSS-2 only)")
    .argument("<address>", "Wallet address to blacklist")
    .requiredOption("--reason <reason>", "Reason for blacklisting (max 64 chars)")
    .option("--blacklister <path>", "Path to blacklister keypair (defaults to --keypair)")
    .action(async (address: string, opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const blacklister = loadKeypair(opts.blacklister ?? globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));

        const sig = await coin.compliance.addToBlacklist(
          blacklister,
          new PublicKey(address),
          opts.reason as string
        );

        printSuccess("Address blacklisted", { address, reason: opts.reason as string, signature: sig });
      } catch (err) {
        printError(err);
      }
    });

  blacklist
    .command("remove")
    .description("Remove a wallet address from the blacklist (SSS-2 only)")
    .argument("<address>", "Wallet address to remove")
    .option("--blacklister <path>", "Path to blacklister keypair (defaults to --keypair)")
    .action(async (address: string, opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const blacklister = loadKeypair(opts.blacklister ?? globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));

        const sig = await coin.compliance.removeFromBlacklist(
          blacklister,
          new PublicKey(address)
        );

        printSuccess("Address removed from blacklist", { address, signature: sig });
      } catch (err) {
        printError(err);
      }
    });

  blacklist
    .command("check")
    .description("Check if a wallet address is currently blacklisted")
    .argument("<address>", "Wallet address to check")
    .action(async (address: string, _opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const blacklisted = await coin.compliance.isBlacklisted(new PublicKey(address));

        printTable([{ address, blacklisted: String(blacklisted) }]);
      } catch (err) {
        printError(err);
      }
    });

  blacklist
    .command("list")
    .description("List all blacklisted addresses for this stablecoin (SSS-2 only)")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent!.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const mintKey = new PublicKey(mintAddr);
        const connection = makeConnection(globalOpts.cluster);

        // Fetch all BlacklistEntry accounts by discriminator via getProgramAccounts
        // with a filter on the seeds prefix (mint bytes 8..40 match our mint).
        const { SSS_TOKEN_PROGRAM_ID } = await import("@stbr/sss-sdk");
        const accounts = await connection.getProgramAccounts(SSS_TOKEN_PROGRAM_ID, {
          filters: [
            { dataSize: 8 + 32 + 32 + 4 + 64 + 8 + 32 + 1 }, // BlacklistEntry size
            {
              memcmp: {
                offset: 8 + 32, // after discriminator + address field
                bytes: mintKey.toBase58(),
              },
            },
          ],
        });

        if (accounts.length === 0) {
          console.log("  (no blacklisted addresses)");
          return;
        }

        // Decode address field (bytes 8..40) from each account
        const rows = accounts.map((a) => ({
          address: new PublicKey(a.account.data.slice(8, 40)).toBase58(),
          account: a.pubkey.toBase58(),
        }));
        printTable(rows);
      } catch (err) {
        printError(err);
      }
    });
}
