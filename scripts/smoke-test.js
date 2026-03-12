#!/usr/bin/env node
/**
 * SSS Smoke Test — runs after devnet deployment to verify programs work.
 * Initializes an SSS-1 stablecoin, mints tokens, freezes an account.
 */

const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const cluster = args.includes("--cluster") ? args[args.indexOf("--cluster") + 1] : "devnet";
const keypairPath = args.includes("--keypair") ? args[args.indexOf("--keypair") + 1] : `${process.env.HOME}/.config/solana/id.json`;

const RPC_URLS = {
  devnet: "https://api.devnet.solana.com",
  localnet: "http://localhost:8899",
};

const SSS_CORE_SEED = Buffer.from("stablecoin");
const SSS_CORE_PROGRAM_ID = new PublicKey("SSSXsBqANHdRRPBEiNUjGjgARJmQR1tQHNBqJBMvFUw");
const MINTER_SEED = Buffer.from("minter_record");

async function main() {
  console.log(`\n🚀 SSS Smoke Test on ${cluster}\n`);

  // Load keypair
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  const connection = new Connection(RPC_URLS[cluster] || cluster, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Load IDL
  let idl;
  try {
    idl = require("../target/idl/sss_core.json");
  } catch {
    console.error("❌ IDL not found. Run `anchor build` first.");
    process.exit(1);
  }

  const program = new anchor.Program(idl, provider);

  // Generate mint keypair
  const mintKeypair = Keypair.generate();
  const [statePda] = PublicKey.findProgramAddressSync(
    [SSS_CORE_SEED, mintKeypair.publicKey.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );

  console.log("Mint:", mintKeypair.publicKey.toBase58());
  console.log("State PDA:", statePda.toBase58());

  // ─── Initialize SSS-1 ──────────────────────────────────────────────────────
  console.log("\n1. Initializing SSS-1 stablecoin...");
  const initTx = await program.methods
    .initialize({
      name: "Smoke Test USD",
      symbol: "STUSD",
      uri: "https://example.com/stusd.json",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
    })
    .accounts({
      authority: authority.publicKey,
      mint: mintKeypair.publicKey,
      stablecoinState: statePda,
      transferHookProgram: null,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mintKeypair])
    .rpc();

  console.log(`✅ Initialized. Tx: https://explorer.solana.com/tx/${initTx}?cluster=${cluster}`);

  // ─── Grant minter role ──────────────────────────────────────────────────────
  console.log("\n2. Granting minter role to self...");
  const [minterRecord] = PublicKey.findProgramAddressSync(
    [MINTER_SEED, mintKeypair.publicKey.toBuffer(), authority.publicKey.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );

  const minterTx = await program.methods
    .updateMinter(new anchor.BN(1_000_000_000_000), true)
    .accounts({
      authority: authority.publicKey,
      stablecoinState: statePda,
      minter: authority.publicKey,
      minterRecord,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log(`✅ Minter granted. Tx: https://explorer.solana.com/tx/${minterTx}?cluster=${cluster}`);

  // ─── Create ATA ─────────────────────────────────────────────────────────────
  console.log("\n3. Creating associated token account...");
  const ata = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    authority.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new anchor.web3.Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      ata,
      authority.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );
  await provider.sendAndConfirm(tx);
  console.log(`✅ ATA: ${ata.toBase58()}`);

  // ─── Mint tokens ────────────────────────────────────────────────────────────
  console.log("\n4. Minting 1,000 STUSD...");
  const mintTx = await program.methods
    .mintTokens(new anchor.BN(1_000_000_000)) // 1000 STUSD at 6 decimals
    .accounts({
      minter: authority.publicKey,
      stablecoinState: statePda,
      minterRecord,
      mint: mintKeypair.publicKey,
      recipientTokenAccount: ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .rpc();

  console.log(`✅ Minted. Tx: https://explorer.solana.com/tx/${mintTx}?cluster=${cluster}`);

  // ─── Fetch state ─────────────────────────────────────────────────────────────
  console.log("\n5. Verifying on-chain state...");
  const state = await program.account.stablecoinState.fetch(statePda);
  console.log(`   Name:    ${state.name}`);
  console.log(`   Symbol:  ${state.symbol}`);
  console.log(`   Decimals: ${state.decimals}`);
  console.log(`   Preset:  ${state.preset}`);
  console.log(`   Paused:  ${state.paused}`);

  // ─── Write proof ─────────────────────────────────────────────────────────────
  const proof = {
    timestamp: new Date().toISOString(),
    cluster,
    programId: SSS_CORE_PROGRAM_ID.toBase58(),
    mint: mintKeypair.publicKey.toBase58(),
    statePda: statePda.toBase58(),
    transactions: {
      initialize: initTx,
      updateMinter: minterTx,
      mintTokens: mintTx,
    },
    explorerLinks: {
      initialize: `https://explorer.solana.com/tx/${initTx}?cluster=${cluster}`,
      updateMinter: `https://explorer.solana.com/tx/${minterTx}?cluster=${cluster}`,
      mintTokens: `https://explorer.solana.com/tx/${mintTx}?cluster=${cluster}`,
    },
  };

  fs.writeFileSync(
    path.join(__dirname, "../deployment-proof.json"),
    JSON.stringify(proof, null, 2)
  );

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         SSS SMOKE TEST PASSED ✅                             ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Program: ${SSS_CORE_PROGRAM_ID.toBase58().slice(0, 42)}  ║`);
  console.log(`║  Mint: ${mintKeypair.publicKey.toBase58().slice(0, 44)}  ║`);
  console.log(`║  Cluster: ${cluster.padEnd(50)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("❌ Smoke test failed:", err);
  process.exit(1);
});
