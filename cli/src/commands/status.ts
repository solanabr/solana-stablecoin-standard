import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-sdk";
import { loadSssConfig, loadKeypair, makeConnection } from "../utils/config.js";
import { printSuccess, printError } from "../utils/output.js";

export function registerSupply(program: Command): void {
  program
    .command("supply")
    .description("Show current circulating supply")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found. Run `sss-token init` first.");

        const connection = makeConnection(globalOpts.cluster);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const supply = await coin.getTotalSupply();
        const info = await coin.getInfo();
        const divisor = BigInt(10 ** info.decimals);
        const displaySupply = Number(supply) / Number(divisor);

        printSuccess("Supply", {
          mint: mintAddr,
          "circulating supply": `${displaySupply} ${info.symbol}`,
        });
      } catch (err) {
        printError(err);
      }
    });
}

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Show stablecoin config, supply, and pause state")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.parent!.opts() as { cluster: string; keypair?: string; mint?: string };
      try {
        const mintAddr = globalOpts.mint ?? loadSssConfig().mint;
        if (!mintAddr) throw new Error("No --mint specified and .sss-config.json not found. Run `sss-token init` first.");

        const connection = makeConnection(globalOpts.cluster);
        const coin = await SolanaStablecoin.load(connection, new PublicKey(mintAddr));
        const info = await coin.getInfo();

        const decimals = info.decimals;
        const divisor = BigInt(10 ** decimals);
        const totalMinted = Number(info.totalMinted) / Number(divisor);
        const totalBurned = Number(info.totalBurned) / Number(divisor);
        const supply = (Number(info.totalMinted) - Number(info.totalBurned)) / Number(divisor);

        printSuccess("Stablecoin status", {
          mint: info.mint.toBase58(),
          name: info.name,
          symbol: info.symbol,
          decimals: info.decimals,
          paused: info.paused,
          preset: info.enablePermanentDelegate ? "sss-2" : "sss-1",
          "transfer hook": info.enableTransferHook,
          "default frozen": info.enableDefaultFrozen,
          "total minted": `${totalMinted} ${info.symbol}`,
          "total burned": `${totalBurned} ${info.symbol}`,
          "circulating supply": `${supply} ${info.symbol}`,
          authority: info.authority.toBase58(),
        });
      } catch (err) {
        printError(err);
      }
    });
}
