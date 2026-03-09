import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { 
    TOKEN_2022_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction,
    ExtensionType, 
    getMintLen, 
    TYPE_SIZE, 
    LENGTH_SIZE,
    createInitializeMetadataPointerInstruction,
    createInitializeMint2Instruction,
    createSetAuthorityInstruction,
    AuthorityType
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import idl from './idl.json';

export class StablecoinSDK {
    public program: any;
    public connection: Connection;
    public provider: AnchorProvider;

    constructor(connection: Connection, wallet: any, programId: string) {
        this.connection = connection;
        this.provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
        const idlWithAddress = idl as any;
        idlWithAddress.address = programId;
        this.program = new Program(idlWithAddress, this.provider);
    }

    public async create(name: string, symbol: string, uri: string, decimals: number = 6) {
        const mintKeypair = Keypair.generate();
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        
        const tempAuthority = this.provider.wallet.publicKey;

        console.log(`\n=== 🛠 СОЗДАНИЕ ТОКЕНА SSS-1 ===`);
        console.log(`Name: ${name} (${symbol})`);

        // 1. СЕКРЕТ SOLANA: РАЗДЕЛЯЕМ SPACE И LAMPORTS
        
        // Считаем SPACE только для Pointer (Маленький размер)
        const spaceWithoutMetadata = getMintLen([ExtensionType.MetadataPointer]);
        
        // Формируем метаданные, чтобы узнать их вес
        const metadata = { updateAuthority: tempAuthority, mint: mintKeypair.publicKey, name, symbol, uri, additionalMetadata: [] };
        const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
        
        // Считаем LAMPORTS для ПОЛНОГО размера (Большие деньги)
        const spaceWithMetadata = spaceWithoutMetadata + metadataLen; 
        const lamportsForFullSpace = await this.connection.getMinimumBalanceForRentExemption(spaceWithMetadata);

        console.log(`Allocating space: ${spaceWithoutMetadata}, but paying lamports for: ${spaceWithMetadata}`);

        // --- ТРАНЗАКЦИЯ 1: ПОЛНАЯ ИНИЦИАЛИЗАЦИЯ ТОКЕНА (ALL IN ONE) ---
        const initTokenTx = new Transaction().add(
            // 1. Создаем аккаунт (Мало места, много денег)
            SystemProgram.createAccount({
                fromPubkey: tempAuthority,
                newAccountPubkey: mintKeypair.publicKey,
                space: spaceWithoutMetadata, 
                lamports: lamportsForFullSpace, 
                programId: TOKEN_2022_PROGRAM_ID,
            }),
            // 2. Инициализируем Pointer
            createInitializeMetadataPointerInstruction(
                mintKeypair.publicKey,
                tempAuthority,
                mintKeypair.publicKey,
                TOKEN_2022_PROGRAM_ID
            ),
            // 3. Инициализируем Mint (Он сработает, т.к. места мало!)
            createInitializeMint2Instruction(
                mintKeypair.publicKey,
                decimals,
                tempAuthority,
                tempAuthority,
                TOKEN_2022_PROGRAM_ID
            ),
            // 4. Инициализируем Метаданные (Он сделает realloc, используя излишек денег из шага 1!)
            createInitializeInstruction({
                programId: TOKEN_2022_PROGRAM_ID,
                metadata: mintKeypair.publicKey,
                updateAuthority: tempAuthority,
                mint: mintKeypair.publicKey,
                mintAuthority: tempAuthority,
                name,
                symbol,
                uri,
            })
        );

        console.log("1/2 Sending Full Token-2022 Initialization...");
        const txSig1 = await this.provider.sendAndConfirm(initTokenTx, [mintKeypair], {skipPreflight: true});
        console.log(`✅ Token Initialized! Tx: ${txSig1}`);

        // --- ТРАНЗАКЦИЯ 2: ПЕРЕДАЧА ПРАВ И СИНХРОНИЗАЦИЯ СО СМАРТ-КОНТРАКТОМ ---
        const finalizeTx = new Transaction().add(
            // Передаем права на MintPDA
            createSetAuthorityInstruction(mintKeypair.publicKey, tempAuthority, AuthorityType.MintTokens, configPda, [], TOKEN_2022_PROGRAM_ID),
            createSetAuthorityInstruction(mintKeypair.publicKey, tempAuthority, AuthorityType.FreezeAccount, configPda, [], TOKEN_2022_PROGRAM_ID)
        );

        console.log("2/2 Transferring Authority and Syncing Smart Contract...");
        await this.provider.sendAndConfirm(finalizeTx, []);

        // Сохраняем в смарт-контракт
        const tx = await this.program.methods
            .initialize(decimals, name, symbol, uri)
            .accounts({
                payer: tempAuthority,
                config: configPda,
                mint: mintKeypair.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log(`\n🎉 УСПЕХ! СТЕЙБЛКОИН SSS-1 СОЗДАН!`);
        console.log(`Mint Address: ${mintKeypair.publicKey.toBase58()}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
        
        return mintKeypair.publicKey;
    }

    public async mint(mintAddress: PublicKey, to: PublicKey, amount: number, decimals: number = 6) {
        // Код минта оставляем без изменений
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        const tokenAccount = getAssociatedTokenAddressSync(mintAddress, to, false, TOKEN_2022_PROGRAM_ID);
        const rawAmount = new BN(amount * Math.pow(10, decimals));

        const accountInfo = await this.connection.getAccountInfo(tokenAccount);
        if (!accountInfo) {
            console.log("Receiver token account not found. Creating it...");
            const createAtaTx = new Transaction().add(
                createAssociatedTokenAccountInstruction(this.provider.wallet.publicKey, tokenAccount, to, mintAddress, TOKEN_2022_PROGRAM_ID)
            );
            await this.provider.sendAndConfirm(createAtaTx, []);
        }

        console.log(`Minting ${amount} tokens to ${to.toBase58()}...`);
        const tx = await this.program.methods
            .mintToken(rawAmount)
            .accounts({
                signer: this.provider.wallet.publicKey,
                config: configPda,
                mint: mintAddress,
                tokenAccount: tokenAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc();

        console.log(`✅ Mint Successful! Tx: ${tx}`);
    }
}