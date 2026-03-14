import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY, sendAndConfirmTransaction, AccountMeta, TransactionInstruction, SendTransactionError } from "@solana/web3.js";
import { 
    TOKEN_2022_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction,
    ExtensionType, 
    getMintLen, 
    createInitializeMint2Instruction,
    createSetAuthorityInstruction,
    AuthorityType,
    createInitializePermanentDelegateInstruction, // Для SSS-2
    createInitializeTransferHookInstruction,
    createTransferCheckedInstruction,
} from "@solana/spl-token";
import idl from './idl.json';
import hookIdl from './transfer_hook_idl.json';

// --- ПРЕСЕТЫ СТАНДАРТОВ ---
export const Presets = {
    SSS_1: { enableTransferHook: false, enablePermanentDelegate: false },
    SSS_2: { enableTransferHook: true, enablePermanentDelegate: true },
    ORACLE_BACKED: { enableTransferHook: false, enablePermanentDelegate: false }
};

export class StablecoinSDK {
    public program: any;
    public hookProgram: any; // <-- Программа Хука
    public connection: Connection;
    public provider: AnchorProvider;
    public payer: Keypair; 
    
    public compliance: {
        blacklistAdd: (address: PublicKey, hookProgramId: PublicKey) => Promise<void>;
        seize: (mintAddress: PublicKey, fromAccount: PublicKey, toAccount: PublicKey, amount: number, decimals?: number) => Promise<void>;
    };

    constructor(connection: Connection, payer: Keypair, programId: string, hookProgramId?: string) {
        this.connection = connection;
        this.payer = payer;
        const wallet = new Wallet(payer);
        this.provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
        
        const idlWithAddress = idl as any;
        idlWithAddress.address = programId;
        this.program = new Program(idlWithAddress, this.provider);

        // Инициализируем Хук Программу
        if (hookProgramId) {
            const hIdl = hookIdl as any;
            hIdl.address = hookProgramId;
            this.hookProgram = new Program(hIdl, this.provider);
        }

        this.compliance = {
            blacklistAdd: async (address: PublicKey, hookProgramId: PublicKey) => {
                if (!this.hookProgram) throw new Error("Hook program not initialized");

                const[blacklistPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("blacklist"), address.toBuffer()],
                    hookProgramId
                );

                console.log(`[Compliance] Adding ${address.toBase58()} to blacklist...`);
                const tx = await this.hookProgram.methods
                    .addToBlacklist(address)
                    .accounts({
                        payer: this.payer.publicKey,
                        blacklistRecord: blacklistPda,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                console.log(`✅ Blacklisted! Tx: ${tx}`);
            },

            // импорт AccountMeta уже есть
            seize: async (mintAddress: PublicKey, fromAccount: PublicKey, toAccount: PublicKey, amount: number, decimals: number = 6) => {
                const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
                const rawAmount = new BN(amount).mul(new BN(10).pow(new BN(decimals)));

                const treasuryAccount = getAssociatedTokenAddressSync(mintAddress, toAccount, false, TOKEN_2022_PROGRAM_ID);
                const accountInfo = await this.connection.getAccountInfo(treasuryAccount);
                

                if (!accountInfo) {
                    console.log("Treasury ATA not found. Creating it...");
                    const createAtaTx = new Transaction().add(
                        createAssociatedTokenAccountInstruction(this.payer.publicKey, treasuryAccount, toAccount, mintAddress, TOKEN_2022_PROGRAM_ID)
                    );
                    await sendAndConfirmTransaction(this.connection, createAtaTx, [this.payer], { commitment: "confirmed" });
                }
                const accountInfo_new=await this.connection.getAccountInfo(treasuryAccount)
                console.log ('account info after creating ATA:', accountInfo_new)

                console.log(`[Compliance] Seizing ${amount} tokens from ${fromAccount.toBase58()}...`);

                try {
                    // 1. Создаем базовую инструкцию через Anchor (БЕЗ rpc, только instruction)
                    const ix = await this.program.methods
                        .seizeTokens(rawAmount)
                        .accounts({
                            signer: this.payer.publicKey,
                            config: configPda,
                            mint: mintAddress,
                            frozenAccount: fromAccount,
                            treasuryAccount: treasuryAccount,
                            tokenProgram: TOKEN_2022_PROGRAM_ID,
                        })
                        .instruction(); // Получаем сырую инструкцию, чтобы можно было пушить ключи

                    // 2. УМНОЕ ДОБАВЛЕНИЕ АККАУНТОВ ХУКА (В КОНЕЦ)
                    if (this.hookProgram && this.hookProgram.programId) {
                        // Убеждаемся, что hookProgramId это именно PublicKey
                        const hookProgramId = new PublicKey(this.hookProgram.programId.toString());

                        ix.keys.push({ pubkey: hookProgramId, isSigner: false, isWritable: false });

                        const [extraPda] = PublicKey.findProgramAddressSync(
                            [Buffer.from("extra-account-metas"), mintAddress.toBuffer()],
                            hookProgramId
                        );
                        ix.keys.push({ pubkey: extraPda, isSigner: false, isWritable: false });

                        // Так как при seize транзакцию подписывает configPda (наш Permanent Delegate),
                        // Token-2022 будет использовать его как "отправителя" для хука.
                        const [delegateBlacklist] = PublicKey.findProgramAddressSync(
                            [Buffer.from("blacklist"), configPda.toBuffer()], 
                            hookProgramId
                        );
                        ix.keys.push({ pubkey: delegateBlacklist, isSigner: false, isWritable: false });
                    }

                    // 3. ОТПРАВЛЯЕМ ТРАНЗАКЦИЮ
                    const tx = new Transaction().add(ix);
                    tx.feePayer = this.payer.publicKey;
                    const { blockhash } = await this.connection.getLatestBlockhash();
                    tx.recentBlockhash = blockhash;
                    
                    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer], { skipPreflight: true, commitment: "confirmed" });
                    
                    console.log(`✅ Tokens Seized! Tx: https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);

                } catch (error: any) {
                    console.error("\n❌ SEIZE FAILED!");
                    if (error instanceof SendTransactionError) {
                        const logs = await error.getLogs(this.connection);
                        console.error("---- Program Logs ----");
                        console.error(logs?.join("\n"));
                        console.error("----------------------");
                    }
                    
                    // ДОСТАЕМ ЛОГИ ДЛЯ ЛЮБОЙ ОШИБКИ
                    if (error.signature) {
                        console.log(`Fetching logs for signature: ${error.signature}...`);
                        // Ждем секунду, чтобы нода успела записать логи
                        await new Promise(r => setTimeout(r, 1000));
                        const txDetails = await this.connection.getTransaction(error.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
                        if (txDetails && txDetails.meta && txDetails.meta.logMessages) {
                            console.error("\n📄 ON-CHAIN LOGS:");
                            console.error(txDetails.meta.logMessages.join('\n'));
                        } else {
                            console.error("Could not fetch on-chain logs. The transaction might have been dropped.");
                        }
                    } else if (error.logs) {
                        console.error("\n📄 SIMULATION LOGS:");
                        console.error(error.logs.join('\n'));
                    } else {
                        console.error(error.message);
                    }
                    throw error;
                }
            }
        }
    }

    public async create(
        name: string, 
        symbol: string, 
        uri: string, 
        decimals: number = 6,
        preset: { enableTransferHook: boolean, enablePermanentDelegate: boolean } = Presets.SSS_1,
        hookAddress?: PublicKey,
        oracleFeed?: PublicKey
    ) {
        const mintKeypair = Keypair.generate();
        const[configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        
        const tempAuthority = this.payer.publicKey;

        console.log(`\n=== 🛠 СОЗДАНИЕ ТОКЕНА ===`);
        console.log(`Name: ${name} (${symbol}) | SSS-2 Compliant: ${preset.enablePermanentDelegate}`);
        console.log(`Preset: ${preset === Presets.SSS_2 ? 'SSS-2 (Compliant)' : 'SSS-1 (Minimal)'}`);

        // 1. ДИНАМИЧЕСКИЙ РАСЧЕТ РАЗМЕРА ТОЛЬКО ДЛЯ РЕАЛЬНЫХ РАСШИРЕНИЙ (БЕЗ METADATA!)
        const extensions: ExtensionType[] = [];
        if (preset.enablePermanentDelegate) extensions.push(ExtensionType.PermanentDelegate);
        if (preset.enableTransferHook) extensions.push(ExtensionType.TransferHook);

        const mintLen = getMintLen(extensions);
        const lamports = await this.connection.getMinimumBalanceForRentExemption(mintLen);

        // 2. СОЗДАЕМ ТРАНЗАКЦИЮ
        const initTokenTx = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: tempAuthority,
                newAccountPubkey: mintKeypair.publicKey,
                space: mintLen, 
                lamports: lamports,
                programId: TOKEN_2022_PROGRAM_ID,
            })
        );

        if (preset.enablePermanentDelegate) {
            initTokenTx.add(createInitializePermanentDelegateInstruction(mintKeypair.publicKey, configPda, TOKEN_2022_PROGRAM_ID));
        }

        if (preset.enableTransferHook && hookAddress) {
            initTokenTx.add(createInitializeTransferHookInstruction(mintKeypair.publicKey, configPda, hookAddress, TOKEN_2022_PROGRAM_ID));
        }

        // Инициализируем Mint2 (И больше никакой магии с метаданными!)
        initTokenTx.add(
            createInitializeMint2Instruction(mintKeypair.publicKey, decimals, tempAuthority, tempAuthority, TOKEN_2022_PROGRAM_ID)
        );

        console.log("1/3 Sending Token-2022 Initialization...");
        const txSig1 = await sendAndConfirmTransaction(this.connection, initTokenTx, [this.payer, mintKeypair], { commitment: 'confirmed' });
        console.log(`✅ Token Initialized Successfully! Tx: ${txSig1}`);

        // 3. ПЕРЕДАЧА ПРАВ
        const finalizeTx = new Transaction().add(
            createSetAuthorityInstruction(mintKeypair.publicKey, tempAuthority, AuthorityType.MintTokens, configPda,[], TOKEN_2022_PROGRAM_ID),
            createSetAuthorityInstruction(mintKeypair.publicKey, tempAuthority, AuthorityType.FreezeAccount, configPda,[], TOKEN_2022_PROGRAM_ID)
        );

        console.log("2/3 Transferring Authority to Smart Contract...");
        await sendAndConfirmTransaction(this.connection, finalizeTx, [this.payer], { commitment: "confirmed" });

        // 4. ЗАПИСЬ КОНФИГА (Смарт-контракт сам сохранит name, symbol, uri в свой PDA)
        console.log("3/3 Saving Config to Smart Contract...");
        const tx = await this.program.methods
            .initialize(decimals, preset.enablePermanentDelegate, preset.enableTransferHook, false, oracleFeed || null, name, symbol, uri)
            .accounts({
                payer: tempAuthority,
                config: configPda,
                mint: mintKeypair.publicKey,
                transferHookProgramId: hookAddress || null,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .signers([mintKeypair])
            .rpc();

        console.log(`\n🎉 УСПЕХ! СТЕЙБЛКОИН ПОЛНОСТЬЮ СОЗДАН!`);
        return mintKeypair.publicKey;
    }

    public async initializeExtraAccountMetaList(mintAddress: PublicKey) {
        if (!this.hookProgram) {
            throw new Error("Hook program not initialized. Pass hookProgramId in constructor.");
        }

        const [extraPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("extra-account-metas"), mintAddress.toBuffer()],
            this.hookProgram.programId
        );

        console.log(`[Compliance] Initializing ExtraAccountMetaList for mint ${mintAddress.toBase58()}...`);

        const tx = await this.hookProgram.methods
            .initializeExtraAccountMetaList()
            .accounts({
                payer: this.payer.publicKey,
                extraAccountMetaList: extraPda,
                mint: mintAddress,
                wsolMint: new PublicKey("So11111111111111111111111111111111111111112"), // NATIVE_MINT
                tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // TOKEN_PROGRAM_ID
                associatedTokenProgram: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), // ASSOCIATED_TOKEN_PROGRAM_ID
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log(`✅ ExtraAccountMetaList initialized! Tx: ${tx}`);
        return extraPda;
    }

    // public async seize(mintAddress: PublicKey, fromAccount: PublicKey, toAccount: PublicKey, amount: number, decimals: number = 6) {
    //     const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
    //     const rawAmount = new BN(amount * Math.pow(10, decimals));
    //     const treasuryAccount = getAssociatedTokenAddressSync(
    //         mintAddress,
    //         toAccount,
    //         false,
    //         TOKEN_2022_PROGRAM_ID
    //     );
    //     const accountInfo = await this.connection.getAccountInfo(treasuryAccount);

    //     if (!accountInfo) {
    //         console.log("Treasury ATA not found. Creating it...");
    //         const createAtaTx = new Transaction().add(
    //             createAssociatedTokenAccountInstruction(
    //                 this.payer.publicKey,
    //                 treasuryAccount,
    //                 toAccount,
    //                 mintAddress,
    //                 TOKEN_2022_PROGRAM_ID
    //             )
    //         );

    //         await sendAndConfirmTransaction(
    //             this.connection,
    //             createAtaTx,
    //             [this.payer],
    //             { commitment: "confirmed" }
    //         );
    //     }


    //     console.log(`Seizing ${amount} tokens from ${fromAccount.toBase58()}...`);
    //     const tx = await this.program.methods
    //         .seizeTokens(rawAmount)
    //         .accounts({
    //             signer: this.payer.publicKey,
    //             config: configPda,
    //             mint: mintAddress,
    //             frozenAccount: fromAccount,
    //             treasuryAccount: treasuryAccount,
    //             tokenProgram: TOKEN_2022_PROGRAM_ID,
    //         })
    //         .rpc();

    //     console.log(`✅ Tokens Seized! Tx: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
    // }

    public async mint(mintAddress: PublicKey, to: PublicKey, amount: number, decimals: number = 6, oracleFeed?: PublicKey) {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        const tokenAccount = getAssociatedTokenAddressSync(mintAddress, to, false, TOKEN_2022_PROGRAM_ID);
        const rawAmount = new BN(amount * Math.pow(10, decimals));

        const accountInfo = await this.connection.getAccountInfo(tokenAccount);
        if (!accountInfo) {
            console.log("Receiver token account not found. Creating it...");
            const createAtaTx = new Transaction().add(
                createAssociatedTokenAccountInstruction(this.payer.publicKey, tokenAccount, to, mintAddress, TOKEN_2022_PROGRAM_ID)
            );
            await sendAndConfirmTransaction(this.connection, createAtaTx, [this.payer], { commitment: 'confirmed' });
        }

        console.log(`Minting ${amount} tokens to ${to.toBase58()}...`);
        const tx = await this.program.methods
            .mintToken(rawAmount)
            .accounts({
                signer: this.payer.publicKey,
                config: configPda,
                mint: mintAddress,
                tokenAccount: tokenAccount,
                oracleFeedAccount: oracleFeed || null,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();

        console.log(`✅ Mint Successful! Transaction: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
    }
    // Вспомогательная функция для перевода токенов (нужна для тестов TransferHook)
    public async transfer(
        mintAddress: PublicKey,
        fromKeypair: Keypair,
        to: PublicKey,
        amount: number,
        decimals: number = 6,
        hookProgram?: PublicKey
    ) {
        const fromAta = getAssociatedTokenAddressSync(mintAddress, fromKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID);
        const toAta = getAssociatedTokenAddressSync(mintAddress, to, false, TOKEN_2022_PROGRAM_ID);
        const rawAmount = new BN(amount * Math.pow(10, decimals));

        const accountInfo = await this.connection.getAccountInfo(toAta);
        if (!accountInfo) {
            const createAtaTx = new Transaction().add(
                createAssociatedTokenAccountInstruction(this.payer.publicKey, toAta, to, mintAddress, TOKEN_2022_PROGRAM_ID)
            );
            await sendAndConfirmTransaction(this.connection, createAtaTx, [this.payer], { commitment: 'confirmed' });
        }

        const transferIx = createTransferCheckedInstruction(
            fromAta, mintAddress, toAta, fromKeypair.publicKey, rawAmount, decimals,[], TOKEN_2022_PROGRAM_ID
        );

        if (hookProgram) {
            transferIx.keys.push({ pubkey: hookProgram, isSigner: false, isWritable: false });
            const [extraPda] = PublicKey.findProgramAddressSync([Buffer.from("extra-account-metas"), mintAddress.toBuffer()], hookProgram);
            transferIx.keys.push({ pubkey: extraPda, isSigner: false, isWritable: false });

            // Отправителем является fromKeypair.publicKey
            const [sourceBlacklist] = PublicKey.findProgramAddressSync([Buffer.from("blacklist"), fromKeypair.publicKey.toBuffer()], hookProgram);
            transferIx.keys.push({ pubkey: sourceBlacklist, isSigner: false, isWritable: false });
        }

        const transferTx = new Transaction().add(transferIx);
        return await sendAndConfirmTransaction(this.connection, transferTx, [fromKeypair], { commitment: 'confirmed' });
    }

    public async updateMockOracle(price: number, decimals: number = 6) {
        const [oraclePda] = PublicKey.findProgramAddressSync([Buffer.from("mock_oracle")], this.program.programId);
        const rawPrice = new BN(price * Math.pow(10, decimals));

        console.log(`Setting Oracle Price to: ${price}`);
        const tx = await this.program.methods
            .updateMockOracle(rawPrice, decimals)
            .accounts({
                admin: this.payer.publicKey,
                oracle: oraclePda,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        
        console.log(`✅ Oracle Updated! Tx: ${tx}`);
        return oraclePda;
    }

    public async burn(mintAddress: PublicKey, fromAccount: PublicKey, amount: number, decimals: number = 6) {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        
        // Вычисляем ATA аккаунта, с которого будем сжигать
        const tokenAccount = getAssociatedTokenAddressSync(mintAddress, fromAccount, false, TOKEN_2022_PROGRAM_ID);
        const rawAmount = new BN(amount).mul(new BN(10).pow(new BN(decimals)));

        console.log(`🔥 Burning ${amount} tokens from ${fromAccount.toBase58()}...`);
        
        const tx = await this.program.methods
            .burnToken(rawAmount)
            .accounts({
                signer: this.payer.publicKey, // Тот, кто вызывает сжигание (Должен быть Burner)
                config: configPda,
                mint: mintAddress,
                tokenAccount: tokenAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();

        console.log(`✅ Burn Successful! Transaction: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
    }
}