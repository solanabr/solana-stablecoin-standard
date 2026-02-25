import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

export function registerPause(program: Command): void {
  program
    .command("pause")
    .description("Globally pause all mint/burn/transfer operations")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const sig = await coin.pause(authority);

        printSuccess("Token paused", { mint: mintAddr, signature: sig });
      } catch (err) {
        printError(err);
      }
    });

  program
    .command("unpause")
    .description("Resume operations after a global pause")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found.");

        const connection = makeConnection(globalOpts.cluster);
        const authority = loadKeypair(globalOpts.keypair);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const sig = await coin.unpause(authority);

        printSuccess("Token unpaused", { mint: mintAddr, signature: sig });
      } catch (err) {
        printError(err);
      }
    });
}
