/**
 * scripts/devnet-demo.ts
 *
 * Live smoke-test on Solana devnet — full SSS-1 and SSS-2 lifecycle.
 * Uses the Anchor program directly (bypassing the ESM/CJS boundary issue
 * that affects programWithSigner in the SDK when called from ts-node).
 * Prints explorer links and saves scripts/devnet-proof.json for README.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/devnet-demo.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BN } from "bn.js";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ─────────────────────────────────────────────────────────────────

const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
const SSS_TOKEN_PROGRAM = new PublicKey("E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP");
const HOOK_PROGRAM = new PublicKey("6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY");

const connection = new Connection(RPC, "confirmed");
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
);

// ── Helpers ────────────────────────────────────────────────────────────────

function explorer(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

async function getFirstSig(pda: PublicKey): Promise<string> {
  const sigs = await connection.getSignaturesForAddress(pda, { limit: 1 });
  return sigs[0]?.signature ?? "(unavailable)";
}

function deriveConfig(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mint.toBuffer()],
    SSS_TOKEN_PROGRAM
  )[0];
}

function deriveRoles(configPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("roles"), configPda.toBuffer()],
    SSS_TOKEN_PROGRAM
  )[0];
}

function deriveMinterInfo(configPda: PublicKey, minter: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), configPda.toBuffer(), minter.toBuffer()],
    SSS_TOKEN_PROGRAM
  )[0];
}

function deriveBlacklist(mint: PublicKey, address: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM
  )[0];
}

function deriveExtraAccountMetaList(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    HOOK_PROGRAM
  )[0];
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load IDL from build output
  const idlPath = path.join(__dirname, "..", "target", "idl", "sss_token.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`\nAuthority : ${authority.publicKey.toBase58()}`);
  console.log(`Balance   : ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`RPC       : ${RPC}\n`);

  const results: Record<string, string> = {};

  // ── SSS-1: Initialize ─────────────────────────────────────────────────────
  console.log("── SSS-1: initialize");
  const sss1Mint = Keypair.generate();
  const sss1Config = deriveConfig(sss1Mint.publicKey);
  const sss1Roles = deriveRoles(sss1Config);

  await (program.methods as any)
    .initialize({
      name: "Demo USD",
      symbol: "DUSD",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      enableDefaultFrozen: false,
      transferHookProgramId: null,
    })
    .accountsPartial({
      authority: authority.publicKey,
      mint: sss1Mint.publicKey,
      stablecoinConfig: sss1Config,
      roleManager: sss1Roles,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([authority, sss1Mint])
    .rpc({ commitment: "confirmed" });

  results["SSS-1 init"] = await getFirstSig(sss1Config);
  console.log(`  mint : ${sss1Mint.publicKey.toBase58()}`);
  console.log(`  sig  : ${results["SSS-1 init"]}`);
  console.log(`  url  : ${explorer(results["SSS-1 init"])}\n`);

  // ── SSS-1: Add minter + mint ──────────────────────────────────────────────
  console.log("── SSS-1: add minter + mint");
  const minter1 = Keypair.generate();
  const minterInfo1 = deriveMinterInfo(sss1Config, minter1.publicKey);

  await (program.methods as any)
    .addMinter(minter1.publicKey, new BN("10000000000"))
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss1Config,
      roleManager: sss1Roles,
      minterInfo: minterInfo1,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  const recipient1 = Keypair.generate();
  await createAssociatedTokenAccountIdempotent(
    connection, authority, sss1Mint.publicKey, recipient1.publicKey,
    undefined, TOKEN_2022_PROGRAM_ID
  );
  const recipientAta1 = getAssociatedTokenAddressSync(
    sss1Mint.publicKey, recipient1.publicKey, false, TOKEN_2022_PROGRAM_ID
  );

  const mintSig1: string = await (program.methods as any)
    .mintTokens(new BN("1000000000"))
    .accountsPartial({
      minter: minter1.publicKey,
      stablecoinConfig: sss1Config,
      roleManager: sss1Roles,
      minterInfo: minterInfo1,
      mint: sss1Mint.publicKey,
      recipientTokenAccount: recipientAta1,
      recipient: recipient1.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([minter1])
    .rpc({ commitment: "confirmed" });

  results["SSS-1 mint"] = mintSig1;
  console.log(`  sig  : ${mintSig1}`);
  console.log(`  url  : ${explorer(mintSig1)}\n`);

  // ── SSS-1: Freeze + thaw ──────────────────────────────────────────────────
  console.log("── SSS-1: freeze + thaw");
  const freezeSig1: string = await (program.methods as any)
    .freezeAccount()
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss1Config,
      roleManager: sss1Roles,
      mint: sss1Mint.publicKey,
      tokenAccount: recipientAta1,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  const thawSig1: string = await (program.methods as any)
    .thawAccount()
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss1Config,
      roleManager: sss1Roles,
      mint: sss1Mint.publicKey,
      tokenAccount: recipientAta1,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  results["SSS-1 freeze"] = freezeSig1;
  results["SSS-1 thaw"] = thawSig1;
  console.log(`  freeze : ${freezeSig1}`);
  console.log(`  thaw   : ${thawSig1}`);
  console.log(`  url    : ${explorer(thawSig1)}\n`);

  // ── SSS-2: Initialize ─────────────────────────────────────────────────────
  console.log("── SSS-2: initialize");
  const sss2Mint = Keypair.generate();
  const sss2Config = deriveConfig(sss2Mint.publicKey);
  const sss2Roles = deriveRoles(sss2Config);
  const extraAccountMetaList = deriveExtraAccountMetaList(sss2Mint.publicKey);

  await (program.methods as any)
    .initialize({
      name: "Demo RegUSD",
      symbol: "DRUSD",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      enableDefaultFrozen: true,
      transferHookProgramId: HOOK_PROGRAM,
    })
    .accountsPartial({
      authority: authority.publicKey,
      mint: sss2Mint.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .remainingAccounts([
      { pubkey: HOOK_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: extraAccountMetaList, isWritable: true, isSigner: false },
    ])
    .signers([authority, sss2Mint])
    .rpc({ commitment: "confirmed" });

  results["SSS-2 init"] = await getFirstSig(sss2Config);
  console.log(`  mint : ${sss2Mint.publicKey.toBase58()}`);
  console.log(`  sig  : ${results["SSS-2 init"]}`);
  console.log(`  url  : ${explorer(results["SSS-2 init"])}\n`);

  // ── SSS-2: Add minter + mint ──────────────────────────────────────────────
  console.log("── SSS-2: add minter + mint");
  const minter2 = Keypair.generate();
  const minterInfo2 = deriveMinterInfo(sss2Config, minter2.publicKey);

  await (program.methods as any)
    .addMinter(minter2.publicKey, new BN("10000000000"))
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      minterInfo: minterInfo2,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  const user = Keypair.generate();
  const userAta = await createAssociatedTokenAccountIdempotent(
    connection, authority, sss2Mint.publicKey, user.publicKey,
    undefined, TOKEN_2022_PROGRAM_ID
  );

  // SSS-2 default-frozen: must thaw before minting
  await (program.methods as any)
    .thawAccount()
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      mint: sss2Mint.publicKey,
      tokenAccount: userAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  // Mint needs remaining accounts for the transfer hook
  const userBlacklist = deriveBlacklist(sss2Mint.publicKey, user.publicKey);
  const configBlacklist = deriveBlacklist(sss2Mint.publicKey, sss2Config);

  const mintSig2: string = await (program.methods as any)
    .mintTokens(new BN("2000000000"))
    .accountsPartial({
      minter: minter2.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      minterInfo: minterInfo2,
      mint: sss2Mint.publicKey,
      recipientTokenAccount: userAta,
      recipient: user.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .signers([minter2])
    .rpc({ commitment: "confirmed" });

  results["SSS-2 mint"] = mintSig2;
  console.log(`  sig  : ${mintSig2}`);
  console.log(`  url  : ${explorer(mintSig2)}\n`);

  // ── SSS-2: Blacklist add ──────────────────────────────────────────────────
  console.log("── SSS-2: blacklist add");
  const blacklistEntry = deriveBlacklist(sss2Mint.publicKey, user.publicKey);

  const blacklistSig: string = await (program.methods as any)
    .addToBlacklist(user.publicKey, "demo sanctions screening")
    .accountsPartial({
      blacklister: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      blacklistEntry,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  results["SSS-2 blacklist add"] = blacklistSig;
  console.log(`  sig  : ${blacklistSig}`);
  console.log(`  url  : ${explorer(blacklistSig)}\n`);

  // ── SSS-2: Seize ──────────────────────────────────────────────────────────
  console.log("── SSS-2: seize");
  const treasuryAta = await createAssociatedTokenAccountIdempotent(
    connection, authority, sss2Mint.publicKey, authority.publicKey,
    undefined, TOKEN_2022_PROGRAM_ID
  );
  // Thaw treasury ATA (default-frozen)
  await (program.methods as any)
    .thawAccount()
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      mint: sss2Mint.publicKey,
      tokenAccount: treasuryAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  // Freeze user ATA before seize
  await (program.methods as any)
    .freezeAccount()
    .accountsPartial({
      authority: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      mint: sss2Mint.publicKey,
      tokenAccount: userAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  const treasuryOwnerBlacklist = deriveBlacklist(sss2Mint.publicKey, authority.publicKey);

  const seizeSig: string = await (program.methods as any)
    .seize(new BN("2000000000"))
    .accountsPartial({
      seizer: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      mint: sss2Mint.publicKey,
      sourceTokenAccount: userAta,
      destinationTokenAccount: treasuryAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .remainingAccounts([
      { pubkey: HOOK_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: extraAccountMetaList, isWritable: false, isSigner: false },
      { pubkey: SSS_TOKEN_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: configBlacklist, isWritable: false, isSigner: false },
      { pubkey: treasuryOwnerBlacklist, isWritable: false, isSigner: false },
    ])
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  results["SSS-2 seize"] = seizeSig;
  console.log(`  sig  : ${seizeSig}`);
  console.log(`  url  : ${explorer(seizeSig)}\n`);

  // ── SSS-2: Blacklist remove ───────────────────────────────────────────────
  console.log("── SSS-2: blacklist remove");
  const blRemoveSig: string = await (program.methods as any)
    .removeFromBlacklist(user.publicKey)
    .accountsPartial({
      blacklister: authority.publicKey,
      stablecoinConfig: sss2Config,
      roleManager: sss2Roles,
      blacklistEntry,
    })
    .signers([authority])
    .rpc({ commitment: "confirmed" });

  results["SSS-2 blacklist remove"] = blRemoveSig;
  console.log(`  sig  : ${blRemoveSig}`);
  console.log(`  url  : ${explorer(blRemoveSig)}\n`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const deployedAt = new Date().toUTCString();
  console.log("══════════════════════════════════════════════════════════");
  console.log(" DEVNET PROOF SUMMARY");
  console.log(`  Deployed at : ${deployedAt}`);
  console.log(`  sss_token   : ${SSS_TOKEN_PROGRAM.toBase58()}`);
  console.log(`  hook        : ${HOOK_PROGRAM.toBase58()}`);
  console.log("");
  for (const [label, sig] of Object.entries(results)) {
    console.log(`  ${label.padEnd(26)}: ${sig}`);
  }
  console.log("══════════════════════════════════════════════════════════");

  const proof = {
    deployedAt,
    programIds: {
      sssToken: SSS_TOKEN_PROGRAM.toBase58(),
      hook: HOOK_PROGRAM.toBase58(),
    },
    results,
  };
  const proofPath = path.join(__dirname, "devnet-proof.json");
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  console.log(`\nSaved to ${proofPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
