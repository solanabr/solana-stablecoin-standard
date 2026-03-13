"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaStablecoin = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const presets_1 = require("./presets");
const compliance_1 = require("./compliance");
class SolanaStablecoin {
    program;
    connection;
    configPda;
    mintAccount;
    authority;
    compliance;
    constructor(program, connection, configPda, mintAccount, authority) {
        this.program = program;
        this.connection = connection;
        this.configPda = configPda;
        this.mintAccount = mintAccount;
        this.authority = authority;
        this.compliance = new compliance_1.ComplianceModule(program, configPda, authority, connection);
    }
    static getConfigPda(mint, programId) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config"), mint.toBuffer()], programId);
    }
    static getRolePda(configPda, authority, programId) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), configPda.toBuffer(), authority.toBuffer()], programId);
    }
    static getQuotaPda(configPda, minter, programId) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("quota"), configPda.toBuffer(), minter.toBuffer()], programId);
    }
    static async create(connection, program, params, baseParams) {
        let configParams;
        if (params.preset) {
            configParams = (0, presets_1.getConfigForPreset)(params.preset, baseParams);
        }
        else if (params.customConfig) {
            configParams = { ...baseParams, enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false };
        }
        else {
            throw new Error("Must provide either preset or customConfig");
        }
        const mint = params.mintKeypair || web3_js_1.Keypair.generate();
        const [configPda] = this.getConfigPda(mint.publicKey, program.programId);
        // Calculate extensions
        const extensions = [];
        if (configParams.enablePermanentDelegate)
            extensions.push(spl_token_1.ExtensionType.PermanentDelegate);
        if (configParams.enableTransferHook)
            extensions.push(spl_token_1.ExtensionType.TransferHook);
        if (configParams.defaultAccountFrozen)
            extensions.push(spl_token_1.ExtensionType.DefaultAccountState);
        // Note: Metadata would also go here normally.
        const mintLen = (0, spl_token_1.getMintLen)(extensions);
        const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
        const tx = new web3_js_1.Transaction();
        tx.add(web3_js_1.SystemProgram.createAccount({
            fromPubkey: params.authority.publicKey,
            newAccountPubkey: mint.publicKey,
            space: mintLen,
            lamports: mintLamports,
            programId: spl_token_1.TOKEN_2022_PROGRAM_ID,
        }));
        if (configParams.enablePermanentDelegate) {
            tx.add((0, spl_token_1.createInitializePermanentDelegateInstruction)(mint.publicKey, configPda, // The SSS config PDA is the permanent delegate
            spl_token_1.TOKEN_2022_PROGRAM_ID));
        }
        if (configParams.defaultAccountFrozen) {
            tx.add((0, spl_token_1.createInitializeDefaultAccountStateInstruction)(mint.publicKey, spl_token_1.AccountState.Frozen, spl_token_1.TOKEN_2022_PROGRAM_ID));
        }
        if (configParams.enableTransferHook) {
            // Assume the transfer hook program ID is known, or passed. We use a dummy for now.
            const transferHookProgramId = new web3_js_1.PublicKey("3J9p2UafzvtLMWRao29D9DEbMqyUG6GS6GS8QCQakGA311");
            tx.add((0, spl_token_1.createInitializeTransferHookInstruction)(mint.publicKey, configPda, // Authority
            transferHookProgramId, // Transfer Hook Program ID
            spl_token_1.TOKEN_2022_PROGRAM_ID));
        }
        tx.add((0, spl_token_1.createInitializeMintInstruction)(mint.publicKey, configParams.decimals, configPda, // Mint authority is config PDA
        configPda, // Freeze authority is config PDA
        spl_token_1.TOKEN_2022_PROGRAM_ID));
        // Send initialization to SSS Anchor program
        // @ts-ignore
        const initIx = await program.methods
            .initialize(configParams.enablePermanentDelegate ?? false, configParams.enableTransferHook ?? false, configParams.defaultAccountFrozen ?? false)
            .accounts({
            payer: params.authority.publicKey,
            config: configPda,
            mint: mint.publicKey,
            systemProgram: web3_js_1.SystemProgram.programId,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .instruction();
        tx.add(initIx);
        await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [params.authority, mint], { commitment: "confirmed" });
        return new SolanaStablecoin(program, connection, configPda, mint.publicKey, params.authority);
    }
    async mint({ recipient, amount, minter }) {
        const [roleRegistry] = SolanaStablecoin.getRolePda(this.configPda, minter.publicKey, this.program.programId);
        const [quota] = SolanaStablecoin.getQuotaPda(this.configPda, minter.publicKey, this.program.programId);
        const BN = require('bn.js');
        // @ts-ignore
        const tx = await this.program.methods
            .mintToken(new BN(amount))
            .accounts({
            minter: minter.publicKey,
            config: this.configPda,
            roleRegistry,
            quota,
            mint: this.mintAccount,
            to: recipient,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([minter])
            .rpc();
        return tx;
    }
    async burn({ from, amount, burner }) {
        const [roleRegistry] = SolanaStablecoin.getRolePda(this.configPda, burner.publicKey, this.program.programId);
        const BN = require('bn.js');
        // @ts-ignore
        const tx = await this.program.methods
            .burnToken(new BN(amount))
            .accounts({
            burner: burner.publicKey,
            config: this.configPda,
            roleRegistry,
            mint: this.mintAccount,
            from: from,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([burner])
            .rpc();
        return tx;
    }
    async getTotalSupply() {
        const mintInfo = await this.connection.getTokenSupply(this.mintAccount);
        return mintInfo.value.uiAmount || 0;
    }
}
exports.SolanaStablecoin = SolanaStablecoin;
