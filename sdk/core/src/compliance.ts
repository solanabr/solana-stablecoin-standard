import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { Program, AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";

import {
  getBlacklistAddress,
  getAllowlistAddress,
  getRoleAddress,
  getConfigAddress,
  ROLE_BLACKLISTER,
  ROLE_SEIZER,
} from "./pda";
import type { SeizeParams } from "./types";

export class ComplianceApi {
  constructor(
    private program: Program,
    private mint: PublicKey,
    private configAddress: PublicKey,
  ) {}

  async addToBlacklist(address: PublicKey, reason: string = ""): Promise<string> {
    const blacklister = (this.program.provider as AnchorProvider).publicKey;
    const [blacklisterRole] = getRoleAddress(
      this.program.programId,
      ROLE_BLACKLISTER,
      this.configAddress,
      blacklister,
    );
    const [blacklistEntry] = getBlacklistAddress(
      this.program.programId,
      this.configAddress,
      address,
    );

    return this.program.methods
      .addToBlacklist(address, reason)
      .accountsPartial({
        blacklister,
        config: this.configAddress,
        blacklisterRole,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async removeFromBlacklist(address: PublicKey): Promise<string> {
    const blacklister = (this.program.provider as AnchorProvider).publicKey;
    const [blacklisterRole] = getRoleAddress(
      this.program.programId,
      ROLE_BLACKLISTER,
      this.configAddress,
      blacklister,
    );
    const [blacklistEntry] = getBlacklistAddress(
      this.program.programId,
      this.configAddress,
      address,
    );

    return this.program.methods
      .removeFromBlacklist(address)
      .accountsPartial({
        blacklister,
        config: this.configAddress,
        blacklisterRole,
        blacklistEntry,
      })
      .rpc();
  }

  /** Atomic seize: thaw -> burn -> refreeze -> mint to treasury */
  async seize(params: SeizeParams & { targetOwner: PublicKey }): Promise<string> {
    const seizer = (this.program.provider as AnchorProvider).publicKey;
    const [seizerRole] = getRoleAddress(
      this.program.programId,
      ROLE_SEIZER,
      this.configAddress,
      seizer,
    );
    const [blacklistEntry] = getBlacklistAddress(
      this.program.programId,
      this.configAddress,
      params.targetOwner,
    );

    return this.program.methods
      .seize(params.amount)
      .accountsPartial({
        seizer,
        config: this.configAddress,
        seizerRole,
        blacklistEntry,
        targetOwner: params.targetOwner,
        mint: this.mint,
        sourceTokenAccount: params.from,
        treasuryTokenAccount: params.to,
        tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      })
      .rpc();
  }

  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [blacklistEntry] = getBlacklistAddress(
      this.program.programId,
      this.configAddress,
      address,
    );
    try {
      const account = await this.program.account.blacklistEntry.fetch(blacklistEntry);
      return account.active as boolean;
    } catch {
      return false;
    }
  }

  // --- SSS-3 Allowlist ---

  async allowlistAdd(address: PublicKey): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;
    const [allowlistEntry] = getAllowlistAddress(
      this.program.programId,
      this.configAddress,
      address,
    );

    return this.program.methods
      .addToAllowlist(address)
      .accountsPartial({
        authority,
        config: this.configAddress,
        allowlistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async allowlistRemove(address: PublicKey): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;
    const [allowlistEntry] = getAllowlistAddress(
      this.program.programId,
      this.configAddress,
      address,
    );

    return this.program.methods
      .removeFromAllowlist(address)
      .accountsPartial({
        authority,
        config: this.configAddress,
        allowlistEntry,
      })
      .rpc();
  }

  async isAllowlisted(address: PublicKey): Promise<boolean> {
    const [allowlistEntry] = getAllowlistAddress(
      this.program.programId,
      this.configAddress,
      address,
    );
    try {
      await this.program.account.allowlistEntry.fetch(allowlistEntry);
      return true;
    } catch {
      return false;
    }
  }
}
