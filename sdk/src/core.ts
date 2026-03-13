import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { 
    createInitializeMintInstruction, 
    createInitializePermanentDelegateInstruction, 
    createInitializeTransferHookInstruction, 
    createInitializeDefaultAccountStateInstruction,
    ExtensionType,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
    AccountState
} from "@solana/spl-token";
import { Sss } from "./types";
import { Presets, getConfigForPreset, StablecoinConfigParams } from "./presets";
import { ComplianceModule } from "./compliance";

export interface CreateStablecoinParams {
    preset?: Presets;
    customConfig?: Omit<StablecoinConfigParams, 'enablePermanentDelegate' | 'enableTransferHook' | 'defaultAccountFrozen'>;
    authority: Keypair;
    mintKeypair?: Keypair; // Optional custom mint, else we generate
}

export class SolanaStablecoin {
    public compliance: ComplianceModule;

    private constructor(
        private program: Program<Sss>,
        private connection: Connection,
        public configPda: PublicKey,
        public mintAccount: PublicKey,
        private authority: Keypair
    ) {
        this.compliance = new ComplianceModule(program, configPda, authority, connection);
    }

    public static load(
        program: Program<Sss>,
        connection: Connection,
        configPda: PublicKey,
        mintAccount: PublicKey,
        authority: Keypair
    ): SolanaStablecoin {
        return new SolanaStablecoin(program, connection, configPda, mintAccount, authority);
    }

    static getConfigPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync([Buffer.from("config"), mint.toBuffer()], programId);
    }

    static getRolePda(configPda: PublicKey, authority: PublicKey, programId: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync([Buffer.from("role"), configPda.toBuffer(), authority.toBuffer()], programId);
    }

    static getQuotaPda(configPda: PublicKey, minter: PublicKey, programId: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync([Buffer.from("quota"), configPda.toBuffer(), minter.toBuffer()], programId);
    }

    static async create(
        connection: Connection,
        program: Program<Sss>,
        params: CreateStablecoinParams,
        baseParams: Omit<StablecoinConfigParams, 'enablePermanentDelegate' | 'enableTransferHook' | 'defaultAccountFrozen'>
    ): Promise<SolanaStablecoin> {
        
        let configParams: StablecoinConfigParams;
        if (params.preset) {
            configParams = getConfigForPreset(params.preset, baseParams);
        } else if (params.customConfig) {
            configParams = { ...baseParams, enablePermanentDelegate: false, enableTransferHook: false, defaultAccountFrozen: false };
        } else {
            throw new Error("Must provide either preset or customConfig");
        }

        const mint = params.mintKeypair || Keypair.generate();
        const [configPda] = this.getConfigPda(mint.publicKey, program.programId);

        // Calculate extensions
        const extensions: ExtensionType[] = [];
        if (configParams.enablePermanentDelegate) extensions.push(ExtensionType.PermanentDelegate);
        if (configParams.enableTransferHook) extensions.push(ExtensionType.TransferHook);
        if (configParams.defaultAccountFrozen) extensions.push(ExtensionType.DefaultAccountState);
        // Note: Metadata would also go here normally.

        const mintLen = getMintLen(extensions);
        const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

        const tx = new Transaction();

        tx.add(
            SystemProgram.createAccount({
                fromPubkey: params.authority.publicKey,
                newAccountPubkey: mint.publicKey,
                space: mintLen,
                lamports: mintLamports,
                programId: TOKEN_2022_PROGRAM_ID,
            })
        );

        if (configParams.enablePermanentDelegate) {
            tx.add(
                createInitializePermanentDelegateInstruction(
                    mint.publicKey,
                    configPda, // The SSS config PDA is the permanent delegate
                    TOKEN_2022_PROGRAM_ID
                )
            );
        }

        if (configParams.defaultAccountFrozen) {
            tx.add(
                createInitializeDefaultAccountStateInstruction(
                    mint.publicKey,
                    AccountState.Frozen,
                    TOKEN_2022_PROGRAM_ID
                )
            );
        }

        if (configParams.enableTransferHook) {
            // Assume the transfer hook program ID is known, or passed. We use a dummy for now.
            const transferHookProgramId = new PublicKey("3J9p2UafzvtLMWRao29D9DEbMqyUG6GS6GS8QCQakGA3");
            tx.add(
                createInitializeTransferHookInstruction(
                    mint.publicKey,
                    configPda, // Authority
                    transferHookProgramId, // Transfer Hook Program ID
                    TOKEN_2022_PROGRAM_ID
                )
            );
        }

        tx.add(
            createInitializeMintInstruction(
                mint.publicKey,
                configParams.decimals,
                configPda, // Mint authority is config PDA
                configPda, // Freeze authority is config PDA
                TOKEN_2022_PROGRAM_ID
            )
        );

        // Send initialization to SSS Anchor program
        // @ts-ignore
        const initIx = await program.methods
            .initialize(
                configParams.enablePermanentDelegate ?? false,
                configParams.enableTransferHook ?? false,
                configParams.defaultAccountFrozen ?? false
            )
            .accounts({
                payer: params.authority.publicKey,
                config: configPda,
                mint: mint.publicKey,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .instruction();

        tx.add(initIx);

        await sendAndConfirmTransaction(connection, tx, [params.authority, mint], { commitment: "confirmed" });

        return new SolanaStablecoin(program, connection, configPda, mint.publicKey, params.authority);
    }

    async mint({ recipient, amount, minter }: { recipient: PublicKey, amount: number, minter: Keypair }): Promise<string> {
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
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .preInstructions([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })])
            .signers([minter])
            .rpc();
        return tx;
    }

    async burn({ from, amount, burner }: { from: PublicKey, amount: number, burner: Keypair }): Promise<string> {
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
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .preInstructions([ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 })])
            .signers([burner])
            .rpc();
        
        return tx;
    }

    async getTotalSupply(): Promise<number> {
        const mintInfo = await this.connection.getTokenSupply(this.mintAccount);
        return mintInfo.value.uiAmount || 0;
    }
}
