import { readFile } from "node:fs/promises";
import { Keypair } from "@solana/web3.js";

export async function loadKeypair(path?: string): Promise<Keypair> {
  if (!path) {
    return Keypair.generate();
  }

  const file = await readFile(path, "utf8");
  const secret = Uint8Array.from(JSON.parse(file) as number[]);
  return Keypair.fromSecretKey(secret);
}
