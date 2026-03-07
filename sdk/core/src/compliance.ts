import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import { findBlacklistPda, findConfigPda } from "./pda";
import { BlacklistEntryData, SeizeParams } from "./types";
import { NotBlacklistedError } from "./errors";

export class ComplianceModule {
  constructor(
    private readonly program: Program,
    private readonly mint: PublicKey,
    private readonly configPda: PublicKey,
    private readonly tokenProgramId: PublicKey
  ) {}

  /**
   * Add an address to the blacklist.
   * The transfer hook will block all transfers involving this address.
   */
  async blacklistAdd(
    address: PublicKey,
    reason: string,
    blacklister: Keypair
  ): Promise<string> {
    const [blacklistEntryPda] = findBlacklistPda(
      this.mint,
      address,
      this.program.programId
    );

    return this.program.methods
      .addToBlacklist(address, reason)
      .accounts({
        blacklister: blacklister.publicKey,
        config: this.configPda,
        blacklistEntry: blacklistEntryPda,
        systemProgram: PublicKey.default,
      })
      .signers([blacklister])
      .rpc();
  }

  /**
   * Remove an address from the blacklist.
   * Rent from the BlacklistEntry PDA is returned to the blacklister.
   */
  async blacklistRemove(
    address: PublicKey,
    blacklister: Keypair
  ): Promise<string> {
    const [blacklistEntryPda] = findBlacklistPda(
      this.mint,
      address,
      this.program.programId
    );

    return this.program.methods
      .removeFromBlacklist(address)
      .accounts({
        blacklister: blacklister.publicKey,
        config: this.configPda,
        blacklistEntry: blacklistEntryPda,
      })
      .signers([blacklister])
      .rpc();
  }

  /**
   * Check if an address is currently blacklisted.
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [pda] = findBlacklistPda(
      this.mint,
      address,
      this.program.programId
    );
    const info = await this.program.provider.connection.getAccountInfo(pda);
    return info !== null && info.data.length > 0;
  }

  /**
   * Get blacklist entry details.
   */
  async getBlacklistEntry(
    address: PublicKey
  ): Promise<BlacklistEntryData | null> {
    const [pda] = findBlacklistPda(
      this.mint,
      address,
      this.program.programId
    );
    try {
      const account = await (this.program.account as any).blacklistEntry.fetch(pda);
      return account as unknown as BlacklistEntryData;
    } catch {
      return null;
    }
  }

  /**
   * List all blacklisted addresses for this mint.
   */
  async listBlacklisted(): Promise<BlacklistEntryData[]> {
    const accounts = await (this.program.account as any).blacklistEntry.all([
      {
        memcmp: {
          offset: 8, // skip discriminator
          bytes: this.mint.toBase58(),
        },
      },
    ]);
    return accounts.map((a: any) => a.account as BlacklistEntryData);
  }

  /**
   * Seize tokens from an account using permanent delegate authority.
   * The config PDA is the registered permanent delegate; it signs via PDA seeds.
   */
  async seize(params: SeizeParams, seizer: Keypair): Promise<string> {
    const amount = new BN(params.amount.toString());

    return this.program.methods
      .seize(amount)
      .accounts({
        seizer: seizer.publicKey,
        config: this.configPda,
        mint: this.mint,
        fromTokenAccount: params.fromTokenAccount,
        toTokenAccount: params.toTokenAccount,
        tokenProgram: this.tokenProgramId,
      })
      .signers([seizer])
      .rpc();
  }
}
