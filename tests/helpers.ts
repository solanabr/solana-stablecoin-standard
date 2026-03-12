import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import { SssHook } from "../target/types/sss_hook";

// ── Seeds (must match Rust constants) ──────────────────────────────────────
export const CONFIG_SEED = Buffer.from("config");
export const MINT_AUTHORITY_SEED = Buffer.from("mint-authority");
export const MINTER_SEED = Buffer.from("minter");
export const HOOK_CONFIG_SEED = Buffer.from("hook-config");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export const PRESET_MINIMAL = 1;
export const PRESET_COMPLIANT = 2;

// ── PDA Derivation Helpers ─────────────────────────────────────────────────

export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId
  );
}

export function findMintAuthorityPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_AUTHORITY_SEED, mint.toBuffer()],
    programId
  );
}

export function findMinterStatePda(
  config: PublicKey,
  minter: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, config.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function findHookConfigPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HOOK_CONFIG_SEED, mint.toBuffer()],
    programId
  );
}

export function findBlacklistEntryPda(
  mint: PublicKey,
  wallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function findExtraAccountMetaListPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    programId
  );
}

// ── Test Context ───────────────────────────────────────────────────────────

export interface StablecoinCtx {
  mint: Keypair;
  configPda: PublicKey;
  configBump: number;
  mintAuthorityPda: PublicKey;
  mintAuthorityBump: number;
  authority: Keypair;
}

export async function airdrop(
  provider: anchor.AnchorProvider,
  to: PublicKey,
  amount = 100 * LAMPORTS_PER_SOL
) {
  const sig = await provider.connection.requestAirdrop(to, amount);
  const latestBlockhash = await provider.connection.getLatestBlockhash();
  await provider.connection.confirmTransaction({
    signature: sig,
    ...latestBlockhash,
  });
}

export async function initializeStablecoin(
  program: Program<SssCore>,
  provider: anchor.AnchorProvider,
  preset: number,
  hookProgram?: PublicKey
): Promise<StablecoinCtx> {
  const authority = (provider.wallet as anchor.Wallet).payer;
  const mint = Keypair.generate();

  const [configPda, configBump] = findConfigPda(mint.publicKey, program.programId);
  const [mintAuthorityPda, mintAuthorityBump] = findMintAuthorityPda(
    mint.publicKey,
    program.programId
  );

  const accounts: any = {
    authority: authority.publicKey,
    mint: mint.publicKey,
    config: configPda,
    mintAuthority: mintAuthorityPda,
    hookProgram: hookProgram ?? null,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };

  await program.methods
    .initialize({
      preset,
      name: "Test Stablecoin",
      symbol: "TUSD",
      uri: "https://example.com/metadata.json",
      decimals: 6,
    })
    .accountsPartial(accounts)
    .signers([mint])
    .rpc();

  return {
    mint,
    configPda,
    configBump,
    mintAuthorityPda,
    mintAuthorityBump,
    authority,
  };
}

export async function createAta(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  owner: PublicKey,
  payer?: Keypair
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    true, // allowOwnerOffCurve
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ix = createAssociatedTokenAccountInstruction(
    payer?.publicKey ?? provider.wallet.publicKey,
    ata,
    owner,
    mint,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const tx = new anchor.web3.Transaction().add(ix);
  if (payer) {
    tx.feePayer = payer.publicKey;
    await provider.sendAndConfirm(tx, [payer]);
  } else {
    await provider.sendAndConfirm(tx);
  }

  return ata;
}

export async function configureMinter(
  program: Program<SssCore>,
  stablecoin: StablecoinCtx,
  minterWallet: PublicKey,
  quota: anchor.BN,
  masterMinter?: Keypair
): Promise<PublicKey> {
  const [minterStatePda] = findMinterStatePda(
    stablecoin.configPda,
    minterWallet,
    program.programId
  );

  const signers = masterMinter ? [masterMinter] : [];
  const masterMinterPubkey = masterMinter
    ? masterMinter.publicKey
    : stablecoin.authority.publicKey;

  await program.methods
    .configureMinter(minterWallet, quota)
    .accountsPartial({
      masterMinter: masterMinterPubkey,
      config: stablecoin.configPda,
      minterState: minterStatePda,
      systemProgram: SystemProgram.programId,
    })
    .signers(signers)
    .rpc();

  return minterStatePda;
}

export async function mintTokens(
  program: Program<SssCore>,
  stablecoin: StablecoinCtx,
  minter: Keypair,
  destination: PublicKey,
  amount: anchor.BN,
  minterStatePda: PublicKey
) {
  await program.methods
    .mintTokens(amount)
    .accountsPartial({
      minter: minter.publicKey,
      config: stablecoin.configPda,
      minterState: minterStatePda,
      mint: stablecoin.mint.publicKey,
      destination,
      mintAuthority: stablecoin.mintAuthorityPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([minter])
    .rpc();
}
