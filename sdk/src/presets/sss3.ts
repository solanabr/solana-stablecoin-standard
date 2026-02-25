import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  pack,
  type TokenMetadata,
} from "@solana/spl-token-metadata";
import { deriveConfigPda } from "../pda";

export interface Sss3MintOptions {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  /** 32-byte ElGamal public key for the auditor. If omitted, a 32-byte zero key is used (demo/testing). */
  auditorElGamalPubkey?: Uint8Array;
  /** Whether new token accounts auto-approve for confidential transfers. Defaults to true. */
  autoApproveNewAccounts?: boolean;
}

/**
 * Build the InitializeConfidentialTransferMint instruction manually.
 *
 * The `@solana/spl-token` library knows the extension type and size
 * but does NOT provide an instruction builder for this operation.
 *
 * Instruction data layout (Pod / #[repr(C)] — fixed size, no tags):
 *   [27]       - ConfidentialTransferExtension discriminator
 *   [0]        - InitializeMint sub-instruction
 *   [32 bytes] - OptionalNonZeroPubkey authority (all zeros = None)
 *   [1 byte]   - PodBool auto_approve_new_accounts (0 or 1)
 *   [32 bytes] - OptionalNonZeroElGamalPubkey auditor (all zeros = None)
 *
 * Total: 2 + 32 + 1 + 32 = 67 bytes (always fixed)
 * Accounts: [mint (writable)]
 */
export function createInitializeConfidentialTransferMintInstruction(
  mint: PublicKey,
  authority: PublicKey | null,
  autoApproveNewAccounts: boolean,
  auditorElGamalPubkey: Uint8Array | null,
): TransactionInstruction {
  // Fixed-size Pod layout: 2 + 32 + 1 + 32 = 67 bytes
  const data = Buffer.alloc(67);

  let offset = 0;

  // Discriminator: ConfidentialTransferExtension = 27
  data.writeUInt8(27, offset);
  offset += 1;

  // Sub-instruction: InitializeMint = 0
  data.writeUInt8(0, offset);
  offset += 1;

  // OptionalNonZeroPubkey authority (32 bytes, zeros = None)
  if (authority) {
    authority.toBuffer().copy(data, offset);
  }
  // else: already zeros from Buffer.alloc
  offset += 32;

  // PodBool auto_approve_new_accounts (1 byte)
  data.writeUInt8(autoApproveNewAccounts ? 1 : 0, offset);
  offset += 1;

  // OptionalNonZeroElGamalPubkey auditor (32 bytes, zeros = None)
  if (auditorElGamalPubkey) {
    if (auditorElGamalPubkey.length !== 32) {
      throw new Error(
        `Auditor ElGamal pubkey must be 32 bytes, got ${auditorElGamalPubkey.length}`,
      );
    }
    Buffer.from(auditorElGamalPubkey).copy(data, offset);
  }
  // else: already zeros from Buffer.alloc
  offset += 32;

  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data,
  });
}

/**
 * Build a transaction that creates a Token-2022 mint for SSS-3 (Confidential preset).
 *
 * Extensions: MetadataPointer, PermanentDelegate, ConfidentialTransferMint
 * Metadata: on-chain Token Metadata
 *
 * SSS-3 uses the ConfidentialTransferMint extension for privacy-preserving
 * transfers with an auditor key for regulatory compliance. Transfer hooks
 * are intentionally excluded because they are incompatible with confidential
 * transfers in Token-2022.
 *
 * The config PDA acts as mint authority, freeze authority, permanent delegate,
 * and confidential transfer mint authority.
 */
export async function createSss3MintTransaction(
  connection: Connection,
  payer: PublicKey,
  mintKeypair: Keypair,
  options: Sss3MintOptions,
  coreProgramId: PublicKey,
): Promise<Transaction> {
  const [configPda] = deriveConfigPda(mintKeypair.publicKey, coreProgramId);
  const decimals = options.decimals ?? 6;
  const autoApprove = options.autoApproveNewAccounts ?? true;

  // Use provided auditor key or a 32-byte zero key for demo/testing
  const auditorKey = options.auditorElGamalPubkey ?? new Uint8Array(32);

  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
    ExtensionType.ConfidentialTransferMint,
  ];
  const mintLen = getMintLen(extensions);

  const metadata: TokenMetadata = {
    mint: mintKeypair.publicKey,
    name: options.name,
    symbol: options.symbol,
    uri: options.uri ?? "",
    additionalMetadata: [],
    updateAuthority: configPda,
  };
  const metadataLen = pack(metadata).length;
  const totalLen = mintLen + metadataLen;

  const lamports =
    await connection.getMinimumBalanceForRentExemption(totalLen);

  const tx = new Transaction().add(
    // 1. Create the mint account
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // 2. Initialize MetadataPointer (config PDA as authority, mint as metadata address)
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      configPda,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    // 3. Initialize PermanentDelegate (config PDA)
    createInitializePermanentDelegateInstruction(
      mintKeypair.publicKey,
      configPda,
      TOKEN_2022_PROGRAM_ID,
    ),
    // 4. Initialize ConfidentialTransferMint (config PDA as authority, auditor key)
    createInitializeConfidentialTransferMintInstruction(
      mintKeypair.publicKey,
      configPda, // confidential transfer mint authority
      autoApprove,
      auditorKey,
    ),
    // 5. Initialize the mint itself (must come AFTER all extension inits)
    createInitializeMint2Instruction(
      mintKeypair.publicKey,
      decimals,
      configPda, // mint authority = config PDA
      configPda, // freeze authority = config PDA
      TOKEN_2022_PROGRAM_ID,
    ),
    // 6. Initialize on-chain token metadata
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: mintKeypair.publicKey,
      metadata: mintKeypair.publicKey,
      name: options.name,
      symbol: options.symbol,
      uri: options.uri ?? "",
      mintAuthority: configPda,
      updateAuthority: configPda,
    }),
  );

  return tx;
}
