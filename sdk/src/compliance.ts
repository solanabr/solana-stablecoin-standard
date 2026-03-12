import * as anchor from "@coral-xyz/anchor";
import { BN, Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, addExtraAccountMetasForExecute } from "@solana/spl-token";

import { SSS_CORE_PROGRAM_ID, SSS_HOOK_PROGRAM_ID } from "./constants";
import {
  findConfigPda,
  findMintAuthorityPda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
} from "./pda";
import { BlacklistEntry, HookConfig } from "./types";
import { StablecoinClient } from "./client";

import { SssHook } from "./idl/sss_hook";
import sssHookIdl from "./idl/sss_hook";

/**
 * ComplianceClient — extends StablecoinClient with SSS-2 hook operations.
 *
 * Provides typed methods for every instruction in the sss-hook program:
 * initializeHook, addToBlacklist, removeFromBlacklist, and query helpers
 * isBlacklisted / getBlacklistEntry.
 */
export class ComplianceClient extends StablecoinClient {
  protected readonly hookProgramId: PublicKey;
  private _hookProgram?: Program<SssHook>;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey = SSS_CORE_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_HOOK_PROGRAM_ID
  ) {
    super(connection, wallet, programId);
    this.hookProgramId = hookProgramId;
  }

  /**
   * Returns a cached Anchor Program instance for the sss-hook program.
   */
  private getHookProgram(): Program<SssHook> {
    if (!this._hookProgram) {
      this._hookProgram = new Program<SssHook>(sssHookIdl as SssHook, this.provider);
    }
    return this._hookProgram;
  }

  /**
   * Initialize the transfer hook for an SSS-2 stablecoin.
   *
   * Creates the HookConfig and ExtraAccountMetaList PDAs. Must be called
   * after initialize() and before the mint begins circulating.
   *
   * @param mint  The stablecoin mint address.
   * @returns     Transaction signature.
   */
  async initializeHook(mint: PublicKey): Promise<string> {
    try {
      const hookProgram = this.getHookProgram();
      const [stablecoinConfig] = findConfigPda(mint, this.programId);
      const [hookConfig] = findHookConfigPda(mint, this.hookProgramId);
      const [extraAccountMetaList] = findExtraAccountMetaListPda(
        mint,
        this.hookProgramId
      );

      return await hookProgram.methods
        .initializeHook()
        .accountsPartial({
          authority: this.wallet.publicKey,
          mint,
          stablecoinConfig,
          hookConfig,
          extraAccountMetaList,
          coreProgram: this.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to initialize hook for mint ${mint.toBase58()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Add a wallet to the blacklist for a given stablecoin mint.
   *
   * Only callable by the blacklister role. Creates the BlacklistEntry PDA if
   * it does not yet exist.
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet address to blacklist.
   * @param reason  Human-readable reason (max 200 characters).
   * @returns       Transaction signature.
   */
  async addToBlacklist(
    mint: PublicKey,
    wallet: PublicKey,
    reason: string
  ): Promise<string> {
    try {
      const hookProgram = this.getHookProgram();
      const [stablecoinConfig] = findConfigPda(mint, this.programId);
      const [blacklistEntry] = findBlacklistEntryPda(
        mint,
        wallet,
        this.hookProgramId
      );

      return await hookProgram.methods
        .addToBlacklist(wallet, reason)
        .accountsPartial({
          blacklister: this.wallet.publicKey,
          mint,
          stablecoinConfig,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to add wallet ${wallet.toBase58()} to blacklist: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Remove a wallet from the blacklist for a given stablecoin mint.
   *
   * Only callable by the blacklister role.
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet address to remove from the blacklist.
   * @returns       Transaction signature.
   */
  async removeFromBlacklist(
    mint: PublicKey,
    wallet: PublicKey
  ): Promise<string> {
    try {
      const hookProgram = this.getHookProgram();
      const [stablecoinConfig] = findConfigPda(mint, this.programId);
      const [blacklistEntry] = findBlacklistEntryPda(
        mint,
        wallet,
        this.hookProgramId
      );

      return await hookProgram.methods
        .removeFromBlacklist()
        .accountsPartial({
          blacklister: this.wallet.publicKey,
          mint,
          stablecoinConfig,
          blacklistEntry,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to remove wallet ${wallet.toBase58()} from blacklist: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Seize tokens from a source account using the permanent delegate (SSS-2 only).
   *
   * Overrides the base class to resolve transfer hook extra accounts automatically.
   * The hook program's ExtraAccountMetaList is read on-chain and the required
   * accounts are appended as remainingAccounts so Token-2022's transfer_checked
   * can invoke the transfer hook correctly.
   *
   * @param mint                     The stablecoin mint address.
   * @param sourceTokenAccount       The account to seize tokens from.
   * @param destinationTokenAccount  The account that receives the seized tokens.
   * @param amount                   Amount to seize (in base units).
   * @returns                        Transaction signature.
   */
  async seize(
    mint: PublicKey,
    sourceTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    amount: BN
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

      // Build a placeholder transfer instruction to resolve hook extra accounts.
      // addExtraAccountMetasForExecute reads the on-chain ExtraAccountMetaList
      // and appends the resolved accounts to the instruction's keys.
      const transferIx = new TransactionInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        keys: [
          { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
          { pubkey: mintAuthority, isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(0),
      });

      await addExtraAccountMetasForExecute(
        this.connection,
        transferIx,
        this.hookProgramId,
        sourceTokenAccount,
        mint,
        destinationTokenAccount,
        mintAuthority,
        BigInt(amount.toString()),
      );

      // Extract hook remaining accounts (everything after the 4 base accounts)
      const hookRemainingAccounts = transferIx.keys.slice(4).map(k => ({
        pubkey: k.pubkey,
        isSigner: false,
        isWritable: k.isWritable,
      }));

      return await program.methods
        .seize(amount)
        .accountsPartial({
          authority: this.wallet.publicKey,
          config,
          mint,
          sourceTokenAccount,
          destinationTokenAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts(hookRemainingAccounts)
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to seize tokens: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Check whether a wallet is currently blacklisted for a given mint.
   *
   * Returns false if the BlacklistEntry PDA does not exist (i.e., the wallet
   * has never been blacklisted).
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet address to check.
   * @returns       True if the wallet is actively blacklisted, false otherwise.
   */
  async isBlacklisted(mint: PublicKey, wallet: PublicKey): Promise<boolean> {
    const entry = await this.getBlacklistEntry(mint, wallet);
    return entry !== null && entry.blacklisted;
  }

  /**
   * Fetch the full BlacklistEntry for a wallet, or null if none exists.
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet address to look up.
   * @returns       The deserialized BlacklistEntry, or null if not found.
   */
  async getBlacklistEntry(
    mint: PublicKey,
    wallet: PublicKey
  ): Promise<BlacklistEntry | null> {
    try {
      const hookProgram = this.getHookProgram();
      const [blacklistEntry] = findBlacklistEntryPda(
        mint,
        wallet,
        this.hookProgramId
      );

      const account =
        await hookProgram.account.blacklistEntry.fetchNullable(blacklistEntry);

      if (account === null) {
        return null;
      }

      return account as unknown as BlacklistEntry;
    } catch (err) {
      throw new Error(
        `Failed to fetch blacklist entry for wallet ${wallet.toBase58()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Fetch the HookConfig account for a given mint.
   *
   * @param mint  The stablecoin mint address.
   * @returns     The deserialized HookConfig, or null if not initialized.
   */
  async getHookConfig(mint: PublicKey): Promise<HookConfig | null> {
    try {
      const hookProgram = this.getHookProgram();
      const [hookConfig] = findHookConfigPda(mint, this.hookProgramId);

      const account =
        await hookProgram.account.hookConfig.fetchNullable(hookConfig);

      if (account === null) {
        return null;
      }

      return account as unknown as HookConfig;
    } catch (err) {
      throw new Error(
        `Failed to fetch hook config for mint ${mint.toBase58()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}
