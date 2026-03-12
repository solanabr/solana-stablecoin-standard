import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

import { findStablecoinStatePda, findMinterRecordPda } from "../../sdk/core/src/pda";
import { SSS_CORE_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from "../../sdk/core/src/constants";

// Load IDL — built by `anchor build`
let sssCoreIdl: any;
let sssHookIdl: any;

try {
  sssCoreIdl = require("../../target/idl/sss_core.json");
  sssHookIdl = require("../../target/idl/sss_transfer_hook.json");
} catch {
  // IDL not yet built — tests will fail with a clear message
}

export interface TestContext {
  provider: AnchorProvider;
  program: Program<any>;
  hookProgram: Program<any>;
  authority: Keypair;
  alice: Keypair;
  bob: Keypair;
}

export async function buildTestContext(): Promise<TestContext> {
  const authority = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  const connection = new Connection("http://localhost:8899", "confirmed");
  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Airdrop to authority + test users
  await Promise.all([
    airdrop(connection, authority.publicKey, 10),
    airdrop(connection, alice.publicKey, 2),
    airdrop(connection, bob.publicKey, 2),
  ]);

  const program = new anchor.Program(sssCoreIdl, provider);
  const hookProgram = new anchor.Program(sssHookIdl, provider);

  return { provider, program, hookProgram, authority, alice, bob };
}

export async function airdrop(
  connection: Connection,
  address: PublicKey,
  sol: number
): Promise<void> {
  const sig = await connection.requestAirdrop(address, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

export async function createMintWithSss1(
  ctx: TestContext,
  options: { name?: string; symbol?: string; decimals?: number } = {}
): Promise<{ mint: Keypair; statePda: PublicKey }> {
  const mint = Keypair.generate();
  const [statePda] = findStablecoinStatePda(mint.publicKey);

  await ctx.program.methods
    .initialize({
      name: options.name ?? "Test USD",
      symbol: options.symbol ?? "TUSD",
      uri: "",
      decimals: options.decimals ?? 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
    })
    .accounts({
      authority: ctx.authority.publicKey,
      mint: mint.publicKey,
      stablecoinState: statePda,
      transferHookProgram: null,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mint])
    .rpc();

  return { mint, statePda };
}

export async function createMintWithSss2(
  ctx: TestContext,
  options: { name?: string; symbol?: string } = {}
): Promise<{ mint: Keypair; statePda: PublicKey }> {
  const mint = Keypair.generate();
  const [statePda] = findStablecoinStatePda(mint.publicKey);

  await ctx.program.methods
    .initialize({
      name: options.name ?? "Compliant USD",
      symbol: options.symbol ?? "CUSD",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: true,
    })
    .accounts({
      authority: ctx.authority.publicKey,
      mint: mint.publicKey,
      stablecoinState: statePda,
      transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mint])
    .rpc();

  return { mint, statePda };
}

export async function setupMinter(
  ctx: TestContext,
  statePda: PublicKey,
  mintPubkey: PublicKey,
  minter: Keypair,
  cap?: bigint
): Promise<PublicKey> {
  const [minterRecord] = findMinterRecordPda(mintPubkey, minter.publicKey);

  await ctx.program.methods
    .updateMinter(cap !== undefined ? new anchor.BN(cap.toString()) : null, true)
    .accounts({
      authority: ctx.authority.publicKey,
      stablecoinState: statePda,
      minter: minter.publicKey,
      minterRecord,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return minterRecord;
}

export async function getOrCreateAta(
  ctx: TestContext,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const info = await ctx.provider.connection.getAccountInfo(ata);
  if (!info) {
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        ctx.authority.publicKey,
        ata,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await ctx.provider.sendAndConfirm(tx);
  }
  return ata;
}
