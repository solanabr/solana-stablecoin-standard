import { PublicKey, Keypair, TransactionSignature } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";

import { BlacklistParams, SeizeParams } from "./types";

/**
 * SSS-2 compliance operations module.
 * Provides blacklist management, token seizure, and audit trail access.
 * All methods throw if the stablecoin was not initialized with SSS-2 compliance features.
 */
export class ComplianceModule {
  constructor(
    private program: Program,
    private stablecoinConfig: PublicKey,
    private mint: PublicKey,
    private isComplianceEnabled: boolean
  ) {}

  private ensureEnabled(): void {
    if (!this.isComplianceEnabled) {
      throw new Error(
        "Compliance module is not enabled. Initialize with SSS-2 preset or enable transfer hook."
      );
    }
  }

  /**
   * Derive the blacklist PDA for a given wallet address.
   */
  getBlacklistPDA(address: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        this.stablecoinConfig.toBuffer(),
        address.toBuffer(),
      ],
      this.program.programId
    );
  }

  /**
   * Check if an address is blacklisted.
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    this.ensureEnabled();
    const [blacklistPDA] = this.getBlacklistPDA(address);
    try {
      const account =
        await this.program.provider.connection.getAccountInfo(blacklistPDA);
      return account !== null;
    } catch {
      return false;
    }
  }

  /**
   * Add an address to the blacklist.
   */
  async blacklistAdd(
    params: BlacklistParams
  ): Promise<TransactionSignature> {
    this.ensureEnabled();
    const [blacklistPDA] = this.getBlacklistPDA(params.address);
    const [blacklisterRoles] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("roles"),
        this.stablecoinConfig.toBuffer(),
        params.blacklister.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    return this.program.methods
      .addToBlacklist(params.address, params.reason)
      .accounts({
        blacklister: params.blacklister.publicKey,
        stablecoinConfig: this.stablecoinConfig,
        blacklisterRoles,
        blacklistEntry: blacklistPDA,
        systemProgram: PublicKey.default,
      })
      .signers([params.blacklister])
      .rpc();
  }

  /**
   * Remove an address from the blacklist.
   */
  async blacklistRemove(
    address: PublicKey,
    blacklister: Keypair
  ): Promise<TransactionSignature> {
    this.ensureEnabled();
    const [blacklistPDA] = this.getBlacklistPDA(address);
    const [blacklisterRoles] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("roles"),
        this.stablecoinConfig.toBuffer(),
        blacklister.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    return this.program.methods
      .removeFromBlacklist(address)
      .accounts({
        blacklister: blacklister.publicKey,
        stablecoinConfig: this.stablecoinConfig,
        blacklisterRoles,
        blacklistEntry: blacklistPDA,
      })
      .signers([blacklister])
      .rpc();
  }

  /**
   * Seize all tokens from an account using the permanent delegate.
   */
  async seize(params: SeizeParams): Promise<TransactionSignature> {
    this.ensureEnabled();
    const [seizerRoles] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("roles"),
        this.stablecoinConfig.toBuffer(),
        params.seizer.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    const TOKEN_2022_PROGRAM_ID = new PublicKey(
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    );

    return this.program.methods
      .seize()
      .accounts({
        seizer: params.seizer.publicKey,
        stablecoinConfig: this.stablecoinConfig,
        seizerRoles,
        mint: this.mint,
        fromTokenAccount: params.fromTokenAccount,
        toTokenAccount: params.toTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([params.seizer])
      .rpc();
  }
}
