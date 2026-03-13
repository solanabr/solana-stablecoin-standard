import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getExtensionTypes,
  ExtensionType,
} from "@solana/spl-token";
import { assert } from "chai";

import {
  deriveConfigPda,
  deriveRolesPda,
} from "@stbr/sss-token";

// ── SSS-3 Private Stablecoin Test Suite ────────────────────────────────

describe("sss-3: Private Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program;

  let authority: Keypair;
  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let rolesPda: PublicKey;

  before(async () => {
    authority = provider.wallet.payer;
    mintKeypair = Keypair.generate();

    [configPda] = deriveConfigPda(mintKeypair.publicKey, program.programId);
    [rolesPda] = deriveRolesPda(configPda, program.programId);
  });

  // ── Test 1: Initialize SSS-3 ────────────────────────────────────────

  it("initializes an SSS-3 private stablecoin", async () => {
    await program.methods
      .initialize({
        name: "Private USD",
        symbol: "pUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        enableConfidentialTransfers: true,  // SSS-3!
        defaultAccountFrozen: false,
        pauser: authority.publicKey,
        blacklister: authority.publicKey,
        seizer: authority.publicKey,
        supplyCap: null,
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleManager: rolesPda,
        mint: mintKeypair.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    // Verify config
    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.isTrue(config.enableConfidentialTransfers);
    assert.isTrue(config.enablePermanentDelegate);
    assert.isTrue(config.enableTransferHook);
  });

  // ── Test 2: Verify mint extensions ───────────────────────────────────

  it("has ConfidentialTransferMint extension on the mint", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintKeypair.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    // Get the extension types on the mint
    const extensions = getExtensionTypes(mintInfo.tlvData);
    assert.include(
      extensions,
      ExtensionType.ConfidentialTransferMint,
      "Mint should have ConfidentialTransferMint extension"
    );
  });

  // ── Test 3: Verify SSS-3 preset ─────────────────────────────────────

  it("config reflects SSS-3 preset flags", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);

    // SSS-3 = SSS-2 features + confidential transfers
    assert.isTrue(config.enablePermanentDelegate, "permanent delegate");
    assert.isTrue(config.enableTransferHook, "transfer hook");
    assert.isTrue(config.enableConfidentialTransfers, "confidential transfers");
    assert.equal(config.name, "Private USD");
    assert.equal(config.symbol, "pUSD");
    assert.equal(config.decimals, 6);
  });

  // ── Test 4: CT + other extensions coexist ───────────────────────────

  it("has all required extensions on the mint", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintKeypair.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const extensions = getExtensionTypes(mintInfo.tlvData);

    // SSS-3 with permanent delegate + transfer hook + CT should have:
    assert.include(extensions, ExtensionType.ConfidentialTransferMint, "CT");
    assert.include(extensions, ExtensionType.PermanentDelegate, "PermanentDelegate");
    assert.include(extensions, ExtensionType.TransferHook, "TransferHook");
    assert.include(extensions, ExtensionType.MetadataPointer, "MetadataPointer");
  });

  // ── Test 5: Mint still works on CT-enabled token ────────────────────

  it("can mint tokens on a CT-enabled stablecoin", async () => {
    // Add authority as minter
    await program.methods
      .updateMinter(authority.publicKey, new BN(1_000_000_000))
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleManager: rolesPda,
      })
      .rpc({ commitment: "confirmed" });

    // Create ATA for recipient
    const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } =
      await import("@solana/spl-token");

    const recipientAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      recipientAta,
      authority.publicKey,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );

    const tx = new anchor.web3.Transaction().add(createAtaIx);
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection, tx, [authority], { commitment: "confirmed" }
    );

    // Mint 500 tokens
    await program.methods
      .mintTokens(new BN(500_000_000))
      .accounts({
        minter: authority.publicKey,
        config: configPda,
        roleManager: rolesPda,
        mint: mintKeypair.publicKey,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    const { getAccount } = await import("@solana/spl-token");
    const account = await getAccount(
      provider.connection, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID
    );
    assert.equal(Number(account.amount), 500_000_000, "should have 500 tokens");
  });

  // ── Test 6: Verify supply tracking on CT mint ──────────────────────

  it("tracks total_minted on CT-enabled config", async () => {
    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.equal(
      config.totalMinted.toNumber(), 500_000_000,
      "total_minted should reflect 500 tokens"
    );
  });
});
