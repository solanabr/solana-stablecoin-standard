import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@solana-stablecoin/sdk";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";

function expandPath(filepath: string): string {
  if (filepath.startsWith("~")) {
    return path.join(process.env.HOME || "", filepath.slice(1));
  }
  return filepath;
}

/** Create provider from CLI options object. */
export function createProvider(opts: any): AnchorProvider {
  const parent = opts.parent?.parent || opts.parent || {};
  const clusterUrl = parent.cluster || opts.cluster || "http://localhost:8899";
  const keypairPath = expandPath(parent.keypair || opts.keypair || "~/.config/solana/id.json");
  const connection = new Connection(clusterUrl, "confirmed");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new Wallet(keypair);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

/** Create provider from explicit cluster URL + keypair path. */
export async function getProvider(
  clusterUrl: string,
  keypairPath: string
): Promise<AnchorProvider> {
  const resolvedPath = expandPath(keypairPath);
  const connection = new Connection(clusterUrl, "confirmed");
  const keypairData = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new Wallet(keypair);
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

/**
 * Load stablecoin — supports both calling conventions:
 *   loadStablecoin(opts)                  — extracts provider+mint from opts
 *   loadStablecoin(provider, mintAddress) — explicit provider + mint string
 */
export async function loadStablecoin(
  providerOrOpts: AnchorProvider | any,
  mintAddress?: string
): Promise<SolanaStablecoin> {
  if (mintAddress !== undefined && providerOrOpts?.sendAndConfirm) {
    const provider = providerOrOpts as AnchorProvider;
    return SolanaStablecoin.load(provider, new PublicKey(mintAddress));
  }
  const opts = providerOrOpts;
  const provider = createProvider(opts);
  return SolanaStablecoin.load(provider, new PublicKey(opts.mint));
}

export function success(msg: string, sig?: string): void {
  console.log(chalk.green("✓"), msg);
  if (sig) console.log(chalk.gray(`  tx: ${sig}`));
}

export function fail(msg: string, err?: any): never {
  console.error(chalk.red("✗"), msg);
  if (err?.message) console.error(chalk.gray(`  ${err.message}`));
  process.exit(1);
}

export function formatAmount(amount: bigint, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, "0");
  return `${str.slice(0, -decimals) || "0"}.${str.slice(-decimals)}`;
}
