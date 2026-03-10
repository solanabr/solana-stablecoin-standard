import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY, sendAndConfirmTransaction } from "@solana/web3.js";
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
    createInitializeTransferHookInstruction       // Для SSS-2
} from "@solana/spl-token";
import idl from './idl.json';

export class StablecoinSDK {
    public program: any;
    public connection: Connection;
    public provider: AnchorProvider;
    public payer: Keypair; 

    constructor(connection: Connection, payer: Keypair, programId: string) {
        this.connection = connection;
        this.payer = payer;
        
        const wallet = new Wallet(payer);
        this.provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
        
        const idlWithAddress = idl as any;
        idlWithAddress.address = programId;
        this.program = new Program(idlWithAddress, this.provider);
    }

    public async create(
        name: string, 
        symbol: string, 
        uri: string, 
        decimals: number = 6,
        enablePermanentDelegate: boolean = false,
        enableTransferHook: boolean = false,
        hookAddress?: PublicKey
    ) {
        const mintKeypair = Keypair.generate();
        const[configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        
        const tempAuthority = this.payer.publicKey;

        console.log(`\n=== 🛠 СОЗДАНИЕ ТОКЕНА ===`);
        console.log(`Name: ${name} (${symbol}) | SSS-2 Compliant: ${enablePermanentDelegate}`);

        // 1. ДИНАМИЧЕСКИЙ РАСЧЕТ РАЗМЕРА ТОЛЬКО ДЛЯ РЕАЛЬНЫХ РАСШИРЕНИЙ (БЕЗ METADATA!)
        const extensions: ExtensionType[] = [];
        if (enablePermanentDelegate) extensions.push(ExtensionType.PermanentDelegate);
        if (enableTransferHook) extensions.push(ExtensionType.TransferHook);

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

        if (enablePermanentDelegate) {
            initTokenTx.add(createInitializePermanentDelegateInstruction(mintKeypair.publicKey, configPda, TOKEN_2022_PROGRAM_ID));
        }

        if (enableTransferHook && hookAddress) {
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
            .initialize(decimals, enablePermanentDelegate, enableTransferHook, name, symbol, uri)
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

    public async seize(mintAddress: PublicKey, fromAccount: PublicKey, toAccount: PublicKey, amount: number, decimals: number = 6) {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        const rawAmount = new BN(amount * Math.pow(10, decimals));
        const treasuryAccount = getAssociatedTokenAddressSync(
            mintAddress,
            toAccount,
            false,
            TOKEN_2022_PROGRAM_ID
        );
        const accountInfo = await this.connection.getAccountInfo(treasuryAccount);

        if (!accountInfo) {
            console.log("Treasury ATA not found. Creating it...");
            const createAtaTx = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    this.payer.publicKey,
                    treasuryAccount,
                    toAccount,
                    mintAddress,
                    TOKEN_2022_PROGRAM_ID
                )
            );

            await sendAndConfirmTransaction(
                this.connection,
                createAtaTx,
                [this.payer],
                { commitment: "confirmed" }
            );
        }


        console.log(`Seizing ${amount} tokens from ${fromAccount.toBase58()}...`);
        const tx = await this.program.methods
            .seizeTokens(rawAmount)
            .accounts({
                signer: this.payer.publicKey,
                config: configPda,
                mint: mintAddress,
                frozenAccount: fromAccount,
                treasuryAccount: treasuryAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();

        console.log(`✅ Tokens Seized! Tx: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
    }

    public async mint(mintAddress: PublicKey, to: PublicKey, amount: number, decimals: number = 6) {
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
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();

        console.log(`✅ Mint Successful! Transaction: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
    }
}