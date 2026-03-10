import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { 
    TOKEN_2022_PROGRAM_ID, 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction 
} from "@solana/spl-token";
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

    public async create(name: string, symbol: string, uri: string, decimals: number = 6, hookAddress?: PublicKey) {
        const mintKeypair = Keypair.generate();
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);

        console.log(`\n=== 🛠 СОЗДАНИЕ ТОКЕНА SSS-1 ===`);
        console.log(`Name: ${name} (${symbol})`);
        console.log("Delegating Token Creation entirely to Smart Contract...");

        const tx = await this.program.methods
            .initialize(decimals, name, symbol, uri)
            .accounts({
                payer: this.provider.wallet.publicKey,
                config: configPda,
                mint: mintKeypair.publicKey,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                transferHookProgramId: hookAddress || null,
            })
            // Обязательно передаем mintKeypair, так как аккаунт создается от его имени!
            .signers([mintKeypair])
            .rpc();

        console.log(`✅ Token Created Successfully!`);
        console.log(`Mint Address: ${mintKeypair.publicKey.toBase58()}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
        
        return mintKeypair.publicKey;
    }

    public async mint(mintAddress: PublicKey, to: PublicKey, amount: number, decimals: number = 6) {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId);
        const tokenAccount = getAssociatedTokenAddressSync(mintAddress, to, false, TOKEN_2022_PROGRAM_ID);
        const rawAmount = new BN(amount * Math.pow(10, decimals));

        const accountInfo = await this.connection.getAccountInfo(tokenAccount);
        if (!accountInfo) {
            console.log("Receiver token account not found. Creating it...");
            const payerKeypair = (this.provider.wallet as any).payer;
            const createAtaTx = new Transaction().add(
                createAssociatedTokenAccountInstruction(this.provider.wallet.publicKey, tokenAccount, to, mintAddress, TOKEN_2022_PROGRAM_ID)
            );
            await sendAndConfirmTransaction(this.connection, createAtaTx, [payerKeypair], { commitment: 'confirmed' });
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

        console.log(`✅ Mint Successful! Transaction: https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`);
    }
}