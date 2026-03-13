import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "../../stablecoin";
import { loadConfig, loadKeypair, getConnection, getProgramId } from "../config";
import { error, table, header } from "../output";

export const statusCommand = new Command("status")
  .description("Show stablecoin status and supply info")
  .option("--keypair <path>", "Path to keypair")
  .option("--rpc <url>", "RPC URL")
  .action(async (opts) => {
    try {
      const config = loadConfig();
      if (!config.mint) {
        error("No mint configured. Run 'sss-token init' first.");
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

      const info = await stable.getInfo();
      const supply = await stable.getTotalSupply();

      header("Stablecoin Status");
      table({
        "Name": info.name,
        "Symbol": info.symbol,
        "Mint": info.mint.toBase58(),
        "Authority": info.authority.toBase58(),
        "Decimals": info.decimals,
        "Paused": info.paused,
        "Permanent Delegate": info.enablePermanentDelegate,
        "Transfer Hook": info.enableTransferHook,
        "Current Supply": supply.currentSupply.toString(),
        "Total Minted": supply.totalMinted.toString(),
        "Total Burned": supply.totalBurned.toString(),
        "Preset": info.enableTransferHook ? "SSS-2 (Compliant)" : "SSS-1 (Minimal)",
      });
    } catch (e: any) {
      error(e.message);
      process.exit(1);
    }
  });
