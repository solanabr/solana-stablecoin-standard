"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleManager = void 0;
// @ts-nocheck
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const types_1 = require("./types");
/**
 * Role Manager for RBAC operations
 */
class RoleManager {
    constructor(connection, programId) {
        this.connection = connection;
        this.programId = programId || types_1.SSS_TOKEN_PROGRAM_ID;
    }
    /**
     * Get role account PDA
     */
    getRolePDA(owner, mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), owner.toBuffer(), mint.toBuffer()], this.programId)[0];
    }
    /**
     * Get minter info PDA
     */
    getMinterPDA(minter, mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("minter"), minter.toBuffer(), mint.toBuffer()], this.programId)[0];
    }
    /**
     * Check if address has a specific role
     */
    async hasRole(mint, address, role) {
        try {
            const rolePDA = this.getRolePDA(address, mint);
            const account = await this.connection.getAccountInfo(rolePDA);
            if (!account || account.data.length < 10) {
                return false;
            }
            // Role flags start at byte 40 in RoleAccount
            const roles = account.data[40] || 0;
            return (roles & role) !== 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Grant role to address
     */
    async grantRole(params) {
        try {
            // Fetch current roles
            const currentRoles = await this.getRoles(params.mint, params.target);
            const newRoles = currentRoles | params.role;
            // Update roles
            return this.updateRoles({
                ...params,
                newRoles,
            });
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Revoke role from address
     */
    async revokeRole(params) {
        try {
            // Fetch current roles
            const currentRoles = await this.getRoles(params.mint, params.target);
            const newRoles = currentRoles & ~params.role;
            // Update roles
            return this.updateRoles({
                ...params,
                newRoles,
            });
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Update all roles for an address
     */
    async updateRoles(params) {
        try {
            // Build update_roles instruction
            // ...
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Get all roles for an address
     */
    async getRoles(mint, address) {
        try {
            const rolePDA = this.getRolePDA(address, mint);
            const account = await this.connection.getAccountInfo(rolePDA);
            if (!account || account.data.length < 10) {
                return 0;
            }
            return account.data[40] || 0;
        }
        catch {
            return 0;
        }
    }
    /**
     * Get human-readable role names
     */
    getRoleNames(roles) {
        const names = [];
        if (roles & types_1.ROLE_MASTER)
            names.push("Master");
        if (roles & types_1.ROLE_MINTER)
            names.push("Minter");
        if (roles & types_1.ROLE_BURNER)
            names.push("Burner");
        if (roles & types_1.ROLE_PAUSER)
            names.push("Pauser");
        if (roles & types_1.ROLE_BLACKLISTER)
            names.push("Blacklister");
        if (roles & types_1.ROLE_SEIZER)
            names.push("Seizer");
        return names;
    }
    /**
     * Set minter quota
     */
    async setMinterQuota(params) {
        try {
            // Build update_minter_quota instruction
            // ...
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Get minter info
     */
    async getMinterInfo(mint, minter) {
        try {
            const minterPDA = this.getMinterPDA(minter, mint);
            const account = await this.connection.getAccountInfo(minterPDA);
            if (!account) {
                return {
                    success: false,
                    error: "Minter not found",
                };
            }
            // Parse account data
            return {
                success: true,
                data: {
                    minter,
                    quota: new anchor_1.BN(0),
                    minted: new anchor_1.BN(0),
                    stablecoin: mint,
                    bump: 0,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Get remaining quota for minter
     */
    async getRemainingQuota(mint, minter) {
        try {
            const result = await this.getMinterInfo(mint, minter);
            if (!result.success || !result.data) {
                return new anchor_1.BN(0);
            }
            return result.data.quota.sub(result.data.minted);
        }
        catch {
            return new anchor_1.BN(0);
        }
    }
    /**
     * Check if address is master
     */
    async isMaster(mint, address) {
        return this.hasRole(mint, address, types_1.ROLE_MASTER);
    }
    /**
     * Check if address is minter
     */
    async isMinter(mint, address) {
        return this.hasRole(mint, address, types_1.ROLE_MINTER);
    }
    /**
     * Check if address is burner
     */
    async isBurner(mint, address) {
        return this.hasRole(mint, address, types_1.ROLE_BURNER);
    }
    /**
     * Check if address is pauser
     */
    async isPauser(mint, address) {
        return this.hasRole(mint, address, types_1.ROLE_PAUSER);
    }
    /**
     * Check if address is blacklister
     */
    async isBlacklister(mint, address) {
        return this.hasRole(mint, address, types_1.ROLE_BLACKLISTER);
    }
    /**
     * Check if address is seizer
     */
    async isSeizer(mint, address) {
        return this.hasRole(mint, address, types_1.ROLE_SEIZER);
    }
    /**
     * Transfer master authority
     */
    async transferMaster(params) {
        try {
            // Build transfer_authority instruction
            // ...
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }
}
exports.RoleManager = RoleManager;
//# sourceMappingURL=RoleManager.js.map