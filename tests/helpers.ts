import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferHookInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeDefaultAccountStateInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  ExtensionType,
  AccountState,
  getAccount,
  createSetAuthorityInstruction,
  AuthorityType,
} from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import { SssTransferHook } from "../target/types/sss_transfer_hook";

// ─────────────────────────────────────────────────────────────
// PDA Derivation
// ─────────────────────────────────────────────────────────────

export function deriveConfigPda(
  mint: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss-config"), mint.toBuffer()],
    programId,
  );
}

export function deriveRolePda(
  config: PublicKey,
  address: PublicKey,
  role: number,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("sss-role"),
      config.toBuffer(),
      address.toBuffer(),
      Buffer.from([role]),
    ],
    programId,
  );
}

export function deriveBlacklistPda(
  mint: PublicKey,
  address: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    programId,
  );
}

export function deriveExtraAccountMetasPda(
  mint: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    programId,
  );
}

// Role constants
export const ROLE_ADMIN = 0;
export const ROLE_MINTER = 1;
export const ROLE_FREEZER = 2;
export const ROLE_PAUSER = 3;

// ─────────────────────────────────────────────────────────────
// Airdrop
// ─────────────────────────────────────────────────────────────

export async function airdropSol(
  connection: Connection,
  pubkey: PublicKey,
  amount: number = 10,
): Promise<void> {
  const sig = await connection.requestAirdrop(
    pubkey,
    amount * LAMPORTS_PER_SOL,
  );
  await connection.confirmTransaction(sig, "confirmed");
}

// ─────────────────────────────────────────────────────────────
// Token Account Creation
// ─────────────────────────────────────────────────────────────

export async function createTokenAccount(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  owner: PublicKey,
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const ix = createAssociatedTokenAccountInstruction(
    provider.wallet.publicKey,
    ata,
    owner,
    mint,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction().add(ix);
  await provider.sendAndConfirm(tx);

  return ata;
}

// ─────────────────────────────────────────────────────────────
// SSS-1 Mint Creation
// ─────────────────────────────────────────────────────────────

export interface CreateSss1MintResult {
  mint: Keypair;
  configPda: PublicKey;
  configBump: number;
  adminRolePda: PublicKey;
}

/**
 * Creates an SSS-1 (minimal) stablecoin mint with Token-2022 extensions.
 *
 * Flow:
 * 1. Create mint account with wallet as temporary authority
 * 2. Initialize MetadataPointer extension
 * 3. InitializeMint2 (wallet as mint/freeze authority)
 * 4. Initialize TokenMetadata (wallet signs as mint authority)
 * 5. Transfer mint authority from wallet to config PDA
 * 6. Transfer freeze authority from wallet to config PDA
 * 7. Call sss-core initialize
 */
export async function createSss1Mint(
  provider: anchor.AnchorProvider,
  coreProgram: Program<SssCore>,
  args: {
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    supplyCap: BN | null;
  },
): Promise<CreateSss1MintResult> {
  const mint = Keypair.generate();
  const authority = provider.wallet.publicKey;

  const [configPda, configBump] = deriveConfigPda(
    mint.publicKey,
    coreProgram.programId,
  );
  const [adminRolePda] = deriveRolePda(
    configPda,
    authority,
    ROLE_ADMIN,
    coreProgram.programId,
  );

  // SSS-1 extensions: MetadataPointer + PermanentDelegate.
  // PermanentDelegate is needed so the config PDA can burn tokens
  // from any account (the burn instruction uses config PDA as authority).
  // Metadata is skipped in tests to avoid Token-2022 realloc issues.
  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
  ];
  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    mintLen,
  );

  // Transaction 1: Create mint account, init extensions, init mint.
  const tx1 = new Transaction();

  tx1.add(
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  );

  tx1.add(
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      authority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializePermanentDelegateInstruction(
      mint.publicKey,
      configPda,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializeMint2Instruction(
      mint.publicKey,
      args.decimals,
      authority, // temporary mint authority = wallet
      authority, // temporary freeze authority = wallet
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  await provider.sendAndConfirm(tx1, [mint]);

  // Transaction 2: Transfer mint and freeze authorities to the config PDA
  const tx2 = new Transaction();

  tx2.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      authority,
      AuthorityType.MintTokens,
      configPda,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx2.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      authority,
      AuthorityType.FreezeAccount,
      configPda,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  await provider.sendAndConfirm(tx2);

  // Transaction 3: Call sss-core initialize to create config PDA and admin role
  await coreProgram.methods
    .initialize({
      preset: 1,
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      decimals: args.decimals,
      supplyCap: args.supplyCap,
    })
    .accounts({
      authority,
      config: configPda,
      mint: mint.publicKey,
      adminRole: adminRolePda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { mint, configPda, configBump, adminRolePda };
}

// ─────────────────────────────────────────────────────────────
// SSS-2 Mint Creation (with transfer hook)
// ─────────────────────────────────────────────────────────────

export interface CreateSss2MintResult extends CreateSss1MintResult {
  extraAccountMetasPda: PublicKey;
}

/**
 * Creates an SSS-2 (compliant) stablecoin mint with transfer hook,
 * permanent delegate, and default frozen state.
 *
 * Same flow as SSS-1 but with additional extensions initialized
 * before InitializeMint2. PermanentDelegate is set to configPda
 * during extension init (does not require signing). DefaultAccountState
 * is set to Frozen. TransferHook points to the hook program.
 */
export async function createSss2Mint(
  provider: anchor.AnchorProvider,
  coreProgram: Program<SssCore>,
  hookProgram: Program<SssTransferHook>,
  args: {
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    supplyCap: BN | null;
  },
): Promise<CreateSss2MintResult> {
  const mint = Keypair.generate();
  const authority = provider.wallet.publicKey;

  const [configPda, configBump] = deriveConfigPda(
    mint.publicKey,
    coreProgram.programId,
  );
  const [adminRolePda] = deriveRolePda(
    configPda,
    authority,
    ROLE_ADMIN,
    coreProgram.programId,
  );
  const [extraAccountMetasPda] = deriveExtraAccountMetasPda(
    mint.publicKey,
    hookProgram.programId,
  );

  // All SSS-2 extensions
  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.TransferHook,
    ExtensionType.PermanentDelegate,
    ExtensionType.DefaultAccountState,
  ];
  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    mintLen,
  );

  // Transaction 1: Create mint with all extensions (no metadata yet).
  const tx1 = new Transaction();

  tx1.add(
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  );

  // Extensions must be initialized BEFORE InitializeMint2
  tx1.add(
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      authority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializeTransferHookInstruction(
      mint.publicKey,
      authority,
      hookProgram.programId,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializePermanentDelegateInstruction(
      mint.publicKey,
      configPda,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializeDefaultAccountStateInstruction(
      mint.publicKey,
      AccountState.Frozen,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializeMint2Instruction(
      mint.publicKey,
      args.decimals,
      authority,
      authority,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  await provider.sendAndConfirm(tx1, [mint]);

  // Transaction 2: Transfer authorities to config PDA
  const tx2 = new Transaction();

  tx2.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      authority,
      AuthorityType.MintTokens,
      configPda,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx2.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      authority,
      AuthorityType.FreezeAccount,
      configPda,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  await provider.sendAndConfirm(tx2);

  // Transaction 3: Call sss-core initialize with preset=2
  await coreProgram.methods
    .initialize({
      preset: 2,
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      decimals: args.decimals,
      supplyCap: args.supplyCap,
    })
    .accounts({
      authority,
      config: configPda,
      mint: mint.publicKey,
      adminRole: adminRolePda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  // Transaction 4: Initialize extra account metas for the transfer hook
  await hookProgram.methods
    .initializeExtraAccountMetas()
    .accounts({
      payer: authority,
      extraAccountMetas: extraAccountMetasPda,
      mint: mint.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { mint, configPda, configBump, adminRolePda, extraAccountMetasPda };
}

// ─────────────────────────────────────────────────────────────
// SSS-3 Mint Creation (with confidential transfers)
// ─────────────────────────────────────────────────────────────

export type CreateSss3MintResult = CreateSss1MintResult;

/**
 * Creates an SSS-3 (confidential) stablecoin mint with:
 * - MetadataPointer
 * - PermanentDelegate
 * - ConfidentialTransferMint
 *
 * Same flow as SSS-1 but adds the ConfidentialTransferMint extension
 * via a manually-built instruction. No TransferHook, no DefaultAccountState.
 */
export async function createSss3Mint(
  provider: anchor.AnchorProvider,
  coreProgram: Program<SssCore>,
  args: {
    name: string;
    symbol: string;
    uri: string;
    decimals: number;
    supplyCap: BN | null;
    auditorElGamalPubkey?: Uint8Array;
    autoApproveNewAccounts?: boolean;
  },
): Promise<CreateSss3MintResult> {
  const mint = Keypair.generate();
  const authority = provider.wallet.publicKey;

  const [configPda, configBump] = deriveConfigPda(
    mint.publicKey,
    coreProgram.programId,
  );
  const [adminRolePda] = deriveRolePda(
    configPda,
    authority,
    ROLE_ADMIN,
    coreProgram.programId,
  );

  const autoApprove = args.autoApproveNewAccounts ?? true;
  const auditorKey = args.auditorElGamalPubkey ?? new Uint8Array(32);

  // SSS-3 extensions: MetadataPointer + PermanentDelegate + ConfidentialTransferMint
  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
    ExtensionType.ConfidentialTransferMint,
  ];
  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(
    mintLen,
  );

  // Build the InitializeConfidentialTransferMint instruction data manually.
  // Pod layout (fixed size): [27, 0, authority(32), auto_approve(1), auditor(32)]
  // OptionalNonZeroPubkey/ElGamalPubkey: all zeros = None, non-zero = Some
  const ctData = Buffer.alloc(67); // 2 + 32 + 1 + 32
  let offset = 0;
  ctData.writeUInt8(27, offset); offset += 1; // ConfidentialTransfer discriminator
  ctData.writeUInt8(0, offset); offset += 1;  // InitializeMint sub-instruction
  // OptionalNonZeroPubkey authority (32 bytes)
  configPda.toBuffer().copy(ctData, offset); offset += 32;
  // PodBool auto_approve_new_accounts (1 byte)
  ctData.writeUInt8(autoApprove ? 1 : 0, offset); offset += 1;
  // OptionalNonZeroElGamalPubkey auditor (32 bytes)
  Buffer.from(auditorKey).copy(ctData, offset); offset += 32;

  const initConfidentialIx = {
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [{ pubkey: mint.publicKey, isSigner: false, isWritable: true }],
    data: ctData,
  };

  // Transaction 1: Create mint with all extensions (no metadata yet)
  const tx1 = new Transaction();

  tx1.add(
    SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
  );

  tx1.add(
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      authority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(
    createInitializePermanentDelegateInstruction(
      mint.publicKey,
      configPda,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx1.add(initConfidentialIx);

  tx1.add(
    createInitializeMint2Instruction(
      mint.publicKey,
      args.decimals,
      authority, // temporary mint authority = wallet
      authority, // temporary freeze authority = wallet
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  await provider.sendAndConfirm(tx1, [mint]);

  // Transaction 2: Transfer mint and freeze authorities to the config PDA
  const tx2 = new Transaction();

  tx2.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      authority,
      AuthorityType.MintTokens,
      configPda,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  tx2.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      authority,
      AuthorityType.FreezeAccount,
      configPda,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  await provider.sendAndConfirm(tx2);

  // Transaction 3: Call sss-core initialize with preset=3
  await coreProgram.methods
    .initialize({
      preset: 3,
      name: args.name,
      symbol: args.symbol,
      uri: args.uri,
      decimals: args.decimals,
      supplyCap: args.supplyCap,
    })
    .accounts({
      authority,
      config: configPda,
      mint: mint.publicKey,
      adminRole: adminRolePda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { mint, configPda, configBump, adminRolePda };
}

// ─────────────────────────────────────────────────────────────
// Grant Role Helper
// ─────────────────────────────────────────────────────────────

export async function grantRole(
  coreProgram: Program<SssCore>,
  configPda: PublicKey,
  adminRolePda: PublicKey,
  grantee: PublicKey,
  role: number,
): Promise<PublicKey> {
  const [rolePda] = deriveRolePda(
    configPda,
    grantee,
    role,
    coreProgram.programId,
  );

  await coreProgram.methods
    .grantRole(role)
    .accounts({
      admin: coreProgram.provider.publicKey!,
      config: configPda,
      adminRole: adminRolePda,
      grantee,
      roleAccount: rolePda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return rolePda;
}

// ─────────────────────────────────────────────────────────────
// Fetch Config Helper
// ─────────────────────────────────────────────────────────────

export async function fetchConfig(
  coreProgram: Program<SssCore>,
  configPda: PublicKey,
) {
  return coreProgram.account.stablecoinConfig.fetch(configPda);
}

// ─────────────────────────────────────────────────────────────
// Token Balance Helper
// ─────────────────────────────────────────────────────────────

export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey,
): Promise<bigint> {
  const account = await getAccount(
    connection,
    tokenAccount,
    undefined, // use connection's default commitment
    TOKEN_2022_PROGRAM_ID,
  );
  return account.amount;
}
