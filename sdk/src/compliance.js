"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceModule = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
class ComplianceModule {
    program;
    configPda;
    payer;
    connection;
    constructor(program, configPda, payer, connection) {
        this.program = program;
        this.configPda = configPda;
        this.payer = payer;
        this.connection = connection;
    }
    static getBlacklistPda(configPda, account, programId) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("blacklist"), configPda.toBuffer(), account.toBuffer()], programId);
    }
    static getRolePda(configPda, authority, programId) {
        return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), configPda.toBuffer(), authority.toBuffer()], programId);
    }
    async blacklistAdd(account, reason) {
        const [roleRegistry] = ComplianceModule.getRolePda(this.configPda, this.payer.publicKey, this.program.programId);
        const [blacklistRecord] = ComplianceModule.getBlacklistPda(this.configPda, account, this.program.programId);
        // @ts-ignore
        const tx = await this.program.methods
            .addToBlacklist(account, reason)
            .accounts({
            blacklister: this.payer.publicKey,
            config: this.configPda,
            roleRegistry,
            blacklistRecord,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .signers([this.payer])
            .rpc();
        return tx;
    }
    async blacklistRemove(account) {
        const [roleRegistry] = ComplianceModule.getRolePda(this.configPda, this.payer.publicKey, this.program.programId);
        const [blacklistRecord] = ComplianceModule.getBlacklistPda(this.configPda, account, this.program.programId);
        // @ts-ignore
        const tx = await this.program.methods
            .removeFromBlacklist(account)
            .accounts({
            blacklister: this.payer.publicKey,
            config: this.configPda,
            roleRegistry,
            blacklistRecord,
        })
            .signers([this.payer])
            .rpc();
        return tx;
    }
    async seize(mintAccount, from, to, amount) {
        const [roleRegistry] = ComplianceModule.getRolePda(this.configPda, this.payer.publicKey, this.program.programId);
        const BN = require('bn.js');
        // @ts-ignore
        const tx = await this.program.methods
            .seize(new BN(amount))
            .accounts({
            seizer: this.payer.publicKey,
            config: this.configPda,
            roleRegistry,
            mint: mintAccount,
            from,
            to,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.payer])
            .rpc();
        return tx;
    }
    async freezeAccount(mintAccount, account) {
        const [roleRegistry] = ComplianceModule.getRolePda(this.configPda, this.payer.publicKey, this.program.programId);
        // @ts-ignore
        return await this.program.methods
            .freezeAccount()
            .accounts({
            pauser: this.payer.publicKey,
            config: this.configPda,
            roleRegistry,
            mint: mintAccount,
            accountToFreeze: account,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.payer])
            .rpc();
    }
    async thawAccount(mintAccount, account) {
        const [roleRegistry] = ComplianceModule.getRolePda(this.configPda, this.payer.publicKey, this.program.programId);
        // @ts-ignore
        return await this.program.methods
            .thawAccount()
            .accounts({
            pauser: this.payer.publicKey,
            config: this.configPda,
            roleRegistry,
            mint: mintAccount,
            accountToFreeze: account,
            tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
        })
            .signers([this.payer])
            .rpc();
    }
}
exports.ComplianceModule = ComplianceModule;
