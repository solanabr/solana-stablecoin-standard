/**
 * SSS-2 Compliance Example
 *
 * Demonstrates the full Compliant Stablecoin (SSS-2) lifecycle:
 * init -> mint -> blacklist -> attempt transfer (fails via hook when configured) -> seize -> remove blacklist
 *
 * SSS-2 uses permanent delegate for seize and transfer hook for blacklist enforcement.
 * When a blacklisted wallet attempts to transfer, the hook rejects it.
 *
 * Run: npx ts-node -p tsconfig.json examples/sss-2-compliance.ts
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

const STABLECOIN_SEED = Buffer.from("stablecoin");
const ROLES_SEED = Buffer.from("roles");
const MINTER_SEED = Buffer.from("minter");
const BLACKLIST_SEED = Buffer.from("blacklist");

async function main() {
  console.log("=== SSS-2 Compliance Example ===\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SssToken as Program;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // Step 1: Create SSS-2 mint (Permanent Delegate for seize)
  // Note: Full transfer-hook setup requires Transfer Hook extension on mint + extra-account-metas init.
  // This example uses Permanent Delegate (matching test setup). Seize works; transfer blocking
  // requires the transfer hook extension on the mint.
  const mintKeypair = Keypair.generate();
  const decimals = 6;
  const extensions: ExtensionType[] = [ExtensionType.PermanentDelegate];

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
    createInitializePermanentDelegateInstruction(
      mintKeypair.publicKey,
      configPDA,
      TOKEN_2022_PROGRAM_ID
    )
  );
  createMintTx.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      configPDA,
      configPDA,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(createMintTx, [authority, mintKeypair]);
  console.log("1. Mint created (Permanent Delegate):", mintKeypair.publicKey.toBase58());

  // Step 2: Initialize stablecoin config (SSS-2: compliance enabled)
  const [authorityRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .initialize({
      name: "Compliant USD",
      symbol: "CUSD",
      uri: "",
      decimals,
      enablePermanentDelegate: true,
      enableTransferHook: true, // Config says hook enabled; mint uses Permanent Delegate for seize
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

  console.log("2. Stablecoin config initialized (SSS-2)");

  // Step 3: Setup minter and mint tokens to target
  const targetKeypair = Keypair.generate();
  await provider.connection.requestAirdrop(targetKeypair.publicKey, 1e9);
  await new Promise((r) => setTimeout(r, 1000));

  const targetAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    targetKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  await provider.sendAndConfirm(
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        targetAta,
        targetKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    )
  );

  const [minterRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );
  const [minterConfig] = PublicKey.findProgramAddressSync(
    [MINTER_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .updateRoles(authority.publicKey, 1, true)
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      targetRoles: minterRoles,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  await program.methods
    .updateMinter(authority.publicKey, new anchor.BN(0), true)
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      minterConfig,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  const mintAmount = 5_000_000;
  await program.methods
    .mint(new anchor.BN(mintAmount))
    .accounts({
      minter: authority.publicKey,
      stablecoinConfig: configPDA,
      minterRoles,
      minterConfig,
      mint: mintKeypair.publicKey,
      recipientTokenAccount: targetAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();

  console.log("3. Minted", mintAmount, "tokens to target");

  // Step 4: Blacklist the target
  const [blacklistPDA] = PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, configPDA.toBuffer(), targetKeypair.publicKey.toBuffer()],
    program.programId
  );
  const [blacklisterRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .addToBlacklist(targetKeypair.publicKey, "OFAC match")
    .accounts({
      blacklister: authority.publicKey,
      stablecoinConfig: configPDA,
      blacklisterRoles,
      blacklistEntry: blacklistPDA,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();

  console.log("4. Target added to blacklist");

  // Step 5: Attempt transfer FROM blacklisted target (would fail via transfer hook if mint had it)
  const recipientKeypair = Keypair.generate();
  await provider.connection.requestAirdrop(recipientKeypair.publicKey, 1e9);
  await new Promise((r) => setTimeout(r, 1000));

  const recipientAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    recipientKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await provider.sendAndConfirm(
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        recipientAta,
        recipientKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    )
  );

  const transferAmount = 100_000;
  try {
    const transferTx = new Transaction().add(
      createTransferInstruction(
        targetAta,
        recipientAta,
        targetKeypair.publicKey,
        transferAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    await provider.sendAndConfirm(transferTx, [targetKeypair]);
    console.log(
      "5. Transfer attempted: succeeded (mint has no transfer hook; with hook it would fail)"
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SenderBlacklisted") || msg.includes("0x1770")) {
      console.log("5. Transfer attempted: FAILED (sender blacklisted via hook) as expected");
    } else {
      throw err;
    }
  }

  // Step 6: Seize tokens from blacklisted target to treasury
  const treasuryKeypair = Keypair.generate();
  await provider.connection.requestAirdrop(treasuryKeypair.publicKey, 1e9);
  await new Promise((r) => setTimeout(r, 1000));
  const treasuryAta = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    treasuryKeypair.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  await provider.sendAndConfirm(
    new Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        treasuryAta,
        treasuryKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    )
  );

  const targetBefore = await getAccount(
    provider.connection,
    targetAta,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const amountBefore = Number(targetBefore.amount);

  const [seizerRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .seize()
    .accounts({
      seizer: authority.publicKey,
      stablecoinConfig: configPDA,
      seizerRoles,
      mint: mintKeypair.publicKey,
      fromTokenAccount: targetAta,
      toTokenAccount: treasuryAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([authority])
    .rpc();

  const targetAfter = await getAccount(
    provider.connection,
    targetAta,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const treasuryAfter = await getAccount(
    provider.connection,
    treasuryAta,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  console.log("6. Seized", amountBefore, "tokens to treasury");
  console.log("   Target balance:", Number(targetAfter.amount));
  console.log("   Treasury balance:", Number(treasuryAfter.amount));

  // Step 7: Remove from blacklist
  await program.methods
    .removeFromBlacklist(targetKeypair.publicKey)
    .accounts({
      blacklister: authority.publicKey,
      stablecoinConfig: configPDA,
      blacklisterRoles,
      blacklistEntry: blacklistPDA,
    })
    .signers([authority])
    .rpc();

  console.log("7. Removed target from blacklist");

  console.log("\n=== SSS-2 Compliance lifecycle complete ===");
}

main().catch(console.error);
