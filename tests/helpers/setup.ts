import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

/**
 * Airdrop SOL to one or more keypairs and wait for confirmations.
 *
 * Uses a single await on a Promise.all so all airdrops are requested
 * concurrently. The subsequent sleep gives validators time to process
 * the airdrop transactions before tests proceed.
 */
export async function airdropSol(
  connection: Connection,
  ...keypairs: Keypair[]
): Promise<void> {
  await Promise.all(
    keypairs.map((k) =>
      connection.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL)
    )
  );
  await sleep(1000);
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Confirm a transaction signature, retrying until confirmed or timeout.
 */
export async function confirmTx(
  connection: Connection,
  signature: string,
  timeout = 30_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { value } = await connection.getSignatureStatus(signature);
    if (
      value?.confirmationStatus === "confirmed" ||
      value?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Transaction ${signature} not confirmed within ${timeout}ms`);
}

/**
 * Derive the associated token account address without making an RPC call.
 * Re-exported from @solana/spl-token for convenience.
 */
export { getAssociatedTokenAddressSync } from "@solana/spl-token";
