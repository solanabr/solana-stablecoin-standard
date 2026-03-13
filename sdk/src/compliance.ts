/**
 * Compliance module for SSS-2 stablecoin operations.
 *
 * Provides blacklisting, seizure, and compliance query capabilities.
 * These operations only work if the stablecoin was initialized with
 * `enablePermanentDelegate: true` and `enableTransferHook: true`.
 *
 * @example
 * ```typescript
 * // Access via the client's compliance namespace
 * await stable.compliance.blacklistAdd(address, "Sanctions match");
 * await stable.compliance.seize(frozenAccount, treasury);
 *
 * // Check status
 * const isBlocked = await stable.compliance.isBlacklisted(address);
 * ```
 *
 * @module compliance
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import type { Wallet } from "@coral-xyz/anchor";
import type { BlacklistEntry, ComplianceModule } from "./types";
import { deriveBlacklistPda } from "./constants";
import { fetchBlacklistEntry } from "./accounts";

/**
 * Internal context passed from the parent {@link SolanaStablecoin} client.
 * @internal
 */
export interface ComplianceContext {
  connection: Connection;
  wallet: Wallet;
  programId: PublicKey;
  mintAddress: PublicKey;
  configPda: PublicKey;
  rolesPda: PublicKey;
  buildInstruction: (
    methodName: string,
    args: Record<string, unknown>,
    accounts: Record<string, PublicKey>
  ) => TransactionInstruction;
}

/**
 * Compliance manager implementing the SSS-2 blacklist and seizure operations.
 *
 * This class is not instantiated directly — it's created by the
 * {@link SolanaStablecoin} client and exposed as `stable.compliance`.
 *
 * ## SSS-2 Only
 *
 * All methods in this module require the stablecoin to have been initialized
 * with compliance features enabled (`enablePermanentDelegate` + `enableTransferHook`).
 * Calling these on an SSS-1 token will fail gracefully with `ComplianceNotEnabled`.
 */
export class ComplianceManager implements ComplianceModule {
  /** @internal */
  private readonly ctx: ComplianceContext;

  /** @internal */
  constructor(ctx: ComplianceContext) {
    this.ctx = ctx;
  }

  /**
   * Add an address to the blacklist.
   *
   * Creates a blacklist PDA on-chain. The signer must be the designated
   * blacklister or the master authority.
   *
   * @param address - The address to blacklist
   * @param reason - Human-readable reason (max 128 chars)
   * @returns Transaction signature
   * @throws `AlreadyBlacklisted` if the address is already on the blacklist
   * @throws `ComplianceNotEnabled` if SSS-2 features are not enabled
   *
   * @example
   * ```typescript
   * await stable.compliance.blacklistAdd(suspectAddress, "OFAC match");
   * ```
   */
  async blacklistAdd(address: PublicKey, reason: string): Promise<string> {
    const [blacklistPda] = deriveBlacklistPda(
      this.ctx.configPda,
      address,
      this.ctx.programId
    );

    const ix = this.ctx.buildInstruction("add_to_blacklist", { reason }, {
      blacklister: this.ctx.wallet.publicKey,
      config: this.ctx.configPda,
      roleManager: this.ctx.rolesPda,
      blacklistEntry: blacklistPda,
      addressToBlacklist: address,
      systemProgram: SystemProgram.programId,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.ctx.connection, tx, [this.ctx.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Remove an address from the blacklist.
   *
   * Closes the blacklist PDA and reclaims rent to the blacklister.
   *
   * @param address - The address to remove from the blacklist
   * @returns Transaction signature
   * @throws `NotBlacklisted` if the address is not on the blacklist
   *
   * @example
   * ```typescript
   * await stable.compliance.blacklistRemove(clearedAddress);
   * ```
   */
  async blacklistRemove(address: PublicKey): Promise<string> {
    const [blacklistPda] = deriveBlacklistPda(
      this.ctx.configPda,
      address,
      this.ctx.programId
    );

    const ix = this.ctx.buildInstruction("remove_from_blacklist", {}, {
      blacklister: this.ctx.wallet.publicKey,
      config: this.ctx.configPda,
      roleManager: this.ctx.rolesPda,
      blacklistEntry: blacklistPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.ctx.connection, tx, [this.ctx.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Seize tokens from a frozen, blacklisted account.
   *
   * Uses the permanent delegate authority to transfer all tokens
   * from the target account to the treasury. The on-chain program
   * handles the thaw → transfer → re-freeze flow automatically.
   *
   * @param from - The wallet whose tokens to seize
   * @param treasury - The wallet to receive seized tokens
   * @returns Transaction signature
   * @throws `ComplianceNotEnabled` if permanent delegate is not enabled
   * @throws `AccountNotFrozen` if the target account is not frozen
   *
   * @example
   * ```typescript
   * // Full seize flow
   * await stable.compliance.blacklistAdd(suspect, "Sanctions match");
   * await stable.freeze({ address: suspect });
   * await stable.compliance.seize(suspect, treasuryWallet);
   * ```
   */
  async seize(from: PublicKey, treasury: PublicKey): Promise<string> {
    const [blacklistPda] = deriveBlacklistPda(
      this.ctx.configPda,
      from,
      this.ctx.programId
    );

    const fromAta = getAssociatedTokenAddressSync(
      this.ctx.mintAddress, from, false, TOKEN_2022_PROGRAM_ID
    );
    const treasuryAta = getAssociatedTokenAddressSync(
      this.ctx.mintAddress, treasury, false, TOKEN_2022_PROGRAM_ID
    );

    const ix = this.ctx.buildInstruction("seize", {}, {
      seizer: this.ctx.wallet.publicKey,
      config: this.ctx.configPda,
      roleManager: this.ctx.rolesPda,
      blacklistEntry: blacklistPda,
      mint: this.ctx.mintAddress,
      fromTokenAccount: fromAta,
      treasuryTokenAccount: treasuryAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.ctx.connection, tx, [this.ctx.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Check if an address is blacklisted.
   *
   * @param address - The address to check
   * @returns `true` if the address is on the blacklist
   *
   * @example
   * ```typescript
   * if (await stable.compliance.isBlacklisted(address)) {
   *   console.log("Address is blacklisted");
   * }
   * ```
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [blacklistPda] = deriveBlacklistPda(
      this.ctx.configPda,
      address,
      this.ctx.programId
    );
    const info = await this.ctx.connection.getAccountInfo(blacklistPda);
    return info !== null;
  }

  /**
   * Fetch the full blacklist entry for an address.
   *
   * @param address - The address to look up
   * @returns The blacklist entry, or `null` if not blacklisted
   *
   * @example
   * ```typescript
   * const entry = await stable.compliance.getBlacklistEntry(address);
   * if (entry) {
   *   console.log("Reason:", entry.reason);
   *   console.log("Blacklisted by:", entry.blacklistedBy.toBase58());
   * }
   * ```
   */
  async getBlacklistEntry(address: PublicKey): Promise<BlacklistEntry | null> {
    const [blacklistPda] = deriveBlacklistPda(
      this.ctx.configPda,
      address,
      this.ctx.programId
    );
    return fetchBlacklistEntry(this.ctx.connection, blacklistPda);
  }
}
