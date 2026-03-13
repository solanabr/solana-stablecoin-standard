import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { Sss } from "./types";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export class ComplianceModule {
    constructor(
        private program: Program<Sss>,
        private configPda: PublicKey,
        private payer: Keypair,
        private connection: Connection
    ) {}

    static getBlacklistPda(configPda: PublicKey, account: PublicKey, programId: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync([Buffer.from("blacklist"), configPda.toBuffer(), account.toBuffer()], programId);
    }

    static getRolePda(configPda: PublicKey, authority: PublicKey, programId: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync([Buffer.from("role"), configPda.toBuffer(), authority.toBuffer()], programId);
    }

    async blacklistAdd(account: PublicKey, reason: string): Promise<string> {
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
                systemProgram: SystemProgram.programId,
            })
            .signers([this.payer])
            .rpc();

        return tx;
    }

    async blacklistRemove(account: PublicKey): Promise<string> {
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

    async seize(mintAccount: PublicKey, from: PublicKey, to: PublicKey, amount: number): Promise<string> {
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
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();

        return tx;
    }

    async freezeAccount(mintAccount: PublicKey, account: PublicKey): Promise<string> {
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
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }

    async thawAccount(mintAccount: PublicKey, account: PublicKey): Promise<string> {
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
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([this.payer])
            .rpc();
    }
}
