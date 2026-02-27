import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SDKResult, MinterInfo } from "./types";
/**
 * Role Manager for RBAC operations
 */
export declare class RoleManager {
    private connection;
    private programId;
    constructor(connection: Connection, programId?: PublicKey);
    /**
     * Get role account PDA
     */
    getRolePDA(owner: PublicKey, mint: PublicKey): PublicKey;
    /**
     * Get minter info PDA
     */
    getMinterPDA(minter: PublicKey, mint: PublicKey): PublicKey;
    /**
     * Check if address has a specific role
     */
    hasRole(mint: PublicKey, address: PublicKey, role: number): Promise<boolean>;
    /**
     * Grant role to address
     */
    grantRole(params: {
        mint: PublicKey;
        authority: Keypair;
        target: PublicKey;
        role: number;
    }): Promise<SDKResult>;
    /**
     * Revoke role from address
     */
    revokeRole(params: {
        mint: PublicKey;
        authority: Keypair;
        target: PublicKey;
        role: number;
    }): Promise<SDKResult>;
    /**
     * Update all roles for an address
     */
    private updateRoles;
    /**
     * Get all roles for an address
     */
    getRoles(mint: PublicKey, address: PublicKey): Promise<number>;
    /**
     * Get human-readable role names
     */
    getRoleNames(roles: number): string[];
    /**
     * Set minter quota
     */
    setMinterQuota(params: {
        mint: PublicKey;
        authority: Keypair;
        minter: PublicKey;
        quota: BN;
    }): Promise<SDKResult>;
    /**
     * Get minter info
     */
    getMinterInfo(mint: PublicKey, minter: PublicKey): Promise<SDKResult<MinterInfo>>;
    /**
     * Get remaining quota for minter
     */
    getRemainingQuota(mint: PublicKey, minter: PublicKey): Promise<BN>;
    /**
     * Check if address is master
     */
    isMaster(mint: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Check if address is minter
     */
    isMinter(mint: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Check if address is burner
     */
    isBurner(mint: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Check if address is pauser
     */
    isPauser(mint: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Check if address is blacklister
     */
    isBlacklister(mint: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Check if address is seizer
     */
    isSeizer(mint: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Transfer master authority
     */
    transferMaster(params: {
        mint: PublicKey;
        currentAuthority: Keypair;
        newAuthority: PublicKey;
    }): Promise<SDKResult>;
}
//# sourceMappingURL=RoleManager.d.ts.map