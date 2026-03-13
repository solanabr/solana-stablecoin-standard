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
});
