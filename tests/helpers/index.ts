import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";

export const STABLECOIN_SEED = Buffer.from("stablecoin");
export const ROLES_SEED = Buffer.from("roles");
export const MINTER_SEED = Buffer.from("minter");
export const BLACKLIST_SEED = Buffer.from("blacklist");

export interface TestContext {
  provider: anchor.AnchorProvider;
  program: Program;
  mint: Keypair;
  configPDA: PublicKey;
  configBump: number;
  authority: Keypair;
}

export async function setupStablecoin(
  program: Program,
  provider: anchor.AnchorProvider,
  opts: {
    name: string;
    symbol: string;
    decimals?: number;
    supplyCap?: number;
    enablePermanentDelegate?: boolean;
    enableTransferHook?: boolean;
  }
): Promise<TestContext> {
  const authority = provider.wallet as anchor.Wallet;
  const mintKeypair = Keypair.generate();
  const decimals = opts.decimals ?? 6;

  const extensions: ExtensionType[] = [];
  if (opts.enablePermanentDelegate) {
    extensions.push(ExtensionType.PermanentDelegate);
  }

  const [configPDA, configBump] = PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mintKeypair.publicKey.toBuffer()],
    program.programId
  );

  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction();

  tx.add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  if (opts.enablePermanentDelegate) {
    tx.add(
      createInitializePermanentDelegateInstruction(
        mintKeypair.publicKey,
        configPDA,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  tx.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      configPDA,
      configPDA,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(tx, [mintKeypair]);

  const [authorityRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .initialize({
      name: opts.name,
      symbol: opts.symbol,
      uri: "",
      decimals,
      supplyCap: new anchor.BN(opts.supplyCap ?? 0),
      enablePermanentDelegate: opts.enablePermanentDelegate ?? false,
      enableTransferHook: opts.enableTransferHook ?? false,
      defaultAccountFrozen: false,
    })
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      mint: mintKeypair.publicKey,
      authorityRoles,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  return {
    provider,
    program,
    mint: mintKeypair,
    configPDA,
    configBump,
    authority: (authority as any).payer,
  };
}

export async function setupMinter(
  ctx: TestContext,
  minterKeypair: Keypair,
  quota: number = 0
): Promise<void> {
  const [minterRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, ctx.configPDA.toBuffer(), minterKeypair.publicKey.toBuffer()],
    ctx.program.programId
  );

  const [minterConfig] = PublicKey.findProgramAddressSync(
    [MINTER_SEED, ctx.configPDA.toBuffer(), minterKeypair.publicKey.toBuffer()],
    ctx.program.programId
  );

  await ctx.program.methods
    .updateRoles(minterKeypair.publicKey, 1, true)
    .accounts({
      authority: ctx.authority.publicKey,
      stablecoinConfig: ctx.configPDA,
      targetRoles: minterRoles,
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.authority])
    .rpc();

  await ctx.program.methods
    .updateMinter(
      minterKeypair.publicKey,
      new anchor.BN(quota),
      true
    )
    .accounts({
      authority: ctx.authority.publicKey,
      stablecoinConfig: ctx.configPDA,
      minterConfig,
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.authority])
    .rpc();
}

export async function createTokenAccount(
  provider: anchor.AnchorProvider,
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
      provider.wallet.publicKey,
      ata,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(tx);
  return ata;
}

export async function airdrop(
  provider: anchor.AnchorProvider,
  to: PublicKey,
  amount: number = 10 * anchor.web3.LAMPORTS_PER_SOL
): Promise<void> {
  const sig = await provider.connection.requestAirdrop(to, amount);
  await provider.connection.confirmTransaction(sig);
}
