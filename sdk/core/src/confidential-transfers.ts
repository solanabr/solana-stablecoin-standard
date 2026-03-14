import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Connection,
  Keypair,
} from "@solana/web3.js";
import type { Program, AnchorProvider } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

/**
 * Confidential Transfers API for SSS-3 stablecoins.
 *
 * This module wraps the Token-2022 ConfidentialTransfer extension operations.
 * The ConfidentialTransferMint extension is initialized on-chain during
 * SSS-3 mint creation (in initialize.rs). This SDK provides client-side
 * helpers for the account-level CT operations:
 *
 *   1. Configure CT on a token account (enables CT for that account)
 *   2. Deposit tokens from normal balance into confidential balance
 *   3. Transfer tokens confidentially between CT-enabled accounts
 *   4. Apply pending balance (process incoming confidential transfers)
 *   5. Withdraw tokens from confidential balance back to normal balance
 *
 * NOTE: Full ZK proof generation for confidential transfers requires the
 * `@solana/spl-token-confidential-transfers` package or equivalent ElGamal
 * keypair management. This module provides the instruction-building helpers
 * and a simplified flow for the deposit/apply/withdraw cycle which does NOT
 * require ZK proofs (only the confidential transfer instruction itself needs
 * proofs).
 */

// ── Token-2022 Confidential Transfer instruction discriminators ──────────

// The ConfidentialTransfer extension uses TokenInstruction::ConfidentialTransferExtension (byte 27)
// followed by a sub-instruction byte.
const TOKEN_INSTRUCTION_CT_EXTENSION = 27;

/** Sub-instruction indices for ConfidentialTransferInstruction enum */
enum CTInstruction {
  InitializeMint = 0,
  UpdateMint = 1,
  ConfigureAccount = 2,
  ApproveAccount = 3,
  EmptyAccount = 4,
  Deposit = 5,
  Withdraw = 6,
  Transfer = 7,
  ApplyPendingBalance = 8,
  EnableConfidentialCredits = 9,
  DisableConfidentialCredits = 10,
  EnableNonConfidentialCredits = 11,
  DisableNonConfidentialCredits = 12,
}

export class ConfidentialTransfersApi {
  constructor(
    private program: Program,
    private mint: PublicKey,
    private configAddress: PublicKey,
  ) {}

  /**
   * Get the associated token address for an owner, using Token-2022
   */
  getATA(owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mint,
      owner,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }

  /**
   * Create an instruction to create a Token-2022 ATA
   */
  createATAInstruction(owner: PublicKey, payer: PublicKey): TransactionInstruction {
    const ata = this.getATA(owner);
    return createAssociatedTokenAccountInstruction(
      payer,
      ata,
      owner,
      this.mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
  }

  /**
   * Build a Deposit instruction for confidential transfers.
   *
   * Deposits tokens from the non-confidential (normal) balance of a token
   * account into its confidential (pending) balance. This does NOT require
   * ZK proofs — the amount is publicly visible during deposit.
   *
   * @param tokenAccount - The token account to deposit from
   * @param owner - The owner of the token account (signer)
   * @param amount - Amount to deposit (in token base units)
   * @param decimals - Token decimals
   */
  buildDepositInstruction(
    tokenAccount: PublicKey,
    owner: PublicKey,
    amount: bigint,
    decimals: number,
  ): TransactionInstruction {
    // Deposit instruction data layout:
    // [0]: TokenInstruction::ConfidentialTransferExtension (27)
    // [1]: CTInstruction::Deposit (5)
    // [2..10]: amount (u64 LE)
    // [10]: decimals (u8)
    const data = Buffer.alloc(11);
    data.writeUInt8(TOKEN_INSTRUCTION_CT_EXTENSION, 0);
    data.writeUInt8(CTInstruction.Deposit, 1);
    data.writeBigUInt64LE(amount, 2);
    data.writeUInt8(decimals, 10);

    return new TransactionInstruction({
      keys: [
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: this.mint, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data,
    });
  }

  /**
   * Build an ApplyPendingBalance instruction.
   *
   * Moves tokens from the pending confidential balance into the available
   * confidential balance. Must be called by the token account owner after
   * receiving confidential transfers or deposits.
   *
   * @param tokenAccount - The token account
   * @param owner - The owner of the token account (signer)
   * @param expectedPendingBalanceCreditCounter - Expected credit counter value
   * @param newDecryptableAvailableBalance - The new decryptable balance (AE ciphertext, 36 bytes)
   */
  buildApplyPendingBalanceInstruction(
    tokenAccount: PublicKey,
    owner: PublicKey,
    expectedPendingBalanceCreditCounter: bigint,
    newDecryptableAvailableBalance: Buffer,
  ): TransactionInstruction {
    // ApplyPendingBalance instruction data layout:
    // [0]: TokenInstruction::ConfidentialTransferExtension (27)
    // [1]: CTInstruction::ApplyPendingBalance (8)
    // [2..10]: expected_pending_balance_credit_counter (u64 LE)
    // [10..46]: new_decryptable_available_balance (AeCiphertext, 36 bytes)
    const data = Buffer.alloc(46);
    data.writeUInt8(TOKEN_INSTRUCTION_CT_EXTENSION, 0);
    data.writeUInt8(CTInstruction.ApplyPendingBalance, 1);
    data.writeBigUInt64LE(expectedPendingBalanceCreditCounter, 2);
    newDecryptableAvailableBalance.copy(data, 10, 0, 36);

    return new TransactionInstruction({
      keys: [
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data,
    });
  }

  /**
   * Build an EnableConfidentialCredits instruction.
   *
   * Enables the token account to receive confidential transfer credits.
   *
   * @param tokenAccount - The token account
   * @param owner - The owner of the token account (signer)
   */
  buildEnableConfidentialCreditsInstruction(
    tokenAccount: PublicKey,
    owner: PublicKey,
  ): TransactionInstruction {
    const data = Buffer.alloc(2);
    data.writeUInt8(TOKEN_INSTRUCTION_CT_EXTENSION, 0);
    data.writeUInt8(CTInstruction.EnableConfidentialCredits, 1);

    return new TransactionInstruction({
      keys: [
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data,
    });
  }

  /**
   * Build a DisableNonConfidentialCredits instruction.
   *
   * Prevents the token account from receiving non-confidential transfers,
   * forcing all incoming transfers to use the confidential transfer path.
   *
   * @param tokenAccount - The token account
   * @param owner - The owner of the token account (signer)
   */
  buildDisableNonConfidentialCreditsInstruction(
    tokenAccount: PublicKey,
    owner: PublicKey,
  ): TransactionInstruction {
    const data = Buffer.alloc(2);
    data.writeUInt8(TOKEN_INSTRUCTION_CT_EXTENSION, 0);
    data.writeUInt8(CTInstruction.DisableNonConfidentialCredits, 1);

    return new TransactionInstruction({
      keys: [
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data,
    });
  }

  /**
   * Build an EnableNonConfidentialCredits instruction.
   *
   * Allows the token account to receive non-confidential transfers again.
   *
   * @param tokenAccount - The token account
   * @param owner - The owner of the token account (signer)
   */
  buildEnableNonConfidentialCreditsInstruction(
    tokenAccount: PublicKey,
    owner: PublicKey,
  ): TransactionInstruction {
    const data = Buffer.alloc(2);
    data.writeUInt8(TOKEN_INSTRUCTION_CT_EXTENSION, 0);
    data.writeUInt8(CTInstruction.EnableNonConfidentialCredits, 1);

    return new TransactionInstruction({
      keys: [
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_2022_PROGRAM_ID,
      data,
    });
  }

  /**
   * Check if a mint has the ConfidentialTransferMint extension enabled.
   *
   * Reads the mint account data and checks for the CT extension type
   * in the TLV extension data.
   */
  async hasConfidentialTransferExtension(connection: Connection): Promise<boolean> {
    const mintInfo = await connection.getAccountInfo(this.mint);
    if (!mintInfo) return false;

    // Token-2022 mint base size is 82 bytes (Mint) + account type (1 byte)
    // Extensions start after the base mint data with TLV encoding
    // ExtensionType::ConfidentialTransferMint = 3
    const data = mintInfo.data;
    if (data.length <= 165) return false; // No extensions

    // Search for extension type 3 (ConfidentialTransferMint) in TLV data
    // TLV: type (2 bytes LE) | length (2 bytes LE) | value (length bytes)
    let offset = 165; // After mint base + account type byte
    while (offset + 4 <= data.length) {
      const extType = data.readUInt16LE(offset);
      const extLen = data.readUInt16LE(offset + 2);
      if (extType === 4) return true; // ConfidentialTransferMint
      offset += 4 + extLen;
    }
    return false;
  }
}
