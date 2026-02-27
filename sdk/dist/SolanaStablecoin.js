"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaStablecoin = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const types_1 = require("./types");
const spl_token_1 = require("@solana/spl-token");
// Token-2022 confidential transfer feature is still new in spl-token, manually build the init ix
const createInitializeConfidentialTransferMintInstruction = (mint, authority, autoApproveNewAccounts, programId) => {
    // Instruction layout for InitializeConfidentialTransferMint
    // 0 : Instruction offset
    // 1 : 
    // [Pubkey]
    // [Pubkey]
    const data = Buffer.alloc(1 + 32 + 32);
    data.writeUInt8(27, 0); // InitializeConfidentialTransferMint = 27
    authority.toBuffer().copy(data, 1);
    autoApproveNewAccounts.toBuffer().copy(data, 33);
    return new web3_js_2.TransactionInstruction({
        keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
        programId,
        data,
    });
};
const web3_js_2 = require("@solana/web3.js");
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
class SolanaStablecoin {
    constructor(connection, wallet, programId, hookProgramId) {
        this.connection = connection;
        this.provider = new anchor_1.AnchorProvider(connection, wallet, {
            commitment: "confirmed",
        });
        // Initialize programs with IDs
        const tokenProgramId = programId || types_1.SSS_TOKEN_PROGRAM_ID;
        const transferHookId = hookProgramId || types_1.SSS_TRANSFER_HOOK_PROGRAM_ID;
        this.program = new anchor_1.Program(require("../target/idl/sss_token.json"), this.provider);
        this.hookProgram = new anchor_1.Program(require("../target/idl/sss_transfer_hook.json"), this.provider);
    }
    /**
     * Get stablecoin state PDA
     */
    getStablecoinPDA(mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("stablecoin"), mint.toBuffer()], this.program.programId)[0];
    }
    /**
     * Get role account PDA
     */
    getRolePDA(owner, mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), owner.toBuffer(), mint.toBuffer()], this.program.programId)[0];
    }
    /**
     * Get minter info PDA
     */
    getMinterPDA(minter, mint) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("minter"), minter.toBuffer(), mint.toBuffer()], this.program.programId)[0];
    }
    /**
     * Get mint authority PDA
     */
    getMintAuthorityPDA(stablecoinPDA) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("mint_authority"), stablecoinPDA.toBuffer()], this.program.programId)[0];
    }
    /**
     * Get burn authority PDA
     */
    getBurnAuthorityPDA(stablecoinPDA) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("burn_authority"), stablecoinPDA.toBuffer()], this.program.programId)[0];
    }
    /**
     * Get freeze authority PDA
     */
    getFreezeAuthorityPDA(stablecoinPDA) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("freeze_authority"), stablecoinPDA.toBuffer()], this.program.programId)[0];
    }
    /**
     * Initialize a new stablecoin (SSS-1 or SSS-2)
     */
    async initialize(params) {
        try {
            const { name, symbol, decimals, authority, enableTransferHook = false, enablePermanentDelegate = false, enableConfidentialTransfers = false, enableMintCloseAuthority = false, enableDefaultAccountState = false, } = params;
            if (name.length > 32)
                throw new Error("Name must be 32 characters or less");
            if (symbol.length > 10)
                throw new Error("Symbol must be 10 characters or less");
            if (decimals > 9)
                throw new Error("Decimals must be 9 or less");
            const mintKeypair = web3_js_1.Keypair.generate();
            const stablecoin = this.getStablecoinPDA(mintKeypair.publicKey);
            const masterRole = this.getRolePDA(authority.publicKey, mintKeypair.publicKey);
            const extensions = [];
            if (enableConfidentialTransfers)
                extensions.push(spl_token_1.ExtensionType.ConfidentialTransferMint);
            if (enableTransferHook)
                extensions.push(spl_token_1.ExtensionType.TransferHook);
            if (enablePermanentDelegate)
                extensions.push(spl_token_1.ExtensionType.PermanentDelegate);
            if (enableMintCloseAuthority)
                extensions.push(spl_token_1.ExtensionType.MintCloseAuthority);
            if (enableDefaultAccountState)
                extensions.push(spl_token_1.ExtensionType.DefaultAccountState);
            const mintLen = (0, spl_token_1.getMintLen)(extensions);
            const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);
            // SSS-2 Config PDA is the transfer hook program ID
            const [configPDA] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config"), authority.publicKey.toBuffer()], this.hookProgram.programId);
            const mintAuthorityPDA = this.getMintAuthorityPDA(stablecoin);
            const tx = new web3_js_1.Transaction();
            tx.add(anchor_1.web3.SystemProgram.createAccount({
                fromPubkey: authority.publicKey,
                newAccountPubkey: mintKeypair.publicKey,
                space: mintLen,
                lamports,
                programId: spl_token_1.TOKEN_2022_PROGRAM_ID,
            }));
            if (enableConfidentialTransfers) {
                tx.add(createInitializeConfidentialTransferMintInstruction(mintKeypair.publicKey, authority.publicKey, mintKeypair.publicKey, // Auto-approve new accounts? Usually self
                spl_token_1.TOKEN_2022_PROGRAM_ID));
            }
            if (enableTransferHook) {
                tx.add((0, spl_token_1.createInitializeTransferHookInstruction)(mintKeypair.publicKey, authority.publicKey, this.hookProgram.programId, spl_token_1.TOKEN_2022_PROGRAM_ID));
            }
            if (enablePermanentDelegate) {
                tx.add((0, spl_token_1.createInitializePermanentDelegateInstruction)(mintKeypair.publicKey, authority.publicKey, spl_token_1.TOKEN_2022_PROGRAM_ID));
            }
            if (enableMintCloseAuthority) {
                tx.add((0, spl_token_1.createInitializeMintCloseAuthorityInstruction)(mintKeypair.publicKey, authority.publicKey, spl_token_1.TOKEN_2022_PROGRAM_ID));
            }
            if (enableDefaultAccountState) {
                // 1 = Frozen, 0 = Initialized. SSS-3 typically requires accounts to be initialized frozen
                tx.add((0, spl_token_1.createInitializeDefaultAccountStateInstruction)(mintKeypair.publicKey, 1, // Frozen state requires transfer hook or manual thaw
                spl_token_1.TOKEN_2022_PROGRAM_ID));
            }
            tx.add((0, spl_token_1.createInitializeMintInstruction)(mintKeypair.publicKey, decimals, mintAuthorityPDA, this.getFreezeAuthorityPDA(stablecoin), spl_token_1.TOKEN_2022_PROGRAM_ID));
            // Now call the anchor program to initialize state
            // @ts-ignore
            const initIx = await this.program.methods
                .initialize(name, symbol, decimals, enableTransferHook, enablePermanentDelegate)
                .accounts({
                authority: authority.publicKey,
                stablecoinState: stablecoin,
                masterRole: masterRole,
                mint: mintKeypair.publicKey,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor_1.web3.SystemProgram.programId,
                rent: anchor_1.web3.SYSVAR_RENT_PUBKEY,
            })
                .instruction();
            tx.add(initIx);
            tx.feePayer = authority.publicKey;
            tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
            tx.sign(authority, mintKeypair);
            const signature = await this.connection.sendRawTransaction(tx.serialize());
            await this.connection.confirmTransaction(signature, "confirmed");
            return {
                success: true,
                signature,
                data: {
                    signature,
                    mint: mintKeypair.publicKey,
                    stablecoin,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
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
    async burn(params) {
        try {
            const { stablecoin, burner, tokenAccount, amount } = params;
            // Fetch state
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            const mint = state.mint;
            // Derive accounts
            const burnerRole = this.getRolePDA(burner.publicKey, mint);
            const burnAuthority = this.getBurnAuthorityPDA(stablecoin);
            // Build transaction
            const tx = await this.program.methods
                .burn(amount)
                .accounts({
                burner: burner.publicKey,
                stablecoinState: stablecoin,
                burnerRole: burnerRole,
                mint: mint,
                tokenAccount: tokenAccount,
                burnAuthority: burnAuthority,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([burner])
                .rpc();
            return {
                success: true,
                signature: tx,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Freeze a token account
     */
    async freeze(params) {
        try {
            const { stablecoin, pauser, tokenAccount } = params;
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            const mint = state.mint;
            const pauserRole = this.getRolePDA(pauser.publicKey, mint);
            const freezeAuthority = this.getFreezeAuthorityPDA(stablecoin);
            const tx = await this.program.methods
                .freezeAccount()
                .accounts({
                pauser: pauser.publicKey,
                stablecoinState: stablecoin,
                pauserRole: pauserRole,
                mint: mint,
                tokenAccount: tokenAccount,
                freezeAuthority: freezeAuthority,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([pauser])
                .rpc();
            return {
                success: true,
                signature: tx,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Thaw (unfreeze) a token account
     */
    async thaw(params) {
        try {
            const { stablecoin, pauser, tokenAccount } = params;
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            const mint = state.mint;
            const pauserRole = this.getRolePDA(pauser.publicKey, mint);
            const freezeAuthority = this.getFreezeAuthorityPDA(stablecoin);
            const tx = await this.program.methods
                .thawAccount()
                .accounts({
                pauser: pauser.publicKey,
                stablecoinState: stablecoin,
                pauserRole: pauserRole,
                mint: mint,
                tokenAccount: tokenAccount,
                freezeAuthority: freezeAuthority,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([pauser])
                .rpc();
            return {
                success: true,
                signature: tx,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Pause all operations
     */
    async pause(params) {
        try {
            const { stablecoin, pauser } = params;
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            const mint = state.mint;
            const pauserRole = this.getRolePDA(pauser.publicKey, mint);
            const tx = await this.program.methods
                .setPaused(true)
                .accounts({
                pauser: pauser.publicKey,
                stablecoinState: stablecoin,
                pauserRole: pauserRole,
            })
                .signers([pauser])
                .rpc();
            return {
                success: true,
                signature: tx,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Unpause operations
     */
    async unpause(params) {
        try {
            const { stablecoin, pauser } = params;
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            const mint = state.mint;
            const pauserRole = this.getRolePDA(pauser.publicKey, mint);
            const tx = await this.program.methods
                .setPaused(false)
                .accounts({
                pauser: pauser.publicKey,
                stablecoinState: stablecoin,
                pauserRole: pauserRole,
            })
                .signers([pauser])
                .rpc();
            return {
                success: true,
                signature: tx,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Assign roles to an address
     */
    async updateRoles(params) {
        try {
            const { stablecoin, authority, target, roles } = params;
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            const mint = state.mint;
            const authorityRole = this.getRolePDA(authority.publicKey, mint);
            const targetRole = this.getRolePDA(target, mint);
            const tx = await this.program.methods
                .updateRoles(roles)
                .accounts({
                authority: authority.publicKey,
                stablecoinState: stablecoin,
                authorityRole: authorityRole,
                target: target,
                targetRole: targetRole,
                systemProgram: anchor_1.web3.SystemProgram.programId,
            })
                .signers([authority])
                .rpc();
            return {
                success: true,
                signature: tx,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Fetch stablecoin state
     */
    async getState(stablecoin) {
        try {
            // @ts-ignore
            const state = await this.program.account.stablecoinState.fetch(stablecoin);
            return {
                success: true,
                data: state,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Fetch role account
     */
    async getRole(rolePDA) {
        try {
            // @ts-ignore
            const role = await this.program.account.roleAccount.fetch(rolePDA);
            return {
                success: true,
                data: role,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Batch mint tokens to multiple recipients
     */
    async batchMint(minter, mint, recipients, amounts) {
        try {
            if (recipients.length !== amounts.length) {
                throw new Error("Recipients and amounts length mismatch");
            }
            if (recipients.length > 10) {
                throw new Error("Maximum 10 recipients per batch");
            }
            const stablecoin = this.getStablecoinPDA(mint);
            const minterRole = this.getRolePDA(minter.publicKey, mint);
            const minterInfo = this.getMinterPDA(minter.publicKey, mint);
            const mintAuthority = this.getMintAuthorityPDA(stablecoin);
            const tx = await this.program.methods
                .batchMint(recipients, amounts)
                .accounts({
                minter: minter.publicKey,
                stablecoinState: stablecoin,
                minterRole: minterRole,
                minterInfo: minterInfo,
                mint: mint,
                mintAuthority: mintAuthority,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([minter])
                .rpc();
            const totalAmount = amounts.reduce((a, b) => a.add(b), new anchor_1.BN(0));
            return {
                success: true,
                signature: tx,
                data: {
                    signature: tx,
                    recipients: recipients.length,
                    totalAmount: totalAmount.toString(),
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    /**
     * Get supported features
     */
    getFeatures() {
        return {
            sss1: [
                "Token-2022 support",
                "RBAC roles (Master/Minter/Burner/Pauser)",
                "Mint/Burn with quotas",
                "Freeze/Thaw accounts",
                "Pause/Unpause contract",
                "Minter epoch limits",
                "Supply cap",
                "Batch operations",
            ],
            sss2: [
                "Transfer hook enforcement",
                "Blacklist/Whitelist",
                "Configurable transfer fees",
                "Token seizure (permanent delegate)",
                "Compliance roles (Blacklister, Seizer)",
                "Multisig support",
            ],
        };
    }
    /**
     * Check if stablecoin has SSS-2 features
     */
    hasSSS2Features(stablecoinState) {
        return ((stablecoinState.features & 1) !== 0 ||
            (stablecoinState.features & 2) !== 0);
    }
    /**
     * Decode roles bitmask to human-readable array
     */
    decodeRoles(roles) {
        const roleNames = [];
        if (roles & types_1.ROLE_MASTER)
            roleNames.push("MASTER");
        if (roles & types_1.ROLE_MINTER)
            roleNames.push("MINTER");
        if (roles & types_1.ROLE_BURNER)
            roleNames.push("BURNER");
        if (roles & types_1.ROLE_PAUSER)
            roleNames.push("PAUSER");
        if (roles & 16)
            roleNames.push("BLACKLISTER");
        if (roles & 32)
            roleNames.push("SEIZER");
        return roleNames;
    }
}
exports.SolanaStablecoin = SolanaStablecoin;
//# sourceMappingURL=SolanaStablecoin.js.map