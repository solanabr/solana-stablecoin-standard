import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  TransactionSignature,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  STABLECOIN_PROGRAM_ID,
} from "../types";
import { findRolePDA, findBlacklistPDA, findExtraAccountMetasPDA } from "../utils/pda";
import type { SolanaStablecoin } from "../stablecoin";

/**
 * Compliance operations module for SSS-2 stablecoins.
 * Provides blacklist management, asset seizure, and transfer hook setup.
 */
export class ComplianceModule {
  constructor(private readonly sdk: SolanaStablecoin) {}

  private assertComplianceEnabled(): void {
    if (!this.sdk.isComplianceEnabled()) {
      throw new Error(
        `Compliance features require SSS-2 preset. Current: ${this.sdk.preset}`
      );
    }
  }

  /**
   * Initialize the transfer hook's extra account metas PDA for this mint.
   *
   * MUST be called after creating an SSS-2 stablecoin to enable blacklist
   * enforcement on Token-2022 transfers. Without this, the transfer hook
   * cannot resolve the extra accounts needed for blacklist checks.
   *
   * Called automatically by SolanaStablecoin.create() for SSS-2 presets.
   * Can also be called manually via CLI: `sss-token init-hook --mint <ADDRESS>`
   */
  async initializeTransferHook(): Promise<TransactionSignature> {
    this.assertComplianceEnabled();

    const [extraMetasPDA] = findExtraAccountMetasPDA(this.sdk.mint);
    const wallet = this.sdk.provider.wallet.publicKey;

    // Anchor discriminator for "initialize_extra_account_metas"
    // = sha256("global:initialize_extra_account_metas")[..8]
    const discriminator = Buffer.from([
      43, 34, 13, 49, 167, 88, 235, 235,
    ]);

    const keys = [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: extraMetasPDA, isSigner: false, isWritable: true },
      { pubkey: this.sdk.mint, isSigner: false, isWritable: false },
      { pubkey: STABLECOIN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const ix = new TransactionInstruction({
      programId: TRANSFER_HOOK_PROGRAM_ID,
      keys,
      data: discriminator,
    });

    const tx = new Transaction().add(ix);
    return this.sdk.provider.sendAndConfirm(tx);
  }

  /**
   * Add an address to the blacklist.
   * Caller must have the BLACKLISTER role.
   */
  async addToBlacklist(
    address: PublicKey,
    reason: string = ""
  ): Promise<TransactionSignature> {
    this.assertComplianceEnabled();

    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    const [blacklistPDA] = findBlacklistPDA(this.sdk.mint, address);

    return this.sdk.program.methods
      .addToBlacklist(address, reason)
      .accounts({
        blacklister: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        blacklistEntry: blacklistPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Remove an address from the blacklist.
   * Caller must have the BLACKLISTER role.
   */
  async removeFromBlacklist(address: PublicKey): Promise<TransactionSignature> {
    this.assertComplianceEnabled();

    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    const [blacklistPDA] = findBlacklistPDA(this.sdk.mint, address);

    return this.sdk.program.methods
      .removeFromBlacklist(address)
      .accounts({
        blacklister: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        blacklistEntry: blacklistPDA,
      })
      .rpc();
  }

  /**
   * Seize tokens from a blacklisted account using the permanent delegate.
   * Caller must have the SEIZER role.
   *
   * SECURITY: The on-chain program verifies that the source token account
   * is owned by the blacklisted wallet address.
   */
  async seize(
    source: PublicKey,
    destination: PublicKey,
    amount: bigint,
    blacklistedAddress: PublicKey
  ): Promise<TransactionSignature> {
    this.assertComplianceEnabled();

    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    const [blacklistPDA] = findBlacklistPDA(this.sdk.mint, blacklistedAddress);

    return this.sdk.program.methods
      .seize(new BN(amount.toString()))
      .accounts({
        seizer: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        blacklistEntry: blacklistPDA,
        mint: this.sdk.mint,
        source,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async isBlacklisted(address: PublicKey): Promise<boolean> {
    this.assertComplianceEnabled();
    const [blacklistPDA] = findBlacklistPDA(this.sdk.mint, address);
    try {
      await this.sdk.program.account.blacklistEntry.fetch(blacklistPDA);
      return true;
    } catch {
      return false;
    }
  }

  async getBlacklistEntry(address: PublicKey): Promise<{
    address: PublicKey;
    addedBy: PublicKey;
    createdAt: bigint;
    reason: string;
  } | null> {
    this.assertComplianceEnabled();
    const [blacklistPDA] = findBlacklistPDA(this.sdk.mint, address);
    try {
      const entry = await this.sdk.program.account.blacklistEntry.fetch(blacklistPDA);
      return {
        address: entry.address,
        addedBy: entry.addedBy,
        createdAt: BigInt(entry.createdAt.toString()),
        reason: Buffer.from(entry.reason).toString("utf8").replace(/\0/g, ""),
      };
    } catch {
      return null;
    }
  }
}
