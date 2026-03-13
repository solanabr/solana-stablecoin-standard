/**
 * SSS-1 Lifecycle Example
 *
 * Demonstrates the full Minimal Stablecoin (SSS-1) lifecycle:
 * init -> setup minter -> mint -> transfer -> freeze -> thaw -> burn
 *
 * Run: npx ts-node -p tsconfig.json examples/sss-1-lifecycle.ts
 * Requires: anchor build, ANCHOR_PROVIDER_URL, ANCHOR_WALLET
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";

// Seeds and PDAs (must match program)
const STABLECOIN_SEED = Buffer.from("stablecoin");
const ROLES_SEED = Buffer.from("roles");
const MINTER_SEED = Buffer.from("minter");

async function main() {
  console.log("=== SSS-1 Lifecycle Example ===\n");

  // Step 1: Setup provider and load program
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SssToken as Program;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // Step 2: Create mint account (SSS-1: no permanent delegate, no transfer hook)
  const mintKeypair = Keypair.generate();
  const decimals = 6;
  const extensions: ExtensionType[] = []; // SSS-1: minimal extensions

  const [configPDA] = PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mintKeypair.publicKey.toBuffer()],
    program.programId
  );

  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  const createMintTx = new Transaction();
  createMintTx.add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );
  createMintTx.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      configPDA, // mint authority
      configPDA, // freeze authority
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(createMintTx, [authority, mintKeypair]);
  console.log("1. Mint account created:", mintKeypair.publicKey.toBase58());

  // Step 3: Initialize stablecoin config
  const [authorityRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .initialize({
      name: "Example USD",
      symbol: "EXUSD",
      uri: "",
      decimals,
      supplyCap: new anchor.BN(0), // 0 = unlimited
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
    })
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      mint: mintKeypair.publicKey,
      authorityRoles,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log("2. Stablecoin config initialized");

  // Step 4: Setup minter (grant MINTER role + create minter config)
  const [minterRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );
  const [minterConfig] = PublicKey.findProgramAddressSync(
    [MINTER_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .updateRoles(authority.publicKey, 1, true) // 1 = MINTER role
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      targetRoles: minterRoles,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  await program.methods
    .updateMinter(authority.publicKey, new anchor.BN(0), true) // 0 = no quota limit
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      minterConfig,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  console.log("3. Minter setup complete");

  // Step 5: Create recipient ATA and mint tokens
  const recipient = Keypair.generate();
  await provider.connection.requestAirdrop(recipient.publicKey, 1e9);
  await new Promise((r) => setTimeout(r, 1000)); // wait for airdrop

  const recipientAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const createAtaTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      recipientAta,
      recipient.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );
  await provider.sendAndConfirm(createAtaTx);

  const mintAmount = 1_000_000; // 1.0 tokens (6 decimals)
  await program.methods
    .mint(new anchor.BN(mintAmount))
    .accounts({
      minter: authority.publicKey,
      stablecoinConfig: configPDA,
      minterRoles,
      minterConfig,
      mint: mintKeypair.publicKey,
      recipientTokenAccount: recipientAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();

  console.log("4. Minted", mintAmount, "tokens to recipient");

  // Step 6: Transfer (authority creates ATA and sends some tokens to a second recipient)
  const recipient2 = Keypair.generate();
  await provider.connection.requestAirdrop(recipient2.publicKey, 1e9);
  await new Promise((r) => setTimeout(r, 1000));

  const authorityAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    authority.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Create authority ATA by minting to self first, or use recipient as source
  const recipient2Ata = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    recipient2.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const createAta2Tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      recipient2Ata,
      recipient2.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );
  await provider.sendAndConfirm(createAta2Tx);

  const transferAmount = 100_000;
  const transferTx = new Transaction().add(
    createTransferInstruction(
      recipientAta,
      recipient2Ata,
      recipient.publicKey,
      transferAmount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );
  await provider.sendAndConfirm(transferTx, [recipient]);
  console.log("5. Transferred", transferAmount, "tokens to recipient2");

  // Step 7: Freeze recipient2's account
  const [freezerRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .freezeAccount()
    .accounts({
      freezer: authority.publicKey,
      stablecoinConfig: configPDA,
      freezerRoles,
      mint: mintKeypair.publicKey,
      targetTokenAccount: recipient2Ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();

  let account = await getAccount(provider.connection, recipient2Ata, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("6. Account frozen:", account.isFrozen);

  // Step 8: Thaw account
  await program.methods
    .thawAccount()
    .accounts({
      freezer: authority.publicKey,
      stablecoinConfig: configPDA,
      freezerRoles,
      mint: mintKeypair.publicKey,
      targetTokenAccount: recipient2Ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();

  account = await getAccount(provider.connection, recipient2Ata, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("7. Account thawed:", !account.isFrozen);

  // Step 9: Burn from recipient2
  const [burnerRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  // Authority needs BURNER role (we have all roles from init). Burn from recipient2 - but recipient2
  // owns the tokens, so recipient2 must be the burner. Grant recipient2 BURNER role first.
  const [recipient2Roles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), recipient2.publicKey.toBuffer()],
    program.programId
  );
  await program.methods
    .updateRoles(recipient2.publicKey, 2, true) // 2 = BURNER
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      targetRoles: recipient2Roles,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  const burnAmount = 50_000;
  await program.methods
    .burn(new anchor.BN(burnAmount))
    .accounts({
      burner: recipient2.publicKey,
      stablecoinConfig: configPDA,
      burnerRoles: PublicKey.findProgramAddressSync(
        [ROLES_SEED, configPDA.toBuffer(), recipient2.publicKey.toBuffer()],
        program.programId
      )[0],
      mint: mintKeypair.publicKey,
      tokenAccount: recipient2Ata,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([recipient2])
    .rpc();

  console.log("8. Burned", burnAmount, "tokens");

  console.log("\n=== SSS-1 Lifecycle complete ===");
}

main().catch(console.error);
