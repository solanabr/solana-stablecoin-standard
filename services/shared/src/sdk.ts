import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";

export function createConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

export function keypairFromEnv(privateKeyStr: string): Keypair {
  const trimmed = privateKeyStr.trim();
  if (trimmed.startsWith("[")) {
    const bytes = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  // Base58-encoded secret key — decode using Buffer via web3.js internal approach
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
  // Fallback: treat as hex
  return Keypair.fromSecretKey(Buffer.from(trimmed, "hex"));
}

export async function loadStablecoin(
  connection: Connection,
  mintPubkey: string,
  signerKeypair?: Keypair,
): Promise<SolanaStablecoin> {
  const mint = new PublicKey(mintPubkey);
  return SolanaStablecoin.load(connection, mint, signerKeypair);
}
