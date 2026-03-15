import { BN } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature, SystemProgram } from "@solana/web3.js";
import { Role, RoleAction, ROLE_BITS } from "../types";
import { findRolePDA } from "../utils/pda";
import type { SolanaStablecoin } from "../stablecoin";

/**
 * Role management module.
 * Only the master authority can grant or revoke roles.
 */
export class RoleManager {
  constructor(private readonly sdk: SolanaStablecoin) {}

  /**
   * Grant a role to an address.
   */
  async grant(
    holder: PublicKey,
    role: Role,
    mintQuota?: bigint
  ): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, holder);

    // Map role enum to Anchor enum object (camelCase first letter lowercase)
    const roleObj = { [role.charAt(0).toLowerCase() + role.slice(1)]: {} };

    const params = {
      role: roleObj,
      action: { grant: {} },
      mintQuota: mintQuota ? new BN(mintQuota.toString()) : null,
    };

    return (this.sdk.program.methods as any)
      .manageRole(params)
      .accounts({
        authority: wallet,
        config: this.sdk.configPDA,
        roleHolder: holder,
        roleAssignment: rolePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Revoke a role from an address.
   */
  async revoke(
    holder: PublicKey,
    role: Role
  ): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, holder);

    const roleObj = { [role.charAt(0).toLowerCase() + role.slice(1)]: {} };

    const params = {
      role: roleObj,
      action: { revoke: {} },
      mintQuota: null,
    };

    return (this.sdk.program.methods as any)
      .manageRole(params)
      .accounts({
        authority: wallet,
        config: this.sdk.configPDA,
        roleHolder: holder,
        roleAssignment: rolePDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async transferAuthority(newAuthority: PublicKey): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    return (this.sdk.program.methods as any)
      .transferAuthority(newAuthority)
      .accounts({
        authority: wallet,
        config: this.sdk.configPDA,
      })
      .rpc();
  }

  async getRoles(holder: PublicKey): Promise<{
    isMinter: boolean;
    isBurner: boolean;
    isPauser: boolean;
    isBlacklister: boolean;
    isSeizer: boolean;
    mintQuota: bigint;
    mintedAmount: bigint;
  } | null> {
    const [rolePDA] = findRolePDA(this.sdk.configPDA, holder);
    try {
      const assignment = await (this.sdk.program.account as any).roleAssignment.fetch(rolePDA);
      const mask = assignment.roleMask;
      return {
        isMinter: (mask & ROLE_BITS[Role.Minter]) !== 0,
        isBurner: (mask & ROLE_BITS[Role.Burner]) !== 0,
        isPauser: (mask & ROLE_BITS[Role.Pauser]) !== 0,
        isBlacklister: (mask & ROLE_BITS[Role.Blacklister]) !== 0,
        isSeizer: (mask & ROLE_BITS[Role.Seizer]) !== 0,
        mintQuota: BigInt(assignment.mintQuota.toString()),
        mintedAmount: BigInt(assignment.mintedAmount.toString()),
      };
    } catch {
      return null;
    }
  }

  async hasRole(holder: PublicKey, role: Role): Promise<boolean> {
    const roles = await this.getRoles(holder);
    if (!roles) return false;
    switch (role) {
      case Role.Minter: return roles.isMinter;
      case Role.Burner: return roles.isBurner;
      case Role.Pauser: return roles.isPauser;
      case Role.Blacklister: return roles.isBlacklister;
      case Role.Seizer: return roles.isSeizer;
    }
  }
}
