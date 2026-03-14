import { Keypair } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import { RuntimeContext, TuiConfig } from "./types";

const CLUSTERS: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

export function parseArgs(argv: string[]): TuiConfig {
  let cluster = "devnet";
  let mint: string | null = null;
  let walletPath = path.join(os.homedir(), ".config/solana/id.json");
  let refreshMs = 30_000;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cluster" && argv[i + 1]) {
      cluster = argv[++i];
    } else if (argv[i] === "--mint" && argv[i + 1]) {
      mint = argv[++i];
    } else if (argv[i] === "--wallet" && argv[i + 1]) {
      walletPath = argv[++i];
    } else if (argv[i] === "--refresh" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed >= 1) {
        refreshMs = Math.floor(parsed * 1000);
      }
    }
  }

  return {
    cluster,
    rpcUrl: CLUSTERS[cluster] || cluster,
    mint,
    walletPath,
    refreshMs,
  };
}

export function loadRuntimeContext(config: TuiConfig): RuntimeContext {
  try {
    const walletData = JSON.parse(fs.readFileSync(config.walletPath, "utf-8"));
    const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
    return { wallet };
  } catch {
    return { wallet: null };
  }
}
