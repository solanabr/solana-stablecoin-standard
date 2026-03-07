/**
 * Devnet proof script — demonstrates SSS-1 and SSS-2 on devnet.
 * Run: npx ts-node scripts/devnet-proof.ts
 *
 * Outputs TX signatures for README proof.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as os from "os";
import { findConfigPda, findMinterPda, findBlacklistPda, findExtraAccountMetaListPda } from "../sdk/core/src/pda";

const SSS_PROGRAM_ID = new PublicKey("AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm");
const HOOK_PROGRAM_ID = new PublicKey("9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7");

const SSS_IDL = require("../target/idl/sss_token.json");
const HOOK_IDL = require("../target/idl/sss_transfer_hook.json");

const DEVNET = "https://api.devnet.solana.com";

function loadWallet(): Keypair {
  const keyPath = os.homedir() + "/.config/solana/id.json";
  const raw = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function makeProgram(connection: Connection, payer: Keypair): Program {
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const idl = { ...SSS_IDL, address: SSS_PROGRAM_ID.toBase58() };
  return new Program(idl, provider);
}

function makeHookProgram(connection: Connection, payer: Keypair): Program {
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const idl = { ...HOOK_IDL, address: HOOK_PROGRAM_ID.toBase58() };
  return new Program(idl, provider);
}

async function createAta(connection: Connection, payer: Keypair, mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  );
  await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
  return ata;
}

async function main() {
  console.log("=== Solana Stablecoin Standard — Devnet Proof ===\n");

  const connection = new Connection(DEVNET, "confirmed");
  const authority = loadWallet();
  console.log(`Authority: ${authority.publicKey.toBase58()}`);

  const bal = await connection.getBalance(authority.publicKey);
  console.log(`Balance: ${bal / 1e9} SOL\n`);

  const program = makeProgram(connection, authority);
  const hookProgram = makeHookProgram(connection, authority);

  // ─── SSS-1 ────────────────────────────────────────────────────────────────
  console.log("─── SSS-1: Minimal Stablecoin ───");

  const mint1 = Keypair.generate();
  const [config1] = findConfigPda(mint1.publicKey, SSS_PROGRAM_ID);
  const minter1 = Keypair.generate();
  const recipient1 = Keypair.generate();

  // 1. Initialize SSS-1
  const initTx1 = await program.methods
    .initialize({
      name: "Proof USD",
      symbol: "PUSD",
      uri: "https://raw.githubusercontent.com/solanabr/solana-stablecoin-standard/main/docs/metadata/pusd.json",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      transferHookProgramId: null,
      burner: null,
      pauser: null,
      blacklister: null,
      seizer: null,
    })
    .accounts({
      authority: authority.publicKey,
      mint: mint1.publicKey,
      config: config1,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([authority, mint1])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-1] initialize:     ${initTx1}`);

  // 2. Add minter
  const [minter1Pda] = findMinterPda(mint1.publicKey, minter1.publicKey, SSS_PROGRAM_ID);
  const updateMinterTx = await program.methods
    .updateMinter({ minter: minter1.publicKey, quota: new anchor.BN(1_000_000_000), active: true })
    .accounts({
      authority: authority.publicKey,
      config: config1,
      minterInfo: minter1Pda,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-1] update_minter:  ${updateMinterTx}`);

  // 3. Mint tokens
  const recip1Ata = getAssociatedTokenAddressSync(mint1.publicKey, recipient1.publicKey, false, TOKEN_2022_PROGRAM_ID);

  // Fund minter1 for the tx fee
  const fundTx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: minter1.publicKey, lamports: 0.05 * 1e9 })
  );
  await sendAndConfirmTransaction(connection, fundTx, [authority], { commitment: "confirmed" });

  const program1Minter = makeProgram(connection, minter1);
  const mintTx1 = await program1Minter.methods
    .mintTokens(new anchor.BN(500_000_000))
    .accounts({
      minter: minter1.publicKey,
      config: config1,
      minterInfo: minter1Pda,
      mint: mint1.publicKey,
      recipientTokenAccount: recip1Ata,
      recipient: recipient1.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([minter1])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-1] mint_tokens:    ${mintTx1}`);

  // 4. Pause
  const pauseTx = await program.methods
    .pause()
    .accounts({ authority: authority.publicKey, config: config1 })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-1] pause:          ${pauseTx}`);

  // 5. Unpause
  const unpauseTx = await program.methods
    .unpause()
    .accounts({ authority: authority.publicKey, config: config1 })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-1] unpause:        ${unpauseTx}`);

  console.log(`\n[SSS-1] Mint:   ${mint1.publicKey.toBase58()}`);
  console.log(`[SSS-1] Config: ${config1.toBase58()}\n`);

  // ─── SSS-2 ────────────────────────────────────────────────────────────────
  console.log("─── SSS-2: Compliant Stablecoin ───");

  const mint2 = Keypair.generate();
  const [config2] = findConfigPda(mint2.publicKey, SSS_PROGRAM_ID);
  const [extraMeta2] = findExtraAccountMetaListPda(mint2.publicKey, HOOK_PROGRAM_ID);
  const minter2 = Keypair.generate();
  const alice2 = Keypair.generate();
  const treasury2 = Keypair.generate();

  // 1. Initialize SSS-2
  const initTx2 = await program.methods
    .initialize({
      name: "Compliant USD",
      symbol: "CUSD",
      uri: "https://raw.githubusercontent.com/solanabr/solana-stablecoin-standard/main/docs/metadata/cusd.json",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: false,
      transferHookProgramId: HOOK_PROGRAM_ID,
      burner: null,
      pauser: null,
      blacklister: authority.publicKey,
      seizer: authority.publicKey,
    })
    .accounts({
      authority: authority.publicKey,
      mint: mint2.publicKey,
      config: config2,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([authority, mint2])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-2] initialize:     ${initTx2}`);

  // 2. Init extra account meta list (hook)
  const initHookTx = await hookProgram.methods
    .initializeExtraAccountMetaList()
    .accounts({
      payer: authority.publicKey,
      extraAccountMetaList: extraMeta2,
      mint: mint2.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-2] init_hook_list: ${initHookTx}`);

  // 3. Add minter
  const [minter2Pda] = findMinterPda(mint2.publicKey, minter2.publicKey, SSS_PROGRAM_ID);
  const fundTx2 = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: authority.publicKey, toPubkey: minter2.publicKey, lamports: 0.01 * 1e9 })
  );
  await sendAndConfirmTransaction(connection, fundTx2, [authority], { commitment: "confirmed" });

  await program.methods
    .updateMinter({ minter: minter2.publicKey, quota: new anchor.BN(0), active: true })
    .accounts({
      authority: authority.publicKey,
      config: config2,
      minterInfo: minter2Pda,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  // 4. Mint to alice (init_if_needed creates ATA)
  const alice2Ata = getAssociatedTokenAddressSync(mint2.publicKey, alice2.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const treasury2Ata = getAssociatedTokenAddressSync(mint2.publicKey, treasury2.publicKey, false, TOKEN_2022_PROGRAM_ID);
  // pre-create treasury ATA
  await createAta(connection, authority, mint2.publicKey, treasury2.publicKey);

  const program2Minter = makeProgram(connection, minter2);
  const mintTx2 = await program2Minter.methods
    .mintTokens(new anchor.BN(1_000_000_000))
    .accounts({
      minter: minter2.publicKey,
      config: config2,
      minterInfo: minter2Pda,
      mint: mint2.publicKey,
      recipientTokenAccount: alice2Ata,
      recipient: alice2.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([minter2])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-2] mint_tokens:    ${mintTx2}`);

  // 5. Add alice to blacklist
  const [blacklistEntry] = findBlacklistPda(mint2.publicKey, alice2.publicKey, SSS_PROGRAM_ID);
  const blacklistTx = await program.methods
    .addToBlacklist(alice2.publicKey, "OFAC match — devnet proof")
    .accounts({
      blacklister: authority.publicKey,
      config: config2,
      blacklistEntry: blacklistEntry,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-2] add_blacklist:  ${blacklistTx}`);

  // 6. Seize from alice
  // For permanent delegate transfers, Token-2022 passes config PDA as "owner" to the hook.
  // So source_blacklist_entry seeds = [BLACKLIST_SEED, mint, config2] (not alice).
  // Both blacklist PDAs are owned by HOOK_PROGRAM_ID.
  const sourceBlacklist = PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint2.publicKey.toBuffer(), config2.toBuffer()],
    HOOK_PROGRAM_ID
  )[0];
  const destBlacklist = PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint2.publicKey.toBuffer(), treasury2Ata.toBuffer()],
    HOOK_PROGRAM_ID
  )[0];

  // Build seize instruction manually with hardcoded discriminator (same as tests/sss-2.ts)
  const seizeDiscriminator = Buffer.from([129, 159, 143, 31, 161, 224, 241, 84]);
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(BigInt(1_000_000_000));
  const seizeData = Buffer.concat([seizeDiscriminator, amountBuf]);

  const { TransactionInstruction } = await import("@solana/web3.js");
  const seizeIx = new TransactionInstruction({
    programId: SSS_PROGRAM_ID,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: false },
      { pubkey: config2, isSigner: false, isWritable: false },
      { pubkey: mint2.publicKey, isSigner: false, isWritable: true },
      { pubkey: alice2Ata, isSigner: false, isWritable: true },
      { pubkey: treasury2Ata, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: extraMeta2, isSigner: false, isWritable: false },
      { pubkey: sourceBlacklist, isSigner: false, isWritable: false },
      { pubkey: destBlacklist, isSigner: false, isWritable: false },
    ],
    data: seizeData,
  });

  const seizeTx = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(seizeIx),
    [authority],
    { commitment: "confirmed" }
  );
  console.log(`[SSS-2] seize:          ${seizeTx}`);

  // 7. Remove from blacklist
  const removeBlacklistTx = await program.methods
    .removeFromBlacklist(alice2.publicKey)
    .accounts({
      blacklister: authority.publicKey,
      config: config2,
      blacklistEntry: blacklistEntry,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });
  console.log(`[SSS-2] remove_blacklist: ${removeBlacklistTx}`);

  console.log(`\n[SSS-2] Mint:   ${mint2.publicKey.toBase58()}`);
  console.log(`[SSS-2] Config: ${config2.toBase58()}`);

  console.log("\n=== Proof Complete ===");
  console.log("\nAdd the following to your README devnet proof section:");
  console.log(`
| Operation           | Mint | Transaction |
|---------------------|------|-------------|
| SSS-1 initialize    | ${mint1.publicKey.toBase58()} | ${initTx1} |
| SSS-1 mint_tokens   | (above) | ${mintTx1} |
| SSS-1 pause         | (above) | ${pauseTx} |
| SSS-2 initialize    | ${mint2.publicKey.toBase58()} | ${initTx2} |
| SSS-2 mint_tokens   | (above) | ${mintTx2} |
| SSS-2 add_blacklist | (above) | ${blacklistTx} |
| SSS-2 seize         | (above) | ${seizeTx} |
| SSS-2 remove_blacklist | (above) | ${removeBlacklistTx} |
`);
}

main().catch(console.error);
