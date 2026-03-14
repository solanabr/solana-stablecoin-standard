import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { Program, AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";

import {
  getRoleAddress,
  getQuotaAddress,
  ROLE_MINTER,
} from "./pda";
import type { RoleInfo, QuotaInfo } from "./types";

export class RolesApi {
  constructor(
    private program: Program,
    private configAddress: PublicKey,
  ) {}

  async grantRole(role: number, holder: PublicKey): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;
    const [roleAssignment] = getRoleAddress(
      this.program.programId,
      role,
      this.configAddress,
      holder,
    );

    return this.program.methods
      .grantRole(role, holder)
      .accountsPartial({
        authority,
        config: this.configAddress,
        roleAssignment,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async revokeRole(role: number, holder: PublicKey): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;
    const [roleAssignment] = getRoleAddress(
      this.program.programId,
      role,
      this.configAddress,
      holder,
    );

    return this.program.methods
      .revokeRole(role, holder)
      .accountsPartial({
        authority,
        config: this.configAddress,
        roleAssignment,
      })
      .rpc();
  }

  async setQuota(minter: PublicKey, quotaLimit: BN): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;
    const [minterRole] = getRoleAddress(
      this.program.programId,
      ROLE_MINTER,
      this.configAddress,
      minter,
    );
    const [minterQuota] = getQuotaAddress(
      this.program.programId,
      this.configAddress,
      minter,
    );

    return this.program.methods
      .setQuota(minter, quotaLimit)
      .accountsPartial({
        authority,
        config: this.configAddress,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async hasRole(role: number, holder: PublicKey): Promise<boolean> {
    const [roleAssignment] = getRoleAddress(
      this.program.programId,
      role,
      this.configAddress,
      holder,
    );
    try {
      const account = await this.program.account.roleAssignment.fetch(roleAssignment);
      return account.active as boolean;
    } catch {
      return false;
    }
  }

  async getQuota(minter: PublicKey): Promise<QuotaInfo | null> {
    const [quotaAddress] = getQuotaAddress(
      this.program.programId,
      this.configAddress,
      minter,
    );
    try {
      const account = await this.program.account.minterQuota.fetch(quotaAddress);
      return {
        config: account.config,
        minter: account.minter,
        quotaLimit: account.quotaLimit,
        mintedAmount: account.mintedAmount,
      };
    } catch {
      return null;
    }
  }
}
