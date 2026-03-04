"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceModule = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const constants_1 = require("../constants");
/**
 * Compliance Module for SSS-2
 * Handles blacklist management and token seizure
 */
class ComplianceModule {
    constructor(connection, mint, stablecoinStatePDA) {
        this.connection = connection;
        this.mint = mint;
        this.stablecoinStatePDA = stablecoinStatePDA;
    }
    /**
     * Add address to blacklist
     * Requires SSS-2 compliance to be enabled
     */
    async blacklistAdd(address, reason, blacklister) {
        // Derive blacklist entry PDA
        const [blacklistEntryPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.BLACKLIST_SEED, this.stablecoinStatePDA.toBuffer(), address.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Derive blacklister role account PDA
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([1]), blacklister.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Build instruction
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
                { pubkey: blacklistEntryPDA, isSigner: false, isWritable: true },
                { pubkey: blacklister.publicKey, isSigner: true, isWritable: true },
                { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize address and reason
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [blacklister]);
        await this.connection.confirmTransaction(signature);
        console.log(`Added ${address.toBase58()} to blacklist: ${reason}`);
        return signature;
    }
    /**
     * Remove address from blacklist
     */
    async blacklistRemove(address, blacklister) {
        // Derive blacklist entry PDA
        const [blacklistEntryPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.BLACKLIST_SEED, this.stablecoinStatePDA.toBuffer(), address.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Derive blacklister role account PDA
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([1]), blacklister.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Build instruction
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
                { pubkey: blacklistEntryPDA, isSigner: false, isWritable: true },
                { pubkey: blacklister.publicKey, isSigner: true, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize address
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [blacklister]);
        await this.connection.confirmTransaction(signature);
        console.log(`Removed ${address.toBase58()} from blacklist`);
        return signature;
    }
    /**
     * Seize tokens from a frozen account
     * Requires SSS-2 with permanent delegate enabled
     */
    async seize(params) {
        // Derive seizer role account PDA
        const [roleAccountPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.ROLE_SEED, this.stablecoinStatePDA.toBuffer(), Buffer.from([3]), params.seizer.publicKey.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        // Build instruction
        const instruction = {
            keys: [
                { pubkey: this.stablecoinStatePDA, isSigner: false, isWritable: false },
                { pubkey: roleAccountPDA, isSigner: false, isWritable: false },
                { pubkey: this.mint, isSigner: false, isWritable: true },
                { pubkey: params.fromAccount, isSigner: false, isWritable: true },
                { pubkey: params.toAccount, isSigner: false, isWritable: true },
                { pubkey: params.seizer.publicKey, isSigner: true, isWritable: false },
                { pubkey: spl_token_1.TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            programId: constants_1.STABLECOIN_CORE_PROGRAM_ID,
            data: Buffer.from([]), // Serialize amount
        };
        const transaction = new web3_js_1.Transaction().add(instruction);
        const signature = await this.connection.sendTransaction(transaction, [params.seizer]);
        await this.connection.confirmTransaction(signature);
        console.log(`Seized ${params.amount.toString()} tokens from ${params.fromAccount.toBase58()} to ${params.toAccount.toBase58()}`);
        return signature;
    }
    /**
     * Check if an address is blacklisted
     */
    async isBlacklisted(address) {
        const [blacklistEntryPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.BLACKLIST_SEED, this.stablecoinStatePDA.toBuffer(), address.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const accountInfo = await this.connection.getAccountInfo(blacklistEntryPDA);
        if (!accountInfo) {
            return false;
        }
        // Deserialize and check if active
        // Note: In production, use Anchor's account deserialization
        const entry = {}; // Parse from accountInfo.data
        return entry.isActive;
    }
    /**
     * Get blacklist entry details
     */
    async getBlacklistEntry(address) {
        const [blacklistEntryPDA] = web3_js_1.PublicKey.findProgramAddressSync([constants_1.BLACKLIST_SEED, this.stablecoinStatePDA.toBuffer(), address.toBuffer()], constants_1.STABLECOIN_CORE_PROGRAM_ID);
        const accountInfo = await this.connection.getAccountInfo(blacklistEntryPDA);
        if (!accountInfo) {
            return null;
        }
        // Deserialize account data
        // Note: In production, use Anchor's account deserialization
        const entry = {}; // Parse from accountInfo.data
        return entry;
    }
    /**
     * List all blacklisted addresses
     * Note: This is a simplified version. In production, use getProgramAccounts with filters
     */
    async listBlacklisted() {
        // Get all blacklist entry accounts
        const accounts = await this.connection.getProgramAccounts(constants_1.STABLECOIN_CORE_PROGRAM_ID, {
            filters: [
            // Filter for blacklist entries
            // Add appropriate filters based on account discriminator
            ],
        });
        const blacklisted = [];
        for (const account of accounts) {
            // Deserialize and check if active
            const entry = {}; // Parse from account.account.data
            if (entry.isActive) {
                blacklisted.push(entry.address);
            }
        }
        return blacklisted;
    }
    /**
     * Get compliance statistics
     */
    async getComplianceStats() {
        const blacklisted = await this.listBlacklisted();
        // Note: In production, track seized amounts in state or events
        return {
            totalBlacklisted: blacklisted.length,
            totalSeized: new bn_js_1.default(0), // Would need to aggregate from events
            lastBlacklistUpdate: null, // Would need to track in state
        };
    }
}
exports.ComplianceModule = ComplianceModule;
