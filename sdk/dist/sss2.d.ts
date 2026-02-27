import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import type { SSS2HookConfig, SDKResult, FeeCalculation } from "./types";
export declare const SSS2_PROGRAM_ID: PublicKey;
/**
 * SSS-2 Transfer Hook SDK
 * Manages token-2022 transfer hooks with fees, whitelist, blacklist, and permanent delegate
 */
export declare class SSS2Hook {
    private connection;
    private payer;
    private programId;
    constructor(connection: Connection, payer: Keypair, programId?: PublicKey);
    /**
     * Get config PDA for the hook
     */
    getConfigPDA(): PublicKey;
    /**
     * Get whitelist PDA for an address
     */
    getWhitelistPDA(address: PublicKey): PublicKey;
    /**
     * Get blacklist PDA for an address
     */
    getBlacklistPDA(address: PublicKey): PublicKey;
    /**
     * Initialize the transfer hook with fee configuration
     */
    initialize(config: SSS2HookConfig): Promise<SDKResult>;
    /**
     * Update fee configuration
     */
    updateFeeConfig(config: {
        transferFeeBasisPoints: number;
        maxTransferFee: BN;
        minTransferAmount: BN;
    }): Promise<SDKResult>;
    /**
     * Add address to whitelist
     */
    addWhitelist(address: PublicKey): Promise<SDKResult>;
    /**
     * Remove address from whitelist
     */
    removeWhitelist(address: PublicKey): Promise<SDKResult>;
    /**
     * Add address to blacklist
     */
    addBlacklist(address: PublicKey): Promise<SDKResult>;
    /**
     * Remove address from blacklist
     */
    removeBlacklist(address: PublicKey): Promise<SDKResult>;
    /**
     * Set permanent delegate
     */
    setPermanentDelegate(delegate?: PublicKey): Promise<SDKResult>;
    /**
     * Enable/disable blacklist enforcement
     */
    setBlacklistEnabled(enabled: boolean): Promise<SDKResult>;
    /**
     * Pause/unpause the hook
     */
    setPaused(paused: boolean): Promise<SDKResult>;
    /**
     * Calculate fee for a given amount
     */
    calculateFee(amount: BN, config: SSS2HookConfig): FeeCalculation;
    private sendTransaction;
}
export default SSS2Hook;
//# sourceMappingURL=sss2.d.ts.map