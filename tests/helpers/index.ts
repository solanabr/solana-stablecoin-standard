import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as assert from "assert";

const SSS_IDL = require("../../target/idl/sss_token.json");
const HOOK_IDL = require("../../target/idl/sss_transfer_hook.json");

export const SSS_PROGRAM_ID = new PublicKey(
  "AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm"
);
export const HOOK_PROGRAM_ID = new PublicKey(
  "9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7"
);

export async function airdrop(
  connection: Connection,
  pubkey: PublicKey,
  sol = 10
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig);
}

export function makeProgram(connection: Connection, payer: Keypair): Program {
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = { ...SSS_IDL, address: SSS_PROGRAM_ID.toBase58() };
  return new Program(idl, provider);
}

export function makeHookProgram(
  connection: Connection,
  payer: Keypair
): Program {
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });
  const idl = { ...HOOK_IDL, address: HOOK_PROGRAM_ID.toBase58() };
  return new Program(idl, provider);
}

export async function createAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  await sendAndConfirmTransaction(connection, tx, [payer]);
  return ata;
}

export async function assertThrows(
  fn: () => Promise<unknown>,
  msg?: string
): Promise<void> {
  try {
    await fn();
    assert.fail("Expected error but none thrown");
  } catch (e) {
    if (msg) {
      const errorMsg = (e as Error).message ?? "";
      assert.ok(
        errorMsg.includes(msg),
        `Expected error containing "${msg}" but got: ${errorMsg}`
      );
    }
  }
}
