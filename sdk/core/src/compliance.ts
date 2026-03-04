import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { BlacklistAddOptions, SeizeOptions, BlacklistEntryState } from "./types";
import { getBlacklistAddress } from "./pda";

export class ComplianceModule {
  private parent: any; // SolanaStablecoin — avoid circular import

  constructor(parent: any) {
    this.parent = parent;
  }

  /** Add an address to the blacklist (SSS-2 only) */
  async blacklistAdd(address: PublicKey, reason: string): Promise<string> {
    const authorityKey = (this.parent.program.provider as AnchorProvider).wallet.publicKey;
    const [blacklistEntry] = getBlacklistAddress(this.parent.mint, address);

    return await this.parent.program.methods
      .addToBlacklist(reason)
      .accounts({
        authority: authorityKey,
        config: this.parent.config,
        mint: this.parent.mint,
        target: address,
        blacklistEntry,
        systemProgram: { programId: "11111111111111111111111111111111" },
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Remove an address from the blacklist (SSS-2 only) */
  async blacklistRemove(address: PublicKey): Promise<string> {
    const authorityKey = (this.parent.program.provider as AnchorProvider).wallet.publicKey;
    const [blacklistEntry] = getBlacklistAddress(this.parent.mint, address);

    return await this.parent.program.methods
      .removeFromBlacklist()
      .accounts({
        authority: authorityKey,
        config: this.parent.config,
        mint: this.parent.mint,
        target: address,
        blacklistEntry,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Seize tokens from an account via permanent delegate (SSS-2 only) */
  async seize(options: SeizeOptions): Promise<string> {
    const authorityKey = (this.parent.program.provider as AnchorProvider).wallet.publicKey;

    return await this.parent.program.methods
      .seize(new BN(options.amount.toString()))
      .accounts({
        authority: authorityKey,
        config: this.parent.config,
        mint: this.parent.mint,
        fromTokenAccount: options.from,
        toTokenAccount: options.to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Check if an address is blacklisted */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [pda] = getBlacklistAddress(this.parent.mint, address);
    const info = await this.parent.connection.getAccountInfo(pda);
    if (!info) return false;
    try {
      const entry = await (this.parent.program.account as any)["blacklistEntry"].fetch(pda);
      return entry.active;
    } catch {
      return false;
    }
  }

  /** Get blacklist entry details */
  async getBlacklistEntry(address: PublicKey): Promise<BlacklistEntryState | null> {
    const [pda] = getBlacklistAddress(this.parent.mint, address);
    try {
      const entry = await (this.parent.program.account as any)["blacklistEntry"].fetch(pda);
      return {
        address: entry.address,
        mint: entry.mint,
        reason: entry.reason,
        blacklistedAt: entry.blacklistedAt,
        blacklistedBy: entry.blacklistedBy,
        active: entry.active,
        bump: entry.bump,
      };
    } catch {
      return null;
    }
  }
}
