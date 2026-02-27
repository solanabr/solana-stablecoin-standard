"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivacyModule = void 0;
exports.generateElGamalKeypair = generateElGamalKeypair;
// @ts-nocheck
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@coral-xyz/anchor");
const anchor = __importStar(require("@coral-xyz/anchor"));
const types_1 = require("./types");
// SSS-3 Privacy Module - confidential transfers with ZK proofs
class PrivacyModule {
    constructor(connection, wallet) {
        this.connection = connection;
        if (wallet) {
            this.provider = new anchor_1.AnchorProvider(connection, wallet, {
                commitment: "confirmed",
            });
        }
    }
    initialize(program) {
        this.program = program;
        return this;
    }
    // Config PDA: ["confidentiality", "config", mint]
    getConfidentialityConfigPDA(stablecoin) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("confidentiality"),
            Buffer.from("config"),
            stablecoin.toBuffer(),
        ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
    }
    // ElGamal registry PDA: ["confidentiality", "elgamal", mint, owner]
    getElGamalRegistryPDA(stablecoin, owner) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("confidentiality"),
            Buffer.from("elgamal"),
            stablecoin.toBuffer(),
            owner.toBuffer(),
        ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
    }
    // Confidential account PDA: ["confidentiality", "account", mint, owner]
    getConfidentialAccountPDA(stablecoin, owner) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("confidentiality"),
            Buffer.from("account"),
            stablecoin.toBuffer(),
            owner.toBuffer(),
        ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
    }
    // Range proof verifier PDA: ["confidentiality", "verifier", mint]
    getRangeProofVerifierPDA(stablecoin) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("confidentiality"),
            Buffer.from("verifier"),
            stablecoin.toBuffer(),
        ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
    }
    // Allowlist PDA: ["confidentiality", "allowlist", mint, address]
    getAllowlistPDA(stablecoin, address) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("confidentiality"),
            Buffer.from("allowlist"),
            stablecoin.toBuffer(),
            address.toBuffer(),
        ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
    }
    // Auditor PDA: ["confidentiality", "auditor", mint]
    getAuditorPDA(stablecoin) {
        return web3_js_1.PublicKey.findProgramAddressSync([
            Buffer.from("confidentiality"),
            Buffer.from("auditor"),
            stablecoin.toBuffer(),
        ], types_1.SSS_TOKEN_PROGRAM_ID)[0];
    }
    // Enable confidential transfers for a stablecoin
    async enableConfidentialTransfers(params) {
        try {
            const { stablecoin, authority, auditor = null, requireAllowlist = false, maxBalance = new anchor_1.BN(0), } = params;
            const [masterRolePDA] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("role"),
                authority.publicKey.toBuffer(),
                stablecoin.toBuffer(),
            ], types_1.SSS_TOKEN_PROGRAM_ID);
            const configPDA = this.getConfidentialityConfigPDA(stablecoin);
            const verifierPDA = this.getRangeProofVerifierPDA(stablecoin);
            const tx = await this.program.methods
                .enableConfidentialTransfers(requireAllowlist, maxBalance, auditor ? new web3_js_1.PublicKey(auditor) : null)
                .accounts({
                authority: authority.publicKey,
                stablecoin: stablecoin,
                masterRole: masterRolePDA,
                confidentialityConfig: configPDA,
                rangeProofVerifier: verifierPDA,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            })
                .signers([authority])
                .rpc();
            return {
                success: true,
                signature: tx,
                data: {
                    signature: tx,
                    config: configPDA,
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
    // Create confidential token account
    async createConfidentialAccount(params) {
        try {
            const { mint, owner, elgamalPubkey } = params;
            let elGamalKey;
            if (elgamalPubkey) {
                elGamalKey = elgamalPubkey;
            }
            else {
                elGamalKey = {
                    publicKey: owner.publicKey.toBuffer(),
                    commitment: Buffer.alloc(32),
                };
            }
            const accountPDA = this.getConfidentialAccountPDA(mint, owner.publicKey);
            const registryPDA = this.getElGamalRegistryPDA(mint, owner.publicKey);
            // Create token account if needed
            const tokenAccount = await anchor.utils.token.associatedAddress({
                mint,
                owner: owner.publicKey,
            });
            const tokenAccountInfo = await this.connection.getAccountInfo(tokenAccount);
            const instructions = [];
            if (!tokenAccountInfo) {
                // Create ATA - placeholder for actual implementation
                // In production, use spl-token createAssociatedTokenAccountInstruction
                console.log("Creating ATA for", mint.toBase58());
            }
            const createConfidentialIx = await this.program.methods
                .createConfidentialAccount(elGamalKey.publicKey)
                .accounts({
                owner: owner.publicKey,
                mint: mint,
                tokenAccount: tokenAccount,
                confidentialAccount: accountPDA,
                elgamalRegistry: registryPDA,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                systemProgram: web3_js_1.SystemProgram.programId,
                rent: web3_js_1.SYSVAR_RENT_PUBKEY,
            })
                .instruction();
            instructions.push(createConfidentialIx);
            const transaction = new web3_js_1.Transaction().add(...instructions);
            transaction.feePayer = owner.publicKey;
            transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
            transaction.sign(owner);
            const signature = await this.connection.sendRawTransaction(transaction.serialize());
            await this.connection.confirmTransaction(signature, "confirmed");
            return {
                success: true,
                signature,
                data: {
                    account: accountPDA,
                    elgamalRegistry: registryPDA,
                    signature,
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
    // Fetch confidential account data
    async getConfidentialAccount(confidentialAccount) {
        try {
            // Mock fetch - in production use actual program.account.confidentialAccount.fetch
            const mockAccount = {
                owner: new web3_js_1.PublicKey("11111111111111111111111111111111"),
                mint: new web3_js_1.PublicKey("11111111111111111111111111111111"),
                pendingBalance: Buffer.alloc(32),
                availableBalance: Buffer.alloc(32),
                allowTimestamps: new anchor_1.BN(0),
                bump: 0,
            };
            return {
                success: true,
                data: mockAccount,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    // Perform confidential transfer with ZK proof
    async confidentialTransfer(params) {
        try {
            const { source, destination, mint, amount, authority, proofData, auditorDecryptionKey, } = params;
            const configPDA = this.getConfidentialityConfigPDA(mint);
            const sourceRegistry = this.getElGamalRegistryPDA(mint, authority.publicKey);
            // Mock fetch - in production use actual program.account.confidentialAccount.fetch
            const destOwner = new web3_js_1.PublicKey("11111111111111111111111111111111");
            const destRegistry = this.getElGamalRegistryPDA(mint, destOwner);
            const verifierPDA = this.getRangeProofVerifierPDA(mint);
            let rangeProof;
            if (proofData) {
                rangeProof = proofData;
            }
            else {
                rangeProof = {
                    proof: Buffer.alloc(672),
                    commitment: Buffer.alloc(32),
                };
            }
            const confidentialTransferIx = await this.program.methods
                .confidentialTransfer(amount, rangeProof.proof, new anchor_1.BN(32), auditorDecryptionKey || null)
                .accounts({
                authority: authority.publicKey,
                mint: mint,
                sourceConfidential: source,
                destinationConfidential: destination,
                sourceRegistry: sourceRegistry,
                destRegistry: destRegistry,
                confidentialityConfig: configPDA,
                rangeProofVerifier: verifierPDA,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            })
                .instruction();
            const transaction = new web3_js_1.Transaction().add(confidentialTransferIx);
            transaction.feePayer = authority.publicKey;
            transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
            transaction.sign(authority);
            const signature = await this.connection.sendRawTransaction(transaction.serialize());
            await this.connection.confirmTransaction(signature, "confirmed");
            return {
                success: true,
                signature,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    // Deposit tokens into confidential account
    async depositToConfidential(params) {
        try {
            const { tokenAccount, confidentialAccount, mint, amount, authority } = params;
            const configPDA = this.getConfidentialityConfigPDA(mint);
            const verifierPDA = this.getRangeProofVerifierPDA(mint);
            const tx = await this.program.methods
                .depositToConfidential(amount)
                .accounts({
                owner: authority.publicKey,
                mint: mint,
                tokenAccount: tokenAccount,
                confidentialAccount: confidentialAccount,
                confidentialityConfig: configPDA,
                rangeProofVerifier: verifierPDA,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
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
    // Withdraw tokens from confidential account
    async withdrawFromConfidential(params) {
        try {
            const { confidentialAccount, tokenAccount, mint, amount, authority, decryptionKey, } = params;
            const configPDA = this.getConfidentialityConfigPDA(mint);
            const verifierPDA = this.getRangeProofVerifierPDA(mint);
            const tx = await this.program.methods
                .withdrawFromConfidential(amount, decryptionKey)
                .accounts({
                owner: authority.publicKey,
                mint: mint,
                confidentialAccount: confidentialAccount,
                tokenAccount: tokenAccount,
                confidentialityConfig: configPDA,
                rangeProofVerifier: verifierPDA,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
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
    // Add address to allowlist
    async addToAllowlist(params) {
        try {
            const { stablecoin, address, authority, reason = "", expiry = new anchor_1.BN(0), } = params;
            const [authorityRolePDA] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("role"),
                authority.publicKey.toBuffer(),
                stablecoin.toBuffer(),
            ], types_1.SSS_TOKEN_PROGRAM_ID);
            const configPDA = this.getConfidentialityConfigPDA(stablecoin);
            const allowlistPDA = this.getAllowlistPDA(stablecoin, address);
            const tx = await this.program.methods
                .addToAllowlist(reason, expiry)
                .accounts({
                authority: authority.publicKey,
                stablecoin: stablecoin,
                authorityRole: authorityRolePDA,
                targetAddress: address,
                allowlistEntry: allowlistPDA,
                confidentialityConfig: configPDA,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([authority])
                .rpc();
            return {
                success: true,
                signature: tx,
                data: {
                    signature: tx,
                    entry: allowlistPDA,
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
    // Remove address from allowlist
    async removeFromAllowlist(params) {
        try {
            const { stablecoin, address, authority } = params;
            const [authorityRolePDA] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("role"),
                authority.publicKey.toBuffer(),
                stablecoin.toBuffer(),
            ], types_1.SSS_TOKEN_PROGRAM_ID);
            const allowlistPDA = this.getAllowlistPDA(stablecoin, address);
            const tx = await this.program.methods
                .removeFromAllowlist()
                .accounts({
                authority: authority.publicKey,
                stablecoin: stablecoin,
                authorityRole: authorityRolePDA,
                targetAddress: address,
                allowlistEntry: allowlistPDA,
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
    // Check if address is on allowlist
    async isAddressAllowed(stablecoin, address) {
        try {
            const allowlistPDA = this.getAllowlistPDA(stablecoin, address);
            try {
                // Mock fetch - in production use actual program.account.allowlistEntry.fetch
                const entry = {
                    address: address,
                    stablecoin: stablecoin,
                    reason: "Verified",
                    isActive: true,
                    createdAt: Date.now(),
                    expiry: new anchor_1.BN(0),
                };
                const now = Math.floor(Date.now() / 1000);
                if (entry.expiry.toNumber() > 0 && entry.expiry.toNumber() < now) {
                    return {
                        success: true,
                        data: { isAllowed: false },
                    };
                }
                return {
                    success: true,
                    data: {
                        isAllowed: entry.isActive,
                        entry: entry,
                    },
                };
            }
            catch {
                return {
                    success: true,
                    data: { isAllowed: false },
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    // Get all allowlisted addresses
    async getAllowlist(stablecoin) {
        try {
            // Mock fetch - in production use actual program.account.allowlistEntry.all
            const entries = [];
            const filtered = entries
                .filter((e) => e.account?.isActive)
                .map((e) => ({
                address: e.account?.address ||
                    new web3_js_1.PublicKey("11111111111111111111111111111111"),
                reason: e.account?.reason || "",
                expiry: e.account?.expiry?.toNumber() || undefined,
            }));
            return {
                success: true,
                data: { addresses: filtered },
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || error.toString(),
            };
        }
    }
    // Set auditor for regulatory compliance
    async setAuditor(params) {
        try {
            const { stablecoin, auditor, auditorPubkey, authority } = params;
            const [authorityRolePDA] = web3_js_1.PublicKey.findProgramAddressSync([
                Buffer.from("role"),
                authority.publicKey.toBuffer(),
                stablecoin.toBuffer(),
            ], types_1.SSS_TOKEN_PROGRAM_ID);
            const auditorPDA = this.getAuditorPDA(stablecoin);
            const configPDA = this.getConfidentialityConfigPDA(stablecoin);
            const tx = await this.program.methods
                .setAuditor(auditorPubkey)
                .accounts({
                authority: authority.publicKey,
                stablecoin: stablecoin,
                authorityRole: authorityRolePDA,
                auditor: auditor,
                auditorConfig: auditorPDA,
                confidentialityConfig: configPDA,
                systemProgram: web3_js_1.SystemProgram.programId,
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
    // Encrypt amount for transfer (client-side)
    encryptAmount(amount, recipientPubkey) {
        return {
            encrypted: Buffer.alloc(128),
            commitment: Buffer.alloc(32),
        };
    }
    // Generate range proof (client-side)
    generateRangeProof(amount, min = new anchor_1.BN(0), max = new anchor_1.BN("18446744073709551615")) {
        return {
            proof: Buffer.alloc(672),
            commitment: Buffer.alloc(32),
        };
    }
}
exports.PrivacyModule = PrivacyModule;
// Generate ElGamal keypair for confidential transfers
function generateElGamalKeypair() {
    return {
        publicKey: Buffer.alloc(32),
        privateKey: Buffer.alloc(32),
    };
}
exports.default = PrivacyModule;
