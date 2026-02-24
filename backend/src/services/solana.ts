import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { SSS } from "@sss/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";
import { logger } from "./logger";

export interface SolanaService {
  connection: Connection;
  provider: AnchorProvider;
  keypair: Keypair;
  coreProgramId: PublicKey;
  hookProgramId: PublicKey;
  loadStablecoin: (mint: PublicKey) => Promise<SSS>;
}

let instance: SolanaService | null = null;

/**
 * Load a Keypair from the filesystem path specified by KEYPAIR_PATH env var.
 * Supports `~` home directory expansion.
 */
function loadKeypair(): Keypair {
  const keypairPath = process.env.KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error("KEYPAIR_PATH environment variable is required");
  }

  const expanded = keypairPath.startsWith("~")
    ? resolve(process.env.HOME || "", keypairPath.slice(1))
    : resolve(keypairPath);

  try {
    const rawKey = JSON.parse(readFileSync(expanded, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(rawKey));
  } catch (err) {
    throw new Error(
      `Failed to load keypair from ${expanded}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Initialize the singleton Solana service.
 * Creates connection, loads keypair, and sets up the AnchorProvider.
 */
function initSolanaService(): SolanaService {
  const rpcUrl = process.env.SOLANA_RPC_URL || "http://localhost:8899";
  const wsUrl = process.env.SOLANA_WS_URL;

  const coreProgramId = new PublicKey(
    process.env.SSS_CORE_PROGRAM_ID || "Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB",
  );
  const hookProgramId = new PublicKey(
    process.env.SSS_HOOK_PROGRAM_ID || "hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH",
  );

  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: wsUrl,
  });

  const keypair = loadKeypair();
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  logger.info("Solana service initialized", {
    rpc: rpcUrl,
    wallet: keypair.publicKey.toBase58(),
    coreProgram: coreProgramId.toBase58(),
    hookProgram: hookProgramId.toBase58(),
  });

  return {
    connection,
    provider,
    keypair,
    coreProgramId,
    hookProgramId,
    loadStablecoin: (mint: PublicKey) => SSS.load(provider, mint),
  };
}

/**
 * Get or create the singleton Solana service instance.
 * Throws if required env vars are missing.
 */
export function getSolanaService(): SolanaService {
  if (!instance) {
    instance = initSolanaService();
  }
  return instance;
}
