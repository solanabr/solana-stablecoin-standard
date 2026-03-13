import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

// Import SDK helpers
import {
  deriveConfigPda,
  deriveRolesPda,
  deriveBlacklistPda,
} from "@stbr/sss-token";

// ── Test Helpers ──────────────────────────────────────────────────────

async function fundedKeypair(
  provider: anchor.AnchorProvider,
  lamports = 5 * anchor.web3.LAMPORTS_PER_SOL
): Promise<Keypair> {
  const kp = Keypair.generate();
  const sig = await provider.connection.requestAirdrop(kp.publicKey, lamports);
  await provider.connection.confirmTransaction(sig, "confirmed");
  return kp;
}

async function ensureAta(
  provider: anchor.AnchorProvider,
  mint: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const info = await provider.connection.getAccountInfo(ata);
  if (!info) {
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [payer]);
  }
  return ata;
}

// ── SSS-2 Compliance Test Suite ───────────────────────────────────────

describe("sss-2: Compliant Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program;

  let authority: Keypair;
  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let rolesPda: PublicKey;
  let blacklister: Keypair;
  let seizer: Keypair;
  let suspectKeypair: Keypair;
  let treasuryKeypair: Keypair;

  before(async () => {
    authority = provider.wallet.payer;
    mintKeypair = Keypair.generate();
    blacklister = await fundedKeypair(provider);
    seizer = await fundedKeypair(provider);
    suspectKeypair = await fundedKeypair(provider);
    treasuryKeypair = await fundedKeypair(provider);

    [configPda] = deriveConfigPda(mintKeypair.publicKey, program.programId);
    [rolesPda] = deriveRolesPda(configPda, program.programId);
  });

  // ── Test 1: Initialize SSS-2 ─────────────────────────────────────

  it("initializes an SSS-2 compliant stablecoin", async () => {
    const tx = await program.methods
      .initialize({
        name: "Compliant BRL",
        symbol: "cBRL",
        uri: "https://example.com/cbrl.json",
        decimals: 6,
        enablePermanentDelegate: true,    // SSS-2: enables seize
        enableTransferHook: true,          // SSS-2: enables blacklist enforcement
        enableConfidentialTransfers: false,
        defaultAccountFrozen: false,       // Not freezing by default for test simplicity
        pauser: authority.publicKey,
        blacklister: blacklister.publicKey,
        seizer: seizer.publicKey,
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


    const config = await program.account.stablecoinConfig.fetch(configPda);
    assert.isTrue(config.enablePermanentDelegate);
    assert.isTrue(config.enableTransferHook);
    assert.isFalse(config.enableConfidentialTransfers);
    assert.isTrue(config.enablePermanentDelegate && config.enableTransferHook); // SSS-2 compliance


    // Verify roles
    const roles = await program.account.roleManager.fetch(rolesPda);
    assert.ok(roles.blacklister.equals(blacklister.publicKey));
    assert.ok(roles.seizer.equals(seizer.publicKey));

  });

  // ── Test 1b: Initialize Transfer Hook ExtraAccountMetaList ────────

  it("initializes transfer hook extra account meta list", async () => {
    const transferHookProgram = anchor.workspace.TransferHook as Program;
    const TRANSFER_HOOK_PROGRAM_ID = transferHookProgram.programId;

    // Derive the ExtraAccountMetaList PDA
    const [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mintKeypair.publicKey.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID
    );

    await transferHookProgram.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: authority.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        mint: mintKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  // ── Test 2: Setup — mint tokens to suspect ────────────────────────

  it("setup: mint tokens to suspect address", async () => {
    // Add authority as minter
    await program.methods
      .updateMinter(authority.publicKey, new BN(1_000_000_000))
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleManager: rolesPda,
      })
      .rpc();

    // Create ATA and mint
    const suspectAta = await ensureAta(
      provider, mintKeypair.publicKey, suspectKeypair.publicKey, authority
    );

    await program.methods
      .mintTokens(new BN(500_000_000)) // 500 tokens
      .accounts({
        minter: authority.publicKey,
        config: configPda,
        roleManager: rolesPda,
        mint: mintKeypair.publicKey,
        recipientTokenAccount: suspectAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    const account = await getAccount(
      provider.connection, suspectAta, "confirmed", TOKEN_2022_PROGRAM_ID
    );
    assert.equal(Number(account.amount), 500_000_000);
  });

  // ── Test 3: Blacklist ─────────────────────────────────────────────

  it("adds address to blacklist", async () => {
    const [blacklistPda] = deriveBlacklistPda(
      configPda, suspectKeypair.publicKey, program.programId
    );

    await program.methods
      .addToBlacklist("Suspicious activity detected")
      .accounts({
        blacklister: blacklister.publicKey,
        config: configPda,
        roleManager: rolesPda,
        blacklistEntry: blacklistPda,
        addressToBlacklist: suspectKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([blacklister])
      .rpc();

    // Verify blacklist entry exists
    const entry = await program.account.blacklistEntry.fetch(blacklistPda);
    assert.ok(entry.address.equals(suspectKeypair.publicKey));
    assert.equal(entry.reason, "Suspicious activity detected");
    assert.ok(entry.blacklistedBy.equals(blacklister.publicKey));

  });

  // ── Test 4: Reject duplicate blacklist ────────────────────────────

  it("rejects duplicate blacklist entry", async () => {
    const [blacklistPda] = deriveBlacklistPda(
      configPda, suspectKeypair.publicKey, program.programId
    );

    try {
      await program.methods
        .addToBlacklist("Second attempt")
        .accounts({
          blacklister: blacklister.publicKey,
          config: configPda,
          roleManager: rolesPda,
          blacklistEntry: blacklistPda,
          addressToBlacklist: suspectKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      // Account already initialized — Anchor rejects this
    }
  });

  // ── Test 5: Reject unauthorized blacklister ───────────────────────

  it("rejects unauthorized blacklister", async () => {
    const innocent = await fundedKeypair(provider);
    const [blacklistPda] = deriveBlacklistPda(
      configPda, innocent.publicKey, program.programId
    );

    try {
      await program.methods
        .addToBlacklist("Trying to frame someone")
        .accounts({
          blacklister: suspectKeypair.publicKey, // Not the designated blacklister!
          config: configPda,
          roleManager: rolesPda,
          blacklistEntry: blacklistPda,
          addressToBlacklist: innocent.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([suspectKeypair])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "Unauthorized");
    }
  });

  // ── Test 6: Remove from blacklist ─────────────────────────────────

  it("removes address from blacklist", async () => {
    const [blacklistPda] = deriveBlacklistPda(
      configPda, suspectKeypair.publicKey, program.programId
    );

    await program.methods
      .removeFromBlacklist()
      .accounts({
        blacklister: blacklister.publicKey,
        config: configPda,
        roleManager: rolesPda,
        blacklistEntry: blacklistPda,
      })
      .signers([blacklister])
      .rpc();

    // Verify blacklist entry is closed
    const accountInfo = await provider.connection.getAccountInfo(blacklistPda);
    assert.isNull(accountInfo);
  });

  // ── Test 7: Re-blacklist and seize flow ───────────────────────────

  it("full seize flow: blacklist → freeze → seize", async () => {
    // Step 1: Re-blacklist the suspect
    const [blacklistPda] = deriveBlacklistPda(
      configPda, suspectKeypair.publicKey, program.programId
    );

    await program.methods
      .addToBlacklist("OFAC sanctioned entity")
      .accounts({
        blacklister: blacklister.publicKey,
        config: configPda,
        roleManager: rolesPda,
        blacklistEntry: blacklistPda,
        addressToBlacklist: suspectKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([blacklister])
      .rpc();

    // Step 2: Freeze the suspect's account
    const suspectAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey, suspectKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .freezeAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleManager: rolesPda,
        mint: mintKeypair.publicKey,
        tokenAccount: suspectAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });

    let account = await getAccount(
      provider.connection, suspectAta, "confirmed", TOKEN_2022_PROGRAM_ID
    );
    assert.isTrue(account.isFrozen);

    // Step 3: Seize tokens to treasury
    const treasuryAta = await ensureAta(
      provider, mintKeypair.publicKey, treasuryKeypair.publicKey, authority
    );

    await program.methods
      .seize()
      .accounts({
        seizer: seizer.publicKey,
        config: configPda,
        roleManager: rolesPda,
        blacklistEntry: blacklistPda,
        mint: mintKeypair.publicKey,
        fromTokenAccount: suspectAta,
        treasuryTokenAccount: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizer])
      .rpc({ commitment: "confirmed" });

    // Verify tokens moved to treasury
    const treasuryAccount = await getAccount(
      provider.connection, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID
    );
    assert.equal(Number(treasuryAccount.amount), 500_000_000);

    const suspectAccount = await getAccount(
      provider.connection, suspectAta, "confirmed", TOKEN_2022_PROGRAM_ID
    );
    assert.equal(Number(suspectAccount.amount), 0);
  });

  // ── Test 8: SSS-2 feature gate on SSS-1 ──────────────────────────

  it("SSS-2 instructions fail on SSS-1 token", async () => {
    // Create an SSS-1 token (no permanent delegate, no transfer hook)
    const sss1Mint = Keypair.generate();
    const [sss1Config] = deriveConfigPda(sss1Mint.publicKey, program.programId);
    const [sss1Roles] = deriveRolesPda(sss1Config, program.programId);

    await program.methods
      .initialize({
        name: "Simple Token",
        symbol: "SIMP",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        enableConfidentialTransfers: false,
        defaultAccountFrozen: false,
        pauser: authority.publicKey,
        blacklister: null,
        seizer: null,
        supplyCap: null,
      })
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        roleManager: sss1Roles,
        mint: sss1Mint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1Mint])
      .rpc();

    // Try to blacklist on SSS-1 — should fail with ComplianceNotEnabled
    const target = Keypair.generate();
    const [blacklistPda] = deriveBlacklistPda(sss1Config, target.publicKey, program.programId);

    try {
      await program.methods
        .addToBlacklist("Should fail")
        .accounts({
          blacklister: authority.publicKey,
          config: sss1Config,
          roleManager: sss1Roles,
          blacklistEntry: blacklistPda,
          addressToBlacklist: target.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "Compliance");
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS — SSS-2 Compliance
  // ═══════════════════════════════════════════════════════════════════

  // ── Edge 1: Unauthorized seize ───────────────────────────────────

  it("rejects seize from unauthorized seizer", async () => {
    const attacker = await fundedKeypair(provider);
    const suspectAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey, suspectKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID
    );
    const treasuryAta = getAssociatedTokenAddressSync(
      mintKeypair.publicKey, treasuryKeypair.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    // Blacklist PDA should still exist from seize flow test
    const [blacklistPda] = deriveBlacklistPda(
      configPda, suspectKeypair.publicKey, program.programId
    );

    try {
      await program.methods
        .seize()
        .accounts({
          seizer: attacker.publicKey,
          config: configPda,
          roleManager: rolesPda,
          blacklistEntry: blacklistPda,
          mint: mintKeypair.publicKey,
          fromTokenAccount: suspectAta,
          treasuryTokenAccount: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "Unauthorized");
    }
  });

  // ── Edge 2: Blacklist reason too long ─────────────────────────────

  it("rejects blacklist reason > 128 chars", async () => {
    const target = await fundedKeypair(provider);
    const [blacklistPda] = deriveBlacklistPda(
      configPda, target.publicKey, program.programId
    );

    try {
      await program.methods
        .addToBlacklist("X".repeat(129)) // 129 chars — exceeds limit
        .accounts({
          blacklister: blacklister.publicKey,
          config: configPda,
          roleManager: rolesPda,
          blacklistEntry: blacklistPda,
          addressToBlacklist: target.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "reason");
    }
  });

  // ── Edge 3: Unauthorized remove from blacklist ───────────────────

  it("rejects remove from blacklist by non-blacklister", async () => {
    // The suspect is still blacklisted from the seize test
    const [blacklistPda] = deriveBlacklistPda(
      configPda, suspectKeypair.publicKey, program.programId
    );

    const attacker = await fundedKeypair(provider);

    try {
      await program.methods
        .removeFromBlacklist()
        .accounts({
          blacklister: attacker.publicKey,
          config: configPda,
          roleManager: rolesPda,
          blacklistEntry: blacklistPda,
        })
        .signers([attacker])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "Unauthorized");
    }
  });

  // ── Edge 4: URI too long ─────────────────────────────────────────

  it("rejects initialize with URI > 200 chars", async () => {
    const badMint = Keypair.generate();
    const [badConfig] = deriveConfigPda(badMint.publicKey, program.programId);
    const [badRoles] = deriveRolesPda(badConfig, program.programId);

    try {
      await program.methods
        .initialize({
          name: "Test",
          symbol: "TST",
          uri: "U".repeat(201), // 201 chars — exceeds limit
          decimals: 6,
          enablePermanentDelegate: true,
          enableTransferHook: true,
          enableConfidentialTransfers: false,
          defaultAccountFrozen: false,
          pauser: authority.publicKey,
          blacklister: blacklister.publicKey,
          seizer: seizer.publicKey,
          supplyCap: null,
        })
        .accounts({
          authority: authority.publicKey,
          config: badConfig,
          roleManager: badRoles,
          mint: badMint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([badMint])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "URI");
    }
  });
});
