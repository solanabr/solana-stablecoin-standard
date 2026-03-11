import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import fs from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const idl = JSON.parse(fs.readFileSync("./target/idl/stablecoin.json", "utf8"));
const programId = new PublicKey("SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA");

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = new anchor.Program(idl, provider);

const mint = Keypair.generate();
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), mint.publicKey.toBuffer()],
  programId
);
const [mintAuthority] = PublicKey.findProgramAddressSync(
  [Buffer.from("authority"), mint.publicKey.toBuffer()],
  programId
);

console.log("Deploying S\u00b3 stablecoin on devnet...");
console.log("Mint:", mint.publicKey.toBase58());

// 1. Initialize
const initTx = await program.methods
  .initialize({
    preset: { sss1: {} },
    name: "S\u00b3 Dollar",
    symbol: "S3D",
    uri: "https://sss.example.com/metadata.json",
    decimals: 6,
    enablePermanentDelegate: null,
    enableTransferHook: null,
    enableConfidentialTransfers: null,
    defaultAccountFrozen: null,
    masterMinter: provider.wallet.publicKey,
    pauser: provider.wallet.publicKey,
    blacklister: null,
    auditorElgamalPubkey: null,
  })
  .accounts({
    authority: provider.wallet.publicKey,
    mint: mint.publicKey,
    config,
    mintAuthority,
    transferHookProgram: null,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .signers([mint])
  .rpc({ commitment: "confirmed" });

console.log("Initialize TX:", initTx);
await sleep(2000);

// 2. Create ATA
const tokenAccount = getAssociatedTokenAddressSync(
  mint.publicKey,
  provider.wallet.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID
);

const ataIx = createAssociatedTokenAccountInstruction(
  provider.wallet.publicKey,
  tokenAccount,
  provider.wallet.publicKey,
  mint.publicKey,
  TOKEN_2022_PROGRAM_ID
);
const ataTx = new anchor.web3.Transaction().add(ataIx);
const ataSig = await provider.sendAndConfirm(ataTx, [], { commitment: "confirmed" });
console.log("Create ATA TX:", ataSig);
await sleep(2000);

// 3. Add self as minter
const [minterInfo] = PublicKey.findProgramAddressSync(
  [Buffer.from("minter"), mint.publicKey.toBuffer(), provider.wallet.publicKey.toBuffer()],
  programId
);
const addMinterTx = await program.methods
  .addMinter(provider.wallet.publicKey, new BN(1000000000))
  .accounts({
    masterMinter: provider.wallet.publicKey,
    config,
    minterInfo,
    systemProgram: SystemProgram.programId,
  })
  .rpc({ commitment: "confirmed" });
console.log("Add Minter TX:", addMinterTx);
await sleep(2000);

// 4. Mint tokens (with retry for devnet blockhash issues)
let mintTokensTx;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    mintTokensTx = await program.methods
      .mintTokens(new BN(1000000))
      .accounts({
        minter: provider.wallet.publicKey,
        config,
        minterAllowance: minterInfo,
        mint: mint.publicKey,
        mintAuthority,
        recipientTokenAccount: tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
    console.log("Mint Tokens TX:", mintTokensTx);
    break;
  } catch (e) {
    console.log(`Mint attempt ${attempt} failed: ${e.message}`);
    if (attempt < 3) {
      console.log("Retrying in 5s...");
      await sleep(5000);
    } else {
      throw e;
    }
  }
}

console.log("\n=== S\u00b3 Devnet Deployment Proof ===");
console.log("Stablecoin Program:", programId.toBase58());
console.log("Mint Address:", mint.publicKey.toBase58());
console.log("Initialize TX:", initTx);
console.log("Create ATA TX:", ataSig);
console.log("Add Minter TX:", addMinterTx);
console.log("Mint Tokens TX:", mintTokensTx);
console.log("All devnet transactions successful!");
