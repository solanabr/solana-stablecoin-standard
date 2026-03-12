import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { Program } from "@coral-xyz/anchor";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Program<any>;
import BN from "bn.js";

import type { BlacklistEntry } from "./types";
import { findBlacklistEntryPda, findStablecoinStatePda } from "./pda";

/**
 * Compliance module — SSS-2 only operations (blacklist + seize).
 * These methods fail gracefully if the stablecoin was not initialized with compliance enabled.
 */
export class ComplianceModule {
  constructor(
    private readonly program: AnyProgram,
    private readonly mint: PublicKey,
    private readonly statePda: PublicKey
  ) {}

  /**
   * Add an address to the blacklist. Requires blacklister role.
   */
  async blacklistAdd(
    blacklister: { publicKey: PublicKey },
    address: PublicKey,
    reason: string
  ): Promise<string> {
    const [entry] = findBlacklistEntryPda(this.mint, address);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.methods as any)
      .addToBlacklist(reason)
      .accounts({
        blacklister: blacklister.publicKey,
        stablecoinState: this.statePda,
        mint: this.mint,
        target: address,
        blacklistEntry: entry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Remove an address from the blacklist.
   */
  async blacklistRemove(
    blacklister: { publicKey: PublicKey },
    address: PublicKey
  ): Promise<string> {
    const [entry] = findBlacklistEntryPda(this.mint, address);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.methods as any)
      .removeFromBlacklist()
      .accounts({
        blacklister: blacklister.publicKey,
        stablecoinState: this.statePda,
        mint: this.mint,
        target: address,
        blacklistEntry: entry,
      })
      .rpc();
  }

  /**
   * Seize tokens from a frozen account via the permanent delegate.
   * Requires the seizer role.
   */
  async seize(
    seizer: { publicKey: PublicKey },
    frozenAccount: PublicKey,
    treasuryAccount: PublicKey,
    amount: bigint
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.program.methods as any)
      .seize(new BN(amount.toString()))
      .accounts({
        seizer: seizer.publicKey,
        stablecoinState: this.statePda,
        mint: this.mint,
        frozenAccount,
        treasuryAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Check if an address is blacklisted (off-chain lookup).
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [entry] = findBlacklistEntryPda(this.mint, address);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.program.account as any)["blacklistEntry"].fetch(entry);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch the blacklist entry for an address (null if not blacklisted).
   */
  async getBlacklistEntry(address: PublicKey): Promise<BlacklistEntry | null> {
    const [entry] = findBlacklistEntryPda(this.mint, address);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (this.program.account as any)["blacklistEntry"].fetch(entry);
      return raw as BlacklistEntry;
    } catch {
      return null;
    }
  }

  /**
   * Fetch all current blacklist entries for this mint.
   * Uses Anchor's filters — efficient for moderate list sizes.
   */
  async getAllBlacklisted(): Promise<Array<{ address: PublicKey; entry: BlacklistEntry }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = await (this.program.account as any)["blacklistEntry"].all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: this.mint.toBase58(),
        },
      },
    ]);

    return (entries as Array<{ account: unknown }>).map((e) => ({
      address: (e.account as BlacklistEntry).address,
      entry: e.account as BlacklistEntry,
    }));
  }
}
