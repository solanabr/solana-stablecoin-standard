import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { StablecoinState, RoleAccount, SDKResult } from "./types";
import * as anchor from "@coral-xyz/anchor";
/**
 * Core SDK for managing SSS-1 and SSS-2 stablecoins
 *
 * Usage:
 * ```typescript
 * const sdk = new SolanaStablecoin(connection, wallet);
 *
 * // Initialize SSS-1
 * const { mint, stablecoin } = await sdk.initialize({
 *   name: 'My USD',
 *   symbol: 'MUSD',
 *   decimals: 6,
 *   authority: keypair,
 * });
 *
 * // Mint tokens
 * await sdk.mint({
 *   stablecoin,
 *   minter: keypair,
 *   recipient: userPublicKey,
 *   amount: new BN(1000000),
 * });
 * ```
 */
export declare class SolanaStablecoin {
    private connection;
    private provider;
    private program;
    private hookProgram;
    constructor(connection: Connection, wallet: anchor.Wallet, programId?: PublicKey, hookProgramId?: PublicKey);
    /**
     * Get stablecoin state PDA
     */
    getStablecoinPDA(mint: PublicKey): PublicKey;
    /**
     * Get role account PDA
     */
    getRolePDA(owner: PublicKey, mint: PublicKey): PublicKey;
    /**
     * Get minter info PDA
     */
    getMinterPDA(minter: PublicKey, mint: PublicKey): PublicKey;
    /**
     * Get mint authority PDA
     */
    getMintAuthorityPDA(stablecoinPDA: PublicKey): PublicKey;
    /**
     * Get burn authority PDA
     */
    getBurnAuthorityPDA(stablecoinPDA: PublicKey): PublicKey;
    /**
     * Get freeze authority PDA
     */
    getFreezeAuthorityPDA(stablecoinPDA: PublicKey): PublicKey;
    /**
     * Initialize a new stablecoin (SSS-1 or SSS-2)
     */
    initialize(params: {
        name: string;
        symbol: string;
        decimals: number;
        authority: Keypair;
        enableTransferHook?: boolean;
        enablePermanentDelegate?: boolean;
        enableConfidentialTransfers?: boolean;
        enableMintCloseAuthority?: boolean;
        enableDefaultAccountState?: boolean;
    }): Promise<SDKResult<{
        mint: PublicKey;
        stablecoin: PublicKey;
        signature: string;
    }>>;
    /**
     * async mint(params: {
      stablecoin: PublicKey;
      minter: Keypair;
      recipient: PublicKey;
      amount: BN;
    }): Promise<SDKResult<{ signature: string }>> {
      try {
        const { stablecoin, minter, recipient, amount } = params;
  
        // Fetch state to get mint
        const state = await this.program.account.stablecoinState.fetch(stablecoin);
        const mint = state.mint;
  
        // Derive accounts
        const minterRole = this.getRolePDA(minter.publicKey, mint);
        const minterInfo = this.getMinterPDA(minter.publicKey, mint);
        const mintAuthority = this.getMintAuthorityPDA(stablecoin);
  
        // Get recipient ATA for Token-2022
        const recipientAccount = await anchor.utils.token.associatedAddress({
          mint,
          owner: recipient,
        });
  
        // Build transaction
        const tx = await this.program.methods
          .mint(amount)
          .accounts({
            minter: minter.publicKey,
            stablecoinState: stablecoin,
            minterRole: minterRole,
            minterInfo: minterInfo,
            mint: mint,
            recipientAccount: recipientAccount,
            mintAuthority: mintAuthority,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
  
        return {
          success: true,
          signature: tx,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || error.toString(),
        };
      }
    }
  
    /**
     * Burn tokens
     */
    burn(params: {
        stablecoin: PublicKey;
        burner: Keypair;
        tokenAccount: PublicKey;
        amount: BN;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    /**
     * Freeze a token account
     */
    freeze(params: {
        stablecoin: PublicKey;
        pauser: Keypair;
        tokenAccount: PublicKey;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    /**
     * Thaw (unfreeze) a token account
     */
    thaw(params: {
        stablecoin: PublicKey;
        pauser: Keypair;
        tokenAccount: PublicKey;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    /**
     * Pause all operations
     */
    pause(params: {
        stablecoin: PublicKey;
        pauser: Keypair;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    /**
     * Unpause operations
     */
    unpause(params: {
        stablecoin: PublicKey;
        pauser: Keypair;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    /**
     * Assign roles to an address
     */
    updateRoles(params: {
        stablecoin: PublicKey;
        authority: Keypair;
        target: PublicKey;
        roles: number;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    /**
     * Fetch stablecoin state
     */
    getState(stablecoin: PublicKey): Promise<SDKResult<StablecoinState>>;
    /**
     * Fetch role account
     */
    getRole(rolePDA: PublicKey): Promise<SDKResult<RoleAccount>>;
    /**
     * Batch mint tokens to multiple recipients
     */
    batchMint(minter: Keypair, mint: PublicKey, recipients: PublicKey[], amounts: BN[]): Promise<SDKResult<{
        signature: string;
        recipients: number;
        totalAmount: string;
    }>>;
    /**
     * Get supported features
     */
    getFeatures(): {
        sss1: string[];
        sss2: string[];
    };
    /**
     * Check if stablecoin has SSS-2 features
     */
    hasSSS2Features(stablecoinState: StablecoinState): boolean;
    /**
     * Decode roles bitmask to human-readable array
     */
    decodeRoles(roles: number): string[];
}
//# sourceMappingURL=SolanaStablecoin.d.ts.map