import { readFile } from "node:fs/promises";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

import type { ServiceConfig } from "./config.js";

export async function loadAuthorityKeypair(path?: string): Promise<Keypair> {
  if (!path) {
    throw new Error("MissingBackendAuthorityKeypair");
  }

  const raw = await readFile(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
}

export async function connectConfiguredStablecoin(
  config: ServiceConfig
): Promise<{ stablecoin: SolanaStablecoin; authority: Keypair }> {
  if (!config.stablecoinMint) {
    throw new Error("MissingStablecoinMint");
  }

  const authority = await loadAuthorityKeypair(config.authorityKeypairPath);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const stablecoin = await SolanaStablecoin.connect({
    connection,
    authority,
    programId: config.stablecoinProgramId
      ? new PublicKey(config.stablecoinProgramId)
      : undefined,
    mint: new PublicKey(config.stablecoinMint)
  });

  return { stablecoin, authority };
}
