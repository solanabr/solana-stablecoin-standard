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
exports.SolanaStablecoin = exports.ComplianceModule = exports.Presets = exports.Preset = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@coral-xyz/anchor"));
const anchor_1 = require("@coral-xyz/anchor");
const spl_token_1 = require("@solana/spl-token");
const presets_1 = require("./presets");
const utils_1 = require("./utils");
var presets_2 = require("./presets");
Object.defineProperty(exports, "Preset", { enumerable: true, get: function () { return presets_2.Preset; } });
Object.defineProperty(exports, "Presets", { enumerable: true, get: function () { return presets_2.Presets; } });
// ─── Compliance Module ────────────────────────────────────────────────────────
class ComplianceModule {
    constructor(sdk, program) {
        this.sdk = sdk;
        this.program = program;
    }
    assertEnabled() {
        if (!this.sdk.config.enablePermanentDelegate) {
            throw new Error("SSS-2 compliance is not enabled on this stablecoin. " +
                "Initialize with preset: Preset.SSS_2 to enable compliance features.");
        }
    }
    async blacklistAdd(address, reason) {
        this.assertEnabled();
        const [blacklistEntry] = (0, utils_1.findBlacklistEntryPDA)(this.sdk.statePDA, address);
        return this.program.methods
            .addToBlacklist(reason)
            .accounts({
            authority: this.sdk.authority.publicKey,
            state: this.sdk.statePDA,
            target: address,
            blacklistEntry,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
            .signers([this.sdk.authority])
            .rpc();
    }
    async blacklistRemove(address, reason) {
        this.assertEnabled();
        const [blacklistEntry] = (0, utils_1.findBlacklistEntryPDA)(this.sdk.statePDA, address);
        return this.program.methods
            .removeFromBlacklist(reason)
            .accounts({
            authority: this.sdk.authority.publicKey,
            state: this.sdk.statePDA,
            target: address,
            blacklistEntry,
        })
            .signers([this.sdk.authority])
            .rpc();
    }
    async isBlacklisted(address) {
        this.assertEnabled();
        const [blacklistEntry] = (0, utils_1.findBlacklistEntryPDA)(this.sdk.statePDA, address);
        const info = await this.sdk.connection.getAccountInfo(blacklistEntry);
        return info !== null && info.lamports > 0;
    }
    async seize(frozenAccount, treasury) {
        this.assertEnabled();
        const [blacklistEntry] = (0, utils_1.findBlacklistEntryPDA)(this.sdk.statePDA, frozenAccount);
        const [permanentDelegate] = (0, utils_1.findPermanentDelegatePDA)(this.sdk.statePDA);
        const fromAta = await (0, utils_1.getOrCreateTokenAccount)(this.sdk.connection, this.sdk.authority, this.sdk.mint, frozenAccount);
        const toAta = await (0, utils_1.getOrCreateTokenAccount)(this.sdk.connection, this.sdk.authority, this.sdk.mint, treasury);
        return this.program.methods
            .seize()
            .accounts({
            authority: this.sdk.authority.publicKey,
            state: this.sdk.statePDA,
            mint: this.sdk.mint,
            targetWallet: frozenAccount,
            blacklistEntry,
            fromTokenAccount: fromAta,
            treasuryTokenAccount: toAta,
            permanentDelegate,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.sdk.authority])
            .rpc();
    }
}
exports.ComplianceModule = ComplianceModule;
// ─── Main SDK class ───────────────────────────────────────────────────────────
class SolanaStablecoin {
    constructor(connection, mint, statePDA, authority, config, program) {
        this.connection = connection;
        this.mint = mint;
        this.statePDA = statePDA;
        this.authority = authority;
        this.config = config;
        this.program = program;
        this.compliance = new ComplianceModule(this, program);
    }
    /**
     * Create and initialize a new stablecoin.
     *
     * @example
     * // SSS-1 — minimal
     * const stable = await SolanaStablecoin.create({
     *   preset: Preset.SSS_1,
     *   name: "My Stablecoin", symbol: "MYUSD",
     *   authority: adminKeypair, connection,
     * });
     *
     * // SSS-2 — compliant
     * const stable = await SolanaStablecoin.create({
     *   preset: Preset.SSS_2,
     *   name: "My Stablecoin", symbol: "MYUSD",
     *   authority: adminKeypair, connection,
     * });
     *
     * // Custom
     * const stable = await SolanaStablecoin.create({
     *   name: "Custom", symbol: "CUSD",
     *   extensions: { permanentDelegate: true, transferHook: false },
     *   authority: adminKeypair, connection,
     * });
     */
    static async create(options) {
        const { preset, name, symbol, uri = "", decimals = 6, authority, extensions = {}, connection, } = options;
        // Resolve config from preset or custom extensions
        // Filter out undefined values to prevent overriding preset defaults
        const cleanOverrides = {};
        if (extensions.permanentDelegate !== undefined)
            cleanOverrides.enablePermanentDelegate = extensions.permanentDelegate;
        if (extensions.transferHook !== undefined)
            cleanOverrides.enableTransferHook = extensions.transferHook;
        if (extensions.defaultAccountFrozen !== undefined)
            cleanOverrides.defaultAccountFrozen = extensions.defaultAccountFrozen;
        const presetConfig = preset
            ? (0, presets_1.resolvePreset)(preset, cleanOverrides)
            : {
                enablePermanentDelegate: extensions.permanentDelegate ?? false,
                enableTransferHook: extensions.transferHook ?? false,
                defaultAccountFrozen: extensions.defaultAccountFrozen ?? false,
            };
        const config = {
            name,
            symbol,
            uri,
            decimals,
            enablePermanentDelegate: presetConfig.enablePermanentDelegate ?? false,
            enableTransferHook: presetConfig.enableTransferHook ?? false,
            defaultAccountFrozen: presetConfig.defaultAccountFrozen ?? false,
            transferHookProgramId: presetConfig.enableTransferHook ? utils_1.TRANSFER_HOOK_PROGRAM_ID : undefined,
        };
        const mintKeypair = options.mintKeypair ?? web3_js_1.Keypair.generate();
        const [statePDA] = (0, utils_1.findStatePDA)(mintKeypair.publicKey);
        const [mintAuthority] = (0, utils_1.findMintAuthorityPDA)(statePDA);
        const [freezeAuthority] = (0, utils_1.findFreezeAuthorityPDA)(statePDA);
        const [permanentDelegate] = (0, utils_1.findPermanentDelegatePDA)(statePDA);
        // Step 1: Create the Token-2022 mint with correct extensions
        await (0, utils_1.createMintWithExtensions)({
            connection,
            payer: authority,
            mintKeypair,
            decimals,
            mintAuthority,
            freezeAuthority,
            enablePermanentDelegate: config.enablePermanentDelegate,
            permanentDelegateKey: config.enablePermanentDelegate ? permanentDelegate : undefined,
            enableTransferHook: config.enableTransferHook,
            transferHookProgramId: config.transferHookProgramId,
            defaultAccountFrozen: config.defaultAccountFrozen,
            metadataPointerAuthority: authority.publicKey,
        });
        // Step 2: Load the Anchor program
        const provider = new anchor_1.AnchorProvider(connection, new anchor.Wallet(authority), {});
        const idl = options.idl ?? await anchor_1.Program.fetchIdl(utils_1.SSS_TOKEN_PROGRAM_ID, provider);
        if (!idl)
            throw new Error("SSS-token IDL not found on-chain. Pass idl option for local/test environments.");
        const program = new anchor_1.Program(idl, provider);
        // Step 3: Initialize state PDA
        await program.methods
            .initialize({
            name,
            symbol,
            uri,
            decimals,
            enablePermanentDelegate: config.enablePermanentDelegate,
            enableTransferHook: config.enableTransferHook,
            defaultAccountFrozen: config.defaultAccountFrozen,
            transferHookProgramId: config.transferHookProgramId ?? null,
        })
            .accounts({
            masterAuthority: authority.publicKey,
            state: statePDA,
            mint: mintKeypair.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
            .signers([authority, mintKeypair])
            .rpc();
        return new SolanaStablecoin(connection, mintKeypair.publicKey, statePDA, authority, config, program);
    }
    /**
     * Load an existing stablecoin by mint address.
     */
    static async load(connection, mint, authority, idl) {
        const [statePDA] = (0, utils_1.findStatePDA)(mint);
        const provider = new anchor_1.AnchorProvider(connection, new anchor.Wallet(authority), {});
        const resolvedIdl = idl ?? await anchor_1.Program.fetchIdl(utils_1.SSS_TOKEN_PROGRAM_ID, provider);
        if (!resolvedIdl)
            throw new Error("SSS-token IDL not found on-chain. Pass idl parameter for local/test environments.");
        const program = new anchor_1.Program(resolvedIdl, provider);
        const state = await program.account.stablecoinState.fetch(statePDA);
        const config = {
            name: state.name,
            symbol: state.symbol,
            uri: state.uri,
            decimals: state.decimals,
            enablePermanentDelegate: state.permanentDelegateEnabled,
            enableTransferHook: state.transferHookEnabled,
            defaultAccountFrozen: state.defaultAccountFrozen,
            transferHookProgramId: state.transferHookProgramId ?? undefined,
        };
        return new SolanaStablecoin(connection, mint, statePDA, authority, config, program);
    }
    // ─── Core Operations ────────────────────────────────────────────────────────
    /**
     * Mint tokens to a recipient.
     * Requires the minter to be registered via `addMinter()` and have sufficient quota.
     */
    async mintTokens(options) {
        const { recipient, amount, minter } = options;
        const [minterInfoPDA] = (0, utils_1.findMinterInfoPDA)(this.statePDA, minter.publicKey);
        const recipientAta = await (0, utils_1.getOrCreateTokenAccount)(this.connection, this.authority, this.mint, recipient);
        const [mintAuthority] = (0, utils_1.findMintAuthorityPDA)(this.statePDA);
        return this.program.methods
            .mint(new anchor_1.BN(amount.toString()))
            .accounts({
            minter: minter.publicKey,
            state: this.statePDA,
            mint: this.mint,
            minterInfo: minterInfoPDA,
            recipientTokenAccount: recipientAta,
            mintAuthority,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([minter])
            .rpc();
    }
    async burn(from, amount) {
        const fromAta = await (0, utils_1.getOrCreateTokenAccount)(this.connection, this.authority, this.mint, from);
        return this.program.methods
            .burn(new anchor_1.BN(amount.toString()))
            .accounts({
            authority: this.authority.publicKey,
            state: this.statePDA,
            mint: this.mint,
            fromTokenAccount: fromAta,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.authority])
            .rpc();
    }
    async freeze(account) {
        const [freezeAuthority] = (0, utils_1.findFreezeAuthorityPDA)(this.statePDA);
        const ata = await (0, utils_1.getOrCreateTokenAccount)(this.connection, this.authority, this.mint, account);
        return this.program.methods
            .freezeAccount()
            .accounts({
            authority: this.authority.publicKey,
            state: this.statePDA,
            mint: this.mint,
            tokenAccount: ata,
            freezeAuthority,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.authority])
            .rpc();
    }
    async thaw(account) {
        const [freezeAuthority] = (0, utils_1.findFreezeAuthorityPDA)(this.statePDA);
        const ata = await (0, utils_1.getOrCreateTokenAccount)(this.connection, this.authority, this.mint, account);
        return this.program.methods
            .thawAccount()
            .accounts({
            authority: this.authority.publicKey,
            state: this.statePDA,
            mint: this.mint,
            tokenAccount: ata,
            freezeAuthority,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.authority])
            .rpc();
    }
    async pause() {
        return this.program.methods
            .pause()
            .accounts({ authority: this.authority.publicKey, state: this.statePDA })
            .signers([this.authority])
            .rpc();
    }
    async unpause() {
        return this.program.methods
            .unpause()
            .accounts({ authority: this.authority.publicKey, state: this.statePDA })
            .signers([this.authority])
            .rpc();
    }
    async addMinter(minter, quota = 0) {
        const [minterInfo] = (0, utils_1.findMinterInfoPDA)(this.statePDA, minter);
        return this.program.methods
            .addMinter(new anchor_1.BN(quota.toString()))
            .accounts({
            authority: this.authority.publicKey,
            state: this.statePDA,
            minter,
            minterInfo,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
            .signers([this.authority])
            .rpc();
    }
    async removeMinter(minter) {
        const [minterInfo] = (0, utils_1.findMinterInfoPDA)(this.statePDA, minter);
        return this.program.methods
            .removeMinter()
            .accounts({
            authority: this.authority.publicKey,
            state: this.statePDA,
            minter,
            minterInfo,
        })
            .signers([this.authority])
            .rpc();
    }
    async updateRoles(roles) {
        return this.program.methods
            .updateRoles({
            pauser: roles.pauser === null ? web3_js_1.PublicKey.default : roles.pauser ?? null,
            burner: roles.burner === null ? web3_js_1.PublicKey.default : roles.burner ?? null,
            blacklister: roles.blacklister === null ? web3_js_1.PublicKey.default : roles.blacklister ?? null,
            seizer: roles.seizer === null ? web3_js_1.PublicKey.default : roles.seizer ?? null,
        })
            .accounts({
            authority: this.authority.publicKey,
            state: this.statePDA,
        })
            .signers([this.authority])
            .rpc();
    }
    async proposeAuthority(newAuthority) {
        return this.program.methods
            .proposeAuthority()
            .accounts({
            currentAuthority: this.authority.publicKey,
            proposedAuthority: newAuthority,
            state: this.statePDA,
        })
            .signers([this.authority])
            .rpc();
    }
    async acceptAuthority(newAuthorityKeypair) {
        return this.program.methods
            .acceptAuthority()
            .accounts({
            newAuthority: newAuthorityKeypair.publicKey,
            state: this.statePDA,
        })
            .signers([newAuthorityKeypair])
            .rpc();
    }
    // ─── Read-only helpers ───────────────────────────────────────────────────────
    async getState() {
        return this.program.account.stablecoinState.fetch(this.statePDA);
    }
    async getTotalSupply() {
        const state = await this.getState();
        return BigInt(state.totalMinted.toString()) - BigInt(state.totalBurned.toString());
    }
    async getMintInfo() {
        const { getMint } = await Promise.resolve().then(() => __importStar(require("@solana/spl-token")));
        const { TOKEN_2022_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@solana/spl-token")));
        return getMint(this.connection, this.mint, undefined, TOKEN_2022_PROGRAM_ID);
    }
    /**
     * List all minter accounts for this stablecoin.
     * Returns an array of { address, quota, mintedThisEpoch, active }.
     */
    async listMinters() {
        const accounts = await this.program.account.minterInfo.all([
            { memcmp: { offset: 8, bytes: this.statePDA.toBase58() } },
        ]);
        return accounts.map((a) => ({
            address: a.account.minter,
            quota: BigInt(a.account.quota.toString()),
            mintedThisEpoch: BigInt(a.account.mintedThisEpoch.toString()),
            active: a.account.active,
        }));
    }
    /**
     * Get all token holders for this stablecoin mint.
     * Returns an array of { owner, balance }.
     * Optionally filter by minimum balance.
     */
    async getHolders(minBalance = 0n) {
        const { TOKEN_2022_PROGRAM_ID } = await Promise.resolve().then(() => __importStar(require("@solana/spl-token")));
        const accounts = await this.connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
            filters: [
                { memcmp: { offset: 0, bytes: this.mint.toBase58() } },
            ],
        });
        const holders = [];
        for (const account of accounts) {
            const parsed = account.account.data?.parsed?.info;
            if (!parsed)
                continue;
            const balance = BigInt(parsed.tokenAmount?.amount ?? "0");
            if (balance >= minBalance) {
                holders.push({
                    owner: new web3_js_1.PublicKey(parsed.owner),
                    balance,
                });
            }
        }
        return holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
    }
}
exports.SolanaStablecoin = SolanaStablecoin;
