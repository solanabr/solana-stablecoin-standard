import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { SDKResult } from "./types";
/**
 * Compliance Module for SSS-2 transfer hooks
 * Handles blacklist, whitelist, and seizure operations
 */
export declare class ComplianceModule {
    private connection;
    private programId;
    constructor(connection: Connection, programId?: PublicKey);
    /**
     * Get hook config PDA
     */
    getConfigPDA(stablecoin: PublicKey): PublicKey;
    /**
     * Get blacklist entry PDA
     */
    getBlacklistPDA(config: PublicKey, address: PublicKey): PublicKey;
    /**
     * Get whitelist entry PDA
     */
    getWhitelistPDA(config: PublicKey, address: PublicKey): PublicKey;
    /**
     * Initialize transfer hook
     */
    initialize(params: {
        stablecoin: PublicKey;
        authority: Keypair;
        transferFeeBasisPoints: number;
        maxTransferFee: BN;
        minTransferAmount: BN;
        blacklistEnabled: boolean;
    }): Promise<SDKResult>;
    /**
     * Add address to blacklist
     */
    addToBlacklist(params: {
        config: PublicKey;
        authority: Keypair;
        target: PublicKey;
        reason: string;
    }): Promise<SDKResult>;
    /**
     * Remove address from blacklist
     */
    removeFromBlacklist(params: {
        config: PublicKey;
        authority: Keypair;
        target: PublicKey;
    }): Promise<SDKResult>;
    /**
     * Check if address is blacklisted
     */
    isBlacklisted(config: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Add address to whitelist
     */
    addToWhitelist(params: {
        config: PublicKey;
        authority: Keypair;
        target: PublicKey;
        whitelistType: "fee_exempt" | "full_bypass";
    }): Promise<SDKResult>;
    /**
     * Remove from whitelist
     */
    removeFromWhitelist(params: {
        config: PublicKey;
        authority: Keypair;
        target: PublicKey;
    }): Promise<SDKResult>;
    /**
     * Check if address is whitelisted
     */
    isWhitelisted(config: PublicKey, address: PublicKey): Promise<boolean>;
    /**
     * Seize tokens from blacklisted account
     */
    seize(params: {
        config: PublicKey;
        authority: Keypair;
        source: PublicKey;
        treasury: PublicKey;
        mint: PublicKey;
        amount?: BN;
        reason: string;
    }): Promise<SDKResult>;
    /**
     * Calculate transfer fee
     */
    calculateFee(params: {
        amount: BN;
        config: {
            transferFeeBasisPoints: number;
            maxTransferFee: BN;
            minTransferAmount: BN;
        };
        isWhitelisted: boolean;
        isDelegate: boolean;
    }): {
        fee: BN;
        netAmount: BN;
    };
    /**
     * Update hook configuration
     */
    updateConfig(params: {
        config: PublicKey;
        authority: Keypair;
        transferFeeBasisPoints?: number;
        maxTransferFee?: BN;
        minTransferAmount?: BN;
        isPaused?: boolean;
        blacklistEnabled?: boolean;
        permanentDelegate?: PublicKey | null;
    }): Promise<SDKResult>;
    /**
     * Get compliance status for transfer
     */
    checkTransfer(params: {
        config: PublicKey;
        source: PublicKey;
        destination: PublicKey;
        amount: BN;
    }): Promise<SDKResult<{
        isCompliant: boolean;
        shouldProceed: boolean;
        fee: BN;
    }>>;
    /**
     * Batch blacklist multiple addresses
     */
    batchBlacklist(authority: Keypair, config: PublicKey, addresses: PublicKey[], reasons: string[]): Promise<SDKResult>;
}
//# sourceMappingURL=ComplianceModule.d.ts.map