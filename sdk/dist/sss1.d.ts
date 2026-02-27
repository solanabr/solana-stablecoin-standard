import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import type { SDKResult, StablecoinInfo } from "./types";
/**
 * SSS-1 Basic RBAC Stablecoin
 * Role-based access control for minting, freezing, and admin operations
 */
export declare class SSS1Stablecoin {
    private connection;
    private payer;
    constructor(connection: Connection, payer: Keypair);
    /**
     * Create a new stablecoin with RBAC
     */
    create(options: {
        name: string;
        symbol: string;
        decimals: number;
    }): Promise<SDKResult>;
    /**
     * Mint tokens to a recipient
     */
    mint(options: {
        recipient: PublicKey;
        amount: BN;
    }): Promise<SDKResult>;
    /**
     * Burn tokens from an account
     */
    burn(options: {
        amount: BN;
    }): Promise<SDKResult>;
    /**
     * Freeze an account
     */
    freeze(options: {
        account: PublicKey;
    }): Promise<SDKResult>;
    /**
     * Thaw (unfreeze) an account
     */
    thaw(options: {
        account: PublicKey;
    }): Promise<SDKResult>;
    /**
     * Get token info
     */
    getInfo(): Promise<SDKResult<StablecoinInfo>>;
}
export default SSS1Stablecoin;
//# sourceMappingURL=sss1.d.ts.map