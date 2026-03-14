import React, { useState, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';

// ИМПОРТИРУЕМ ВСЁ ЗДЕСЬ (никаких require внутри функций!)
import { 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction, 
    TOKEN_2022_PROGRAM_ID 
} from '@solana/spl-token';

import '@solana/wallet-adapter-react-ui/styles.css';

// ИМПОРТИРУЕМ IDL напрямую из папки target
import idl from '../../../target/idl/sss_core.json';

const PROGRAM_ID = new PublicKey("451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp");

const BankPortal = () => {
    const { connection } = useConnection();
    const { publicKey, signTransaction, signAllTransactions, sendTransaction } = useWallet();
    const [mintAddress, setMintAddress] = useState("");
    const [targetAddress, setTargetAddress] = useState("");
    const [amount, setAmount] = useState("100");
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [msg, ...prev].slice(0, 20));

    // Создаем Anchor Program для браузера
    const program = useMemo(() => {
        if (!publicKey || !signTransaction || !signAllTransactions) return null;
        
        // Создаем "браузерный" провайдер
        const provider = new AnchorProvider(
            connection, 
            { publicKey, signTransaction, signAllTransactions }, 
            { commitment: 'confirmed', preflightCommitment: 'confirmed' }
        );

        return new Program(idl as any, provider);
    }, [publicKey, connection, signTransaction, signAllTransactions]);


    const handleMint = async () => {
        if (!program || !publicKey || !mintAddress || !targetAddress) {
            addLog("❌ Please fill all fields and connect wallet");
            return;
        }
        
        try {
            addLog("⏳ Building transaction...");
            const mintPubkey = new PublicKey(mintAddress);
            const targetPubkey = new PublicKey(targetAddress);
            
            // ВАЖНО: Используем Anchor BN
            const rawAmount = new BN(parseFloat(amount) * Math.pow(10, 6)); 
            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
            
            
            
            // Используем true, чтобы не падало на PDA адресах
            const tokenAccount = getAssociatedTokenAddressSync(mintPubkey, targetPubkey, true, TOKEN_2022_PROGRAM_ID);

            const tx = new Transaction();

            // 1. Получаем свежий Blockhash (КРИТИЧНО ДЛЯ PHANTOM!)
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
            tx.recentBlockhash = blockhash;
            tx.lastValidBlockHeight = lastValidBlockHeight;
            tx.feePayer = publicKey; // Phantom платит за газ

            // 2. Проверяем, нужно ли создать ATA
            const accountInfo = await connection.getAccountInfo(tokenAccount);
            if (!accountInfo) {
                addLog("ℹ️ Creating Token Account...");
                tx.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,       // Кто платит за создание
                        tokenAccount,    // Какой аккаунт создаем
                        targetPubkey,    // Кто владелец аккаунта
                        mintPubkey,      // Какой токен
                        TOKEN_2022_PROGRAM_ID
                    )
                );
            }

            // 3. Создаем инструкцию Mint
            const mintIx = await program.methods
                .mintToken(rawAmount)
                .accounts({
                    signer: publicKey,
                    config: configPda,
                    mint: mintPubkey,
                    tokenAccount: tokenAccount,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    oracleFeedAccount: PublicKey.default,
                })
                .instruction(); // Получаем инструкцию, а не отправляем сразу (rpc)
            
            tx.add(mintIx);

            addLog("✍️ Please approve transaction in Phantom...");
            
            // 4. Отправляем через кошелек
            const signature = await sendTransaction(tx, connection);
            addLog(`✅ Transaction sent! Signature: ${signature.slice(0, 8)}...`);
            
            // 5. Ждем подтверждения
            await connection.confirmTransaction({
                blockhash,
                lastValidBlockHeight,
                signature
            }, 'confirmed');
            
            addLog(`🎉 Mint successful!`);

        } catch (e: any) {
            addLog(`❌ Error: ${e.message}`);
            console.error(e);
        }
    };

    return (
        <div className="min-h-screen p-8 max-w-4xl mx-auto font-sans">
            <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h1 className="text-3xl font-bold text-gray-800">🏦 SSS Bank Portal</h1>
                <WalletMultiButton />
            </div>

            {publicKey ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* ФОРМА */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-semibold mb-4 text-gray-800">Operator Dashboard</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Stablecoin Mint Address</label>
                                <input 
                                    className="block w-full rounded-md border-gray-300 border p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={mintAddress}
                                    onChange={(e) => setMintAddress(e.target.value)}
                                    placeholder="e.g. 78Ms5AmE..."
                                />
                            </div>

                            <hr className="my-2" />

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Target Wallet Address</label>
                                <input 
                                    className="block w-full rounded-md border-gray-300 border p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={targetAddress}
                                    onChange={(e) => setTargetAddress(e.target.value)}
                                    placeholder="Wallet to receive tokens"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Mint</label>
                                <input 
                                    type="number"
                                    className="block w-full rounded-md border-gray-300 border p-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </div>

                            <div className="flex space-x-4 pt-4">
                                <button 
                                    onClick={handleMint}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 w-full font-medium transition-colors"
                                >
                                    Mint Tokens
                                </button>
                                <button 
                                    onClick={() => addLog("❌ UI Blacklist requires Hook program ID. Use CLI for now.")}
                                    className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-900 w-full font-medium transition-colors"
                                >
                                    Blacklist Action
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ЛОГИ */}
                    <div className="bg-gray-900 p-6 rounded-xl shadow-lg border border-gray-700">
                        <h3 className="text-gray-300 mb-4 border-b border-gray-700 pb-2 font-semibold">Live Event Stream</h3>
                        <div className="text-green-400 font-mono text-sm overflow-y-auto h-80 space-y-2">
                            {logs.map((log, i) => (
                                <div key={i} className={log.includes("❌") ? "text-red-400" : log.includes("ℹ️") ? "text-blue-300" : ""}>
                                    {log}
                                </div>
                            ))}
                            {logs.length === 0 && <div className="text-gray-500 italic">Waiting for events...</div>}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-200">
                    <p className="text-gray-500 text-lg mb-4">Please connect your Phantom wallet to manage stablecoins.</p>
                </div>
            )}
        </div>
    );
};

function App() {
    const endpoint = "http://127.0.0.1:8899";
    const wallets = [new PhantomWalletAdapter()];

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <BankPortal />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}

export default App;