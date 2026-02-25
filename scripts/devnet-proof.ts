/**
 * Devnet Lifecycle Proof — SSS-1 and SSS-3
 *
 * Builds mint transactions manually (no metadata init to avoid PDA signer issue).
 * Uses explicit manual signing (getLatestBlockhash → sign → sendRawTransaction).
 */

import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from "@solana/web3.js";
import { AnchorProvider, Wallet, BN, Program } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  getMintLen,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  SSS,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  buildInitializeIx,
  deriveConfigPda,
} from "../sdk/dist";
import type { SssCore } from "../sdk/dist";
import { SssCoreIdl } from "../sdk/dist/idl";

const DEVNET_RPC = process.env.DEVNET_RPC || clusterApiUrl("devnet");

/** Sign, send, and confirm a transaction with explicit blockhash handling */
async function signSendConfirm(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const rawTx = tx.serialize();
  const sig = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

/**
 * Build SSS-1 mint creation tx WITHOUT metadata init
 * (metadata init requires PDA signer which can't sign client-side)
 */
async function buildSss1MintTx(
  connection: Connection,
  payer: PublicKey,
  mintKp: Keypair,
  configPda: PublicKey,
  decimals: number,
): Promise<Transaction> {
  const extensions = [ExtensionType.MetadataPointer, ExtensionType.PermanentDelegate];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  return new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mintKp.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mintKp.publicKey, configPda, mintKp.publicKey, TOKEN_2022_PROGRAM_ID,
    ),
    createInitializePermanentDelegateInstruction(
      mintKp.publicKey, configPda, TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMint2Instruction(
      mintKp.publicKey, decimals, configPda, configPda, TOKEN_2022_PROGRAM_ID,
    ),
  );
}

/**
 * Build ConfidentialTransferMint init instruction (manual — not in @solana/spl-token)
 */
function buildConfidentialTransferMintIx(
  mint: PublicKey,
  authority: PublicKey,
  autoApprove: boolean,
  auditorKey: Uint8Array,
): TransactionInstruction {
  const data = Buffer.alloc(67);
  let offset = 0;
  data.writeUInt8(27, offset); offset += 1; // ConfidentialTransferExtension
  data.writeUInt8(0, offset); offset += 1;  // InitializeMint
  authority.toBuffer().copy(data, offset); offset += 32;
  data.writeUInt8(autoApprove ? 1 : 0, offset); offset += 1;
  Buffer.from(auditorKey).copy(data, offset);

  return new TransactionInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    keys: [{ pubkey: mint, isSigner: false, isWritable: true }],
    data,
  });
}

/**
 * Build SSS-3 mint creation tx WITHOUT metadata init
 */
async function buildSss3MintTx(
  connection: Connection,
  payer: PublicKey,
  mintKp: Keypair,
  configPda: PublicKey,
  decimals: number,
): Promise<Transaction> {
  const extensions = [
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
    ExtensionType.ConfidentialTransferMint,
  ];
  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  return new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mintKp.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(
      mintKp.publicKey, configPda, mintKp.publicKey, TOKEN_2022_PROGRAM_ID,
    ),
    createInitializePermanentDelegateInstruction(
      mintKp.publicKey, configPda, TOKEN_2022_PROGRAM_ID,
    ),
    buildConfidentialTransferMintIx(
      mintKp.publicKey, configPda, true, new Uint8Array(32),
    ),
    createInitializeMint2Instruction(
      mintKp.publicKey, decimals, configPda, configPda, TOKEN_2022_PROGRAM_ID,
    ),
  );
}

async function main() {
  console.log("=== SSS Devnet Lifecycle Proof ===\n");

  const keypairPath = path.join(
    process.env.HOME!,
    "Documents/secret/sss-devnet-keypair.json",
  );
  const rawKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(rawKey));

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const coreProgram = new Program<SssCore>(
    SssCoreIdl as SssCore,
    provider,
  );

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer: ${payer.publicKey.toBase58()} (${(balance / 1e9).toFixed(4)} SOL)\n`);

  const proof: Record<string, unknown> = {
    payer: payer.publicKey.toBase58(),
    cluster: "devnet",
    timestamp: new Date().toISOString(),
    programs: {
      sss_core: SSS_CORE_PROGRAM_ID.toBase58(),
      sss_transfer_hook: SSS_HOOK_PROGRAM_ID.toBase58(),
    },
    presets: {} as Record<string, unknown>,
  };

  // ─── SSS-1: Minimal Stablecoin ────────────────────────────
  console.log("── SSS-1: Minimal Stablecoin ──");
  try {
    const mintKp = Keypair.generate();
    const [configPda] = deriveConfigPda(mintKp.publicKey, SSS_CORE_PROGRAM_ID);

    const mintTx = await buildSss1MintTx(
      connection, payer.publicKey, mintKp, configPda, 6,
    );

    // Add sss-core initialize instruction (handles adminRole PDA)
    const initIx = await buildInitializeIx(
      coreProgram, mintKp.publicKey, payer.publicKey,
      { preset: 1, name: "SSS1-Devnet", symbol: "S1D", uri: "", decimals: 6,
        supplyCap: new BN("1000000000000") },
    );
    mintTx.add(initIx);

    const sig1 = await signSendConfirm(connection, mintTx, [payer, mintKp]);
    console.log(`  Created mint: ${mintKp.publicKey.toBase58()}`);
    console.log(`  Init tx: ${sig1.slice(0, 20)}...`);

    // Load SSS instance for remaining operations
    const sss = await SSS.load(provider, mintKp.publicKey);

    // Grant minter
    const grantSig = await sss.roles.grant(payer.publicKey, "minter");
    console.log(`  Grant minter: ${grantSig.slice(0, 20)}...`);

    // Create ATA
    const ata = getAssociatedTokenAddressSync(
      sss.mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    await signSendConfirm(
      connection,
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey, ata, payer.publicKey, sss.mint, TOKEN_2022_PROGRAM_ID,
        ),
      ),
      [payer],
    );

    // Mint
    const mintSig = await sss.mintTokens(ata, BigInt(500_000_000));
    console.log(`  Mint 500: ${mintSig.slice(0, 20)}...`);

    // Burn
    const burnSig = await sss.burn(ata, BigInt(100_000_000));
    console.log(`  Burn 100: ${burnSig.slice(0, 20)}...`);

    // Freeze/thaw
    await sss.roles.grant(payer.publicKey, "freezer");
    const freezeSig = await sss.freeze(ata);
    console.log(`  Freeze: ${freezeSig.slice(0, 20)}...`);
    const thawSig = await sss.thaw(ata);
    console.log(`  Thaw: ${thawSig.slice(0, 20)}...`);

    // Pause/unpause
    await sss.roles.grant(payer.publicKey, "pauser");
    const pauseSig = await sss.pause();
    console.log(`  Pause: ${pauseSig.slice(0, 20)}...`);
    const unpauseSig = await sss.unpause();
    console.log(`  Unpause: ${unpauseSig.slice(0, 20)}...`);

    const info = await sss.info();
    console.log(`  Supply: ${info.currentSupply} (cap: ${info.supplyCap})`);

    (proof.presets as Record<string, unknown>)["sss-1"] = {
      mint: sss.mint.toBase58(),
      config: sss.configPda.toBase58(),
      transactions: { sig1, grantSig, mintSig, burnSig, freezeSig, thawSig, pauseSig, unpauseSig },
      finalSupply: info.currentSupply.toString(),
    };
    console.log("  ✓ SSS-1 complete\n");
  } catch (err) {
    console.error("  ✗ SSS-1 failed:", (err as Error).message, "\n");
    (proof.presets as Record<string, unknown>)["sss-1"] = { error: (err as Error).message };
  }

  // ─── SSS-3: Confidential Stablecoin ───────────────────────
  console.log("── SSS-3: Confidential Stablecoin ──");
  try {
    const mintKp3 = Keypair.generate();
    const [configPda3] = deriveConfigPda(mintKp3.publicKey, SSS_CORE_PROGRAM_ID);

    const mintTx3 = await buildSss3MintTx(
      connection, payer.publicKey, mintKp3, configPda3, 6,
    );

    const initIx3 = await buildInitializeIx(
      coreProgram, mintKp3.publicKey, payer.publicKey,
      { preset: 3, name: "SSS3-Devnet", symbol: "S3D", uri: "", decimals: 6,
        supplyCap: new BN("10000000000000") },
    );
    mintTx3.add(initIx3);

    const sig3 = await signSendConfirm(connection, mintTx3, [payer, mintKp3]);
    console.log(`  Created mint: ${mintKp3.publicKey.toBase58()}`);
    console.log(`  Init tx: ${sig3.slice(0, 20)}...`);

    const sss3 = await SSS.load(provider, mintKp3.publicKey);
    await sss3.roles.grant(payer.publicKey, "minter");

    const ata3 = getAssociatedTokenAddressSync(
      sss3.mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID,
    );
    await signSendConfirm(
      connection,
      new Transaction().add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey, ata3, payer.publicKey, sss3.mint, TOKEN_2022_PROGRAM_ID,
        ),
      ),
      [payer],
    );

    const mintSig3 = await sss3.mintTokens(ata3, BigInt(1_000_000_000));
    console.log(`  Mint 1K: ${mintSig3.slice(0, 20)}...`);

    const burnSig3 = await sss3.burn(ata3, BigInt(50_000_000));
    console.log(`  Burn 50: ${burnSig3.slice(0, 20)}...`);

    const info3 = await sss3.info();
    console.log(`  Preset: ${info3.preset}, Supply: ${info3.currentSupply}`);

    (proof.presets as Record<string, unknown>)["sss-3"] = {
      mint: sss3.mint.toBase58(),
      config: sss3.configPda.toBase58(),
      transactions: { sig3, mintSig3, burnSig3 },
      finalSupply: info3.currentSupply.toString(),
      note: "ConfidentialTransferMint extension enabled",
    };
    console.log("  ✓ SSS-3 complete\n");
  } catch (err) {
    console.error("  ✗ SSS-3 failed:", (err as Error).message, "\n");
    (proof.presets as Record<string, unknown>)["sss-3"] = { error: (err as Error).message };
  }

  // Save
  const outDir = path.resolve(__dirname, "..", "deployments");
  const outPath = path.join(outDir, "devnet-proof.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(proof, null, 2));
  console.log(`Proof saved to: ${outPath}`);

  const finalBalance = await connection.getBalance(payer.publicKey);
  console.log(`Final balance: ${(finalBalance / 1e9).toFixed(4)} SOL (used ${((balance - finalBalance) / 1e9).toFixed(4)} SOL)`);
  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
