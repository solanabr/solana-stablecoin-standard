import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import {
  findBlacklistEntryPDA,
  findPermanentDelegatePDA,
  getOrCreateTokenAccount,
} from "../utils";
import type { StablecoinSdkContext } from "../options";

export class ComplianceModule {
  constructor(
    private readonly sdk: StablecoinSdkContext,
    private readonly program: Program,
  ) {}

  private assertEnabled() {
    if (!this.sdk.config.enablePermanentDelegate) {
      throw new Error(
        "SSS-2 compliance is not enabled on this stablecoin. " +
          "Initialize with preset: Preset.SSS_2 to enable compliance features.",
      );
    }
  }

  async blacklistAdd(address: PublicKey, reason: string): Promise<string> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, address);
    return this.program.methods
      .addToBlacklist(reason)
      .accounts({
        authority: this.sdk.authority.publicKey,
        state: this.sdk.statePDA,
        target: address,
        blacklistEntry,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.sdk.authority])
      .rpc();
  }

  async blacklistRemove(address: PublicKey, reason: string): Promise<string> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, address);
    return this.program.methods
      .removeFromBlacklist(reason)
      .accounts({
        authority: this.sdk.authority.publicKey,
        state: this.sdk.statePDA,
        target: address,
        blacklistEntry,
      })
      .signers([this.sdk.authority])
      .rpc();
  }

  async isBlacklisted(address: PublicKey): Promise<boolean> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, address);
    const info = await this.sdk.connection.getAccountInfo(blacklistEntry);
    return info !== null && info.lamports > 0;
  }

  async seize(frozenAccount: PublicKey, treasury: PublicKey): Promise<string> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, frozenAccount);
    const [permanentDelegate] = findPermanentDelegatePDA(this.sdk.statePDA);

    const fromAta = await getOrCreateTokenAccount(
      this.sdk.connection,
      this.sdk.authority,
      this.sdk.mint,
      frozenAccount,
    );
    const toAta = await getOrCreateTokenAccount(
      this.sdk.connection,
      this.sdk.authority,
      this.sdk.mint,
      treasury,
    );

    const resolvedIx = await createTransferCheckedWithTransferHookInstruction(
      this.sdk.connection,
      fromAta,
      this.sdk.mint,
      toAta,
      permanentDelegate,
      BigInt(1),
      this.sdk.config.decimals,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const hookAccounts = resolvedIx.keys.slice(4).map((meta) => ({
      pubkey: meta.pubkey,
      isSigner: false,
      isWritable: meta.isWritable,
    }));

    return this.program.methods
      .seize()
      .accounts({
        authority: this.sdk.authority.publicKey,
        state: this.sdk.statePDA,
        mint: this.sdk.mint,
        targetWallet: frozenAccount,
        blacklistEntry,
        fromTokenAccount: fromAta,
        treasuryTokenAccount: toAta,
        permanentDelegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts(hookAccounts)
      .signers([this.sdk.authority])
      .rpc();
  }
}
