import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeDefaultAccountStateInstruction,
  AccountState,
  createInitializeMintCloseAuthorityInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL"
);

// Dummy transfer-hook program ID — replace with actual deployed transfer-hook program
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "HookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
);

// ─── PDA derivation ───────────────────────────────────────────────────────────

export function findStatePDA(mintPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mintPubkey.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findMintAuthorityPDA(statePubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority"), statePubkey.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findFreezeAuthorityPDA(statePubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("freeze_authority"), statePubkey.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findPermanentDelegatePDA(statePubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("permanent_delegate"), statePubkey.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findMinterInfoPDA(
  statePubkey: PublicKey,
  minterPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), statePubkey.toBuffer(), minterPubkey.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findBlacklistEntryPDA(
  statePubkey: PublicKey,
  addressPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), statePubkey.toBuffer(), addressPubkey.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findExtraAccountMetaListPDA(mintPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mintPubkey.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  );
}

// ─── Mint pre-creation ────────────────────────────────────────────────────────

export interface CreateMintParams {
  connection: Connection;
  payer: Keypair;
  mintKeypair: Keypair;
  decimals: number;
  mintAuthority: PublicKey;
  freezeAuthority: PublicKey;
  enablePermanentDelegate: boolean;
  permanentDelegateKey?: PublicKey;
  enableTransferHook: boolean;
  transferHookProgramId?: PublicKey;
  defaultAccountFrozen: boolean;
  metadataPointerAuthority: PublicKey;
}

/**
 * Creates a Token-2022 mint with all required extensions pre-allocated.
 * Must be called before `initialize` on the SSS-token program.
 */
export async function createMintWithExtensions(
  params: CreateMintParams
): Promise<string> {
  const {
    connection,
    payer,
    mintKeypair,
    decimals,
    mintAuthority,
    freezeAuthority,
    enablePermanentDelegate,
    permanentDelegateKey,
    enableTransferHook,
    transferHookProgramId,
    defaultAccountFrozen,
    metadataPointerAuthority,
  } = params;

  const extensions: ExtensionType[] = [ExtensionType.MetadataPointer];

  if (defaultAccountFrozen) {
    extensions.push(ExtensionType.DefaultAccountState);
  }
  if (enablePermanentDelegate) {
    extensions.push(ExtensionType.PermanentDelegate);
  }
  if (enableTransferHook) {
    extensions.push(ExtensionType.TransferHook);
  }
  extensions.push(ExtensionType.MintCloseAuthority);

  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      metadataPointerAuthority,
      mintKeypair.publicKey, // metadata stored in mint
      TOKEN_2022_PROGRAM_ID
    )
  );

  if (defaultAccountFrozen) {
    tx.add(
      createInitializeDefaultAccountStateInstruction(
        mintKeypair.publicKey,
        AccountState.Frozen,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  if (enablePermanentDelegate && permanentDelegateKey) {
    tx.add(
      createInitializePermanentDelegateInstruction(
        mintKeypair.publicKey,
        permanentDelegateKey,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  if (enableTransferHook && transferHookProgramId) {
    tx.add(
      createInitializeTransferHookInstruction(
        mintKeypair.publicKey,
        mintAuthority,
        transferHookProgramId,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  tx.add(
    createInitializeMintCloseAuthorityInstruction(
      mintKeypair.publicKey,
      mintAuthority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    )
  );

  return sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);
}

// ─── Token account helpers ────────────────────────────────────────────────────

export async function getOrCreateTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);

  const info = await connection.getAccountInfo(ata);
  if (!info) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner,
        mint,
        TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
  }

  return ata;
}