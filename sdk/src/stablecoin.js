"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaStablecoin = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const compliance_1 = require("./modules/compliance");
const presets_1 = require("./presets");
const constants_1 = require("./constants");
/**
 * Main SDK class for interacting with Solana Stablecoin Standard
 */
class SolanaStablecoin {
    constructor(connection, mint, stablecoinStatePDA) {
        this.connection = connection;
        this.mintAddress = mint;
        this.stablecoinStatePDA = stablecoinStatePDA;
        this.compliance = new compliance_1.ComplianceModule(connection, mint, stablecoinStatePDA);
    }
    /**
     * Create a new stablecoin
     */
    static async create(connection, params) {
        const mintKeypair = web3_js_1.Keypair.generate();
        const mint = mintKeypair.publicKey;
        // Derive stablecoin state PDA
        const [stablecoinStatePDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.STABLECOIN_SEED, mint.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Merge preset config if provided
        let config;
        if (params.preset) {
            config = (0, presets_1.mergePresetConfig)(params.preset, {
                name: params.name,
                symbol: params.symbol,
                uri: params.uri || '',
                decimals: params.decimals,
                ...params.extensions,
            });
        }
        else {
            config = {
                name: params.name,
                symbol: params.symbol,
                uri: params.uri || '',
                decimals: params.decimals,
                enablePermanentDelegate: params.extensions?.permanentDelegate ?? false,
                enableTransferHook: params.extensions?.transferHook ?? false,
                defaultAccountFrozen: params.extensions?.defaultAccountFrozen ?? false,
            };
        }
        // Build initialize instruction
        // Note: This is a simplified version. In production, use Anchor's IDL
        const instruction = {
            keys: [
                { pubkey: stablecoinStatePDA, isSigner: false, isWritable: true },
                { pubkey: mint, isSigner: true, isWritable: true },
                { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: spl_token_1.TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: web3_js_1.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize config data here
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        // Send transaction
        const signature = await connection.sendTransaction(transaction, [params.authority, mintKeypair]);
        await connection.confirmTransaction(signature);
        console.log(`Stablecoin created: ${mint.toBase58()}`);
        console.log(`Transaction: ${signature}`);
        // Initialize roles if provided
        const stablecoin = new SolanaStablecoin(connection, mint, stablecoinStatePDA);
        if (params.roles) {
            // Add minters
            if (params.roles.minters) {
                for (const minter of params.roles.minters) {
                    await stablecoin.updateMinter({
                        minter: minter.address,
                        dailyQuota: minter.dailyQuota,
                        action: 'add',
                        authority: params.authority,
                    });
                }
            }
            // Add other roles
            if (params.roles.burners) {
                for (const burner of params.roles.burners) {
                    await stablecoin.updateRole({
                        roleType: 'burner',
                        account: burner,
                        action: 'add',
                        authority: params.authority,
                    });
                }
            }
            if (params.roles.blacklisters) {
                for (const blacklister of params.roles.blacklisters) {
                    await stablecoin.updateRole({
                        roleType: 'blacklister',
                        account: blacklister,
                        action: 'add',
                        authority: params.authority,
                    });
                }
            }
            if (params.roles.pausers) {
                for (const pauser of params.roles.pausers) {
                    await stablecoin.updateRole({
                        roleType: 'pauser',
                        account: pauser,
                        action: 'add',
                        authority: params.authority,
                    });
                }
            }
            if (params.roles.seizers) {
                for (const seizer of params.roles.seizers) {
                    await stablecoin.updateRole({
                        roleType: 'seizer',
                        account: seizer,
                        action: 'add',
                        authority: params.authority,
                    });
                }
            }
        }
        return stablecoin;
    }
    /**
     * Load an existing stablecoin
     */
    static async load(connection, mint) {
        const [stablecoinStatePDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.STABLECOIN_SEED, mint.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Verify stablecoin exists
        const accountInfo = await connection.getAccountInfo(stablecoinStatePDA);
        if (!accountInfo) {
            throw new Error(`Stablecoin not found for mint: ${mint.toBase58()}`);
        }
        return new SolanaStablecoin(connection, mint, stablecoinStatePDA);
    }
    /**
     * Mint tokens
     */
    async mint(params) {
        // Derive minter account PDA
        const [minterAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.MINTER_SEED, this.stablecoinStatePDA.toBuffer(), params.minter.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Get recipient token account
        const recipientTokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(this.mintAddress, params.recipient, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        // Build mint instruction
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
                { pubkey: minterAccountPDA, isSigner: false, isWritable: true },
                { pubkey: this.mintAddress, isSigner: false, isWritable: true },
                { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
                { pubkey: params.minter.publicKey, isSigner: true, isWritable: false },
                { pubkey: spl_token_1.TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize amount here
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.minter]);
        await this.connection.confirmTransaction(signature);
        console.log(`Minted ${params.amount.toString()} tokens to ${params.recipient.toBase58()}`);
        return signature;
    }
    /**
     * Burn tokens
     */
    async burn(params) {
        // Derive role account PDA
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([0]), params.burner.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Build burn instruction
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
                { pubkey: this.mintAddress, isSigner: false, isWritable: true },
                { pubkey: params.tokenAccount, isSigner: false, isWritable: true },
                { pubkey: params.burner.publicKey, isSigner: true, isWritable: false },
                { pubkey: spl_token_1.TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize amount here
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.burner]);
        await this.connection.confirmTransaction(signature);
        console.log(`Burned ${params.amount.toString()} tokens`);
        return signature;
    }
    /**
     * Freeze account
     */
    async freezeAccount(params) {
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: this.mintAddress, isSigner: false, isWritable: true },
                { pubkey: params.tokenAccount, isSigner: false, isWritable: true },
                { pubkey: params.authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: spl_token_1.TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]),
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.authority]);
        await this.connection.confirmTransaction(signature);
        console.log(`Frozen account: ${params.tokenAccount.toBase58()}`);
        return signature;
    }
    /**
     * Thaw account
     */
    async thawAccount(params) {
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: this.mintAddress, isSigner: false, isWritable: true },
                { pubkey: params.tokenAccount, isSigner: false, isWritable: true },
                { pubkey: params.authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: spl_token_1.TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]),
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.authority]);
        await this.connection.confirmTransaction(signature);
        console.log(`Thawed account: ${params.tokenAccount.toBase58()}`);
        return signature;
    }
    /**
     * Pause operations
     */
    async pause(pauser) {
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([2]), pauser.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
                { pubkey: pauser.publicKey, isSigner: true, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]),
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [pauser]);
        await this.connection.confirmTransaction(signature);
        console.log('Operations paused');
        return signature;
    }
    /**
     * Unpause operations
     */
    async unpause(pauser) {
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([2]), pauser.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
                { pubkey: pauser.publicKey, isSigner: true, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]),
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [pauser]);
        await this.connection.confirmTransaction(signature);
        console.log('Operations resumed');
        return signature;
    }
    /**
     * Update minter
     */
    async updateMinter(params) {
        const [minterAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.MINTER_SEED, this.stablecoinStatePDA.toBuffer(), params.minter.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: minterAccountPDA, isSigner: false, isWritable: true },
                { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize minter, quota, action
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.authority]);
        await this.connection.confirmTransaction(signature);
        console.log(`${params.action === 'add' ? 'Added' : 'Removed'} minter: ${params.minter.toBase58()}`);
        return signature;
    }
    /**
     * Update role
     */
    async updateRole(params) {
        const roleTypeMap = { burner: 0, blacklister: 1, pauser: 2, seizer: 3 };
        const roleType = roleTypeMap[params.roleType];
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([roleType]), params.account.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: true },
                { pubkey: params.authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize role type, account, action
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.authority]);
        await this.connection.confirmTransaction(signature);
        console.log(`${params.action === 'add' ? 'Added' : 'Removed'} ${params.roleType}: ${params.account.toBase58()}`);
        return signature;
    }
    /**
     * Transfer authority
     */
    async transferAuthority(newAuthority, currentAuthority) {
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: true },
                { pubkey: currentAuthority.publicKey, isSigner: true, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize new authority
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [currentAuthority]);
        await this.connection.confirmTransaction(signature);
        console.log(`Authority transferred to: ${newAuthority.toBase58()}`);
        return signature;
    }
    /**
     * Get stablecoin info
     */
    async getInfo() {
        const accountInfo = await this.connection.getAccountInfo(this.stablecoinStatePDA);
        if (!accountInfo) {
            throw new Error('Stablecoin not found');
        }
        // Deserialize account data
        // Note: In production, use Anchor's account deserialization
        const state = {}; // Parse from accountInfo.data
        const mintInfo = await this.connection.getTokenSupply(this.mintAddress);
        return {
            mint: this.mintAddress,
            name: state.name,
            symbol: state.symbol,
            decimals: state.decimals,
            totalSupply: new anchor_1.BN(mintInfo.value.amount),
            totalMinted: state.totalMinted,
            totalBurned: state.totalBurned,
            isPaused: state.isPaused,
            complianceEnabled: state.complianceEnabled,
            authority: state.masterAuthority,
        };
    }
    /**
     * Get total supply
     */
    async getTotalSupply() {
        const supply = await this.connection.getTokenSupply(this.mintAddress);
        return new anchor_1.BN(supply.value.amount);
    }
    /**
     * Get balance of an address
     */
    async getBalance(address) {
        const tokenAccount = await (0, spl_token_1.getAssociatedTokenAddress)(this.mintAddress, address, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
        const balance = await this.connection.getTokenAccountBalance(tokenAccount);
        return new anchor_1.BN(balance.value.amount);
    }
    /**
     * Get minter info
     */
    async getMinterInfo(minter) {
        const [minterAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.MINTER_SEED, this.stablecoinStatePDA.toBuffer(), minter.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const accountInfo = await this.connection.getAccountInfo(minterAccountPDA);
        if (!accountInfo) {
            throw new Error('Minter not found');
        }
        // Deserialize account data
        const minterAccount = {}; // Parse from accountInfo.data
        const remainingQuota = minterAccount.dailyQuota.sub(minterAccount.mintedToday);
        return {
            address: minter,
            dailyQuota: minterAccount.dailyQuota,
            mintedToday: minterAccount.mintedToday,
            remainingQuota: remainingQuota.gt(new anchor_1.BN(0)) ? remainingQuota : new anchor_1.BN(0),
            totalMinted: minterAccount.totalMinted,
            isActive: minterAccount.isActive,
        };
    }
}
exports.SolanaStablecoin = SolanaStablecoin;
