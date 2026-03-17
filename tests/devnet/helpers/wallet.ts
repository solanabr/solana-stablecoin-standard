import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
} from "@solana/web3.js";

import { CONFIRM_COMMITMENT } from "./cluster";

export function loadPayer(): Keypair {
  const keypairPath =
    process.env.SOLANA_KEYPAIR ??
    resolve(process.env.HOME ?? "", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8"))),
  );
}

// Initialize (mint + config + roles) + updateMinter (quota PDA) + SSS-2 extra-account-meta PDA;
// authority must stay rent-exempt (~0.9M). Use 0.02 SOL to cover all and leave buffer.
const DEFAULT_FUND_LAMPORTS = Math.floor(0.02 * LAMPORTS_PER_SOL);
let airdropAttempted = false;

export async function fundAuthority(
  connection: Connection,
  payer: Keypair,
  authority: Keypair,
  lamports = DEFAULT_FUND_LAMPORTS,
): Promise<void> {
  let balance = await connection.getBalance(payer.publicKey);
  const required = lamports + 5000; // tx fee
  if (balance < required && !airdropAttempted) {
    airdropAttempted = true;
    try {
      const sig = await connection.requestAirdrop(
        payer.publicKey,
        LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, CONFIRM_COMMITMENT);
      balance = await connection.getBalance(payer.publicKey);
    } catch {
      // ignore airdrop errors (e.g. mainnet or rate limit)
    }
  }
  if (balance < required) {
    throw new Error(
      `Payer has ${balance} lamports; need ${required} to fund authority. Airdrop or fund the devnet payer (${payer.publicKey.toBase58()}).`,
    );
  }
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: authority.publicKey,
      lamports,
    }),
  );

  await sendAndConfirmTransaction(connection, transaction, [payer], {
    commitment: CONFIRM_COMMITMENT,
    preflightCommitment: CONFIRM_COMMITMENT,
  });
}
