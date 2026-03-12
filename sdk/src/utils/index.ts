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
  tokenMetadataInitializeWithRentTransfer,
  setAuthority,
  AuthorityType,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL"
);

// Transfer hook program ID — SSS-2 blacklist enforcement
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V"
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

export function findHookStatePDA(mintPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hook-state"), mintPubkey.toBuffer()],
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
  /** On-chain token name (required) */
  name: string;
  /** On-chain token symbol (required) */
  symbol: string;
  /** Optional URI pointing to off-chain metadata JSON */
  uri?: string;
}

/**
 * Creates a Token-2022 mint with all required extensions and on-chain metadata.
 * Sends three transactions:
 *   1. Create account + fixed extension inits + InitializeMint (payer as temp authority)
 *   2. TokenMetadata init via reallocate + metadata write
 *   3. SetAuthority — transfers MintTokens authority from payer to mint_authority PDA
 *
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
    name,
    symbol,
    uri,
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

  // Allocate only the fixed-extension size. Token-2022 will reject InitializeMint
  // if the account has extra trailing bytes it doesn't recognise as extension data.
  // The variable-length TokenMetadata extension is added in a second transaction
  // via tokenMetadataInitializeWithRentTransfer, which calls reallocate internally.
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
    // Use payer as the temporary mint authority so it can sign the metadata init
    // in the second transaction. The SSS-token program's `initialize` will
    // transfer mint authority to the PDA via set_authority CPI.
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      freezeAuthority,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);

  // Second transaction: reallocate the account to fit the metadata, transfer the
  // extra rent lamports, and write the TokenMetadata extension in one call.
  // - mintAuthority (payer) must sign because the mint's current authority is payer.
  // - updateAuthority is set to the PDA so future metadata updates must go through
  //   the SSS-token program, which can sign for the PDA via CPI.
  await tokenMetadataInitializeWithRentTransfer(
    connection,
    payer,            // payer of extra rent
    mintKeypair.publicKey,
    mintAuthority,    // updateAuthority = PDA
    payer,            // mintAuthority signer (currently payer.publicKey)
    name,
    symbol,
    uri ?? "",
    undefined,        // multiSigners
    undefined,        // confirmOptions
    TOKEN_2022_PROGRAM_ID
  );

  // Third transaction: transfer MintTokens authority from payer back to the
  // mint_authority PDA. Payer was used as a temporary signer so it could
  // satisfy the metadata init requirement; the PDA is the intended long-term
  // authority that the SSS-token program uses via CPI with seeds.
  return setAuthority(
    connection,
    payer,                    // fee payer
    mintKeypair.publicKey,    // the mint
    payer,                    // current authority (payer.publicKey)
    AuthorityType.MintTokens,
    mintAuthority,            // new authority = mint_authority PDA
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
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