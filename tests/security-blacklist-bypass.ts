import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// ---------------------------------------------------------------------------
// PDA helpers (inline to keep tests self-contained)
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL",
);
const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");
const BLACKLIST_SEED = Buffer.from("blacklist");

const ROLE_ADMIN = 0x00;
const ROLE_MINTER = 0x01;
const ROLE_PAUSER = 0x02;
const ROLE_FREEZER = 0x03;
const ROLE_BLACKLISTER = 0x04;
const ROLE_SEIZER = 0x05;

function getConfigAddress(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getRoleAddress(role: number, config: PublicKey, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([role]), holder.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getQuotaAddress(
  config: PublicKey,
  minter: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTA_SEED, config.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getBlacklistAddress(
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ===========================================================================
// SSS-2 Blacklist bypass tests
// ===========================================================================
describe("Security: Blacklist bypass & compliance boundary enforcement", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // ---------------------------------------------------------------
  // SSS-2 mint (compliance enabled) — for blacklist tests
  // ---------------------------------------------------------------
  const sss2MintKeypair = Keypair.generate();
  const sss2MintKey = sss2MintKeypair.publicKey;
  const [sss2ConfigPda] = getConfigAddress(sss2MintKey);

  // Target to be blacklisted
  const target = Keypair.generate();

  // Treasury
  const treasury = Keypair.generate();

  // A second address that is NOT blacklisted
  const innocent = Keypair.generate();

  // ATAs
  let authorityAta: PublicKey;
  let targetAta: PublicKey;
  let treasuryAta: PublicKey;
  let innocentAta: PublicKey;

  // SSS-2 roles
  const [minterRole] = getRoleAddress(ROLE_MINTER, sss2ConfigPda, authority.publicKey);
  const [minterQuota] = getQuotaAddress(sss2ConfigPda, authority.publicKey);
  const [freezerRole] = getRoleAddress(ROLE_FREEZER, sss2ConfigPda, authority.publicKey);
  const [blacklisterRole] = getRoleAddress(ROLE_BLACKLISTER, sss2ConfigPda, authority.publicKey);
  const [seizerRole] = getRoleAddress(ROLE_SEIZER, sss2ConfigPda, authority.publicKey);

  // Blacklist entries
  const [targetBlacklistEntry] = getBlacklistAddress(sss2ConfigPda, target.publicKey);
  const [innocentBlacklistEntry] = getBlacklistAddress(sss2ConfigPda, innocent.publicKey);

  // ---------------------------------------------------------------
  // SSS-1 mint (compliance DISABLED) — for testing compliance boundary
  // ---------------------------------------------------------------
  const sss1MintKeypair = Keypair.generate();
  const sss1MintKey = sss1MintKeypair.publicKey;
  const [sss1ConfigPda] = getConfigAddress(sss1MintKey);

  // SSS-1 role PDAs (for testing that compliance roles are rejected)
  const [sss1BlacklisterRole] = getRoleAddress(ROLE_BLACKLISTER, sss1ConfigPda, authority.publicKey);
  const [sss1SeizerRole] = getRoleAddress(ROLE_SEIZER, sss1ConfigPda, authority.publicKey);

  // ------------------------------------------------------------------
  // Setup: Initialize SSS-2, create roles, fund accounts, create ATAs
  // ------------------------------------------------------------------
  it("initializes SSS-2 stablecoin for blacklist testing", async () => {
    const input = {
      name: "Blacklist Test USD",
      symbol: "BLUSD",
      uri: "https://example.com/blusd.json",
      decimals: 6,
      complianceEnabled: true,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: sss2MintKey,
        config: sss2ConfigPda,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss2MintKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(sss2ConfigPda);
    expect(config.complianceEnabled).to.equal(true);
  });

  it("grants all compliance roles (minter, freezer, blacklister, seizer)", async () => {
    await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2ConfigPda,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2ConfigPda,
        roleAssignment: freezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .grantRole(ROLE_BLACKLISTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2ConfigPda,
        roleAssignment: blacklisterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .grantRole(ROLE_SEIZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2ConfigPda,
        roleAssignment: seizerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("sets unlimited minter quota", async () => {
    await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2ConfigPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("creates ATAs, thaws them, and mints tokens to target", async () => {
    authorityAta = getAssociatedTokenAddressSync(
      sss2MintKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    targetAta = getAssociatedTokenAddressSync(
      sss2MintKey,
      target.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    treasuryAta = getAssociatedTokenAddressSync(
      sss2MintKey,
      treasury.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    innocentAta = getAssociatedTokenAddressSync(
      sss2MintKey,
      innocent.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction();
    for (const [ata, owner] of [
      [authorityAta, authority.publicKey],
      [targetAta, target.publicKey],
      [treasuryAta, treasury.publicKey],
      [innocentAta, innocent.publicKey],
    ] as [PublicKey, PublicKey][]) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          ata,
          owner,
          sss2MintKey,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    await provider.sendAndConfirm(tx);

    // Thaw all ATAs (SSS-2 DefaultAccountState::Frozen)
    for (const ata of [authorityAta, targetAta, treasuryAta, innocentAta]) {
      await program.methods
        .thawAccount()
        .accountsPartial({
          freezer: authority.publicKey,
          config: sss2ConfigPda,
          freezerRole,
          mint: sss2MintKey,
          targetTokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    }

    // Mint 1000 tokens to target
    await program.methods
      .mintTokens(new BN(1_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: sss2ConfigPda,
        minterRole,
        minterQuota,
        mint: sss2MintKey,
        recipientTokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  // ==================================================================
  // BLACKLIST TESTS (SSS-2)
  // ==================================================================

  // ------------------------------------------------------------------
  // 1. Blacklist the target, then freeze them
  // ------------------------------------------------------------------
  it("blacklists and freezes the target address", async () => {
    await program.methods
      .addToBlacklist(target.publicKey, "Suspicious activity")
      .accountsPartial({
        blacklister: authority.publicKey,
        config: sss2ConfigPda,
        blacklisterRole,
        blacklistEntry: targetBlacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.blacklistEntry.fetch(targetBlacklistEntry);
    expect(entry.address.toBase58()).to.equal(target.publicKey.toBase58());
    expect(entry.active).to.equal(true);
    expect(entry.reason).to.equal("Suspicious activity");

    // Freeze the blacklisted target
    await program.methods
      .freezeAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: sss2ConfigPda,
        freezerRole,
        mint: sss2MintKey,
        targetTokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  // ------------------------------------------------------------------
  // 2. Double blacklist fails (init constraint — account already exists)
  // ------------------------------------------------------------------
  it("rejects double blacklisting the same address", async () => {
    try {
      await program.methods
        .addToBlacklist(target.publicKey, "Duplicate attempt")
        .accountsPartial({
          blacklister: authority.publicKey,
          config: sss2ConfigPda,
          blacklisterRole,
          blacklistEntry: targetBlacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — address already blacklisted");
    } catch (e: any) {
      // Anchor `init` constraint fails because the PDA account already exists
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("already in use") ||
          msg.includes("AlreadyBlacklisted") ||
          msg.includes("already been created") ||
          msg.includes("0x0"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 3. Removing blacklist for non-blacklisted address fails
  // ------------------------------------------------------------------
  it("rejects removing blacklist for a non-blacklisted address", async () => {
    try {
      await program.methods
        .removeFromBlacklist(innocent.publicKey)
        .accountsPartial({
          blacklister: authority.publicKey,
          config: sss2ConfigPda,
          blacklisterRole,
          blacklistEntry: innocentBlacklistEntry,
        })
        .rpc();
      expect.fail("Should have thrown — innocent is not blacklisted");
    } catch (e: any) {
      // The blacklist_entry PDA does not exist, so Anchor cannot deserialize it
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("NotBlacklisted") ||
          msg.includes("account not found") ||
          msg.includes("Could not find") ||
          msg.includes("has not been created"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 4. Blacklisted tokens can ONLY be seized — not transferred out
  //    (The target account is frozen, so any SPL transfer will fail
  //    because the account is frozen by the freeze authority.)
  // ------------------------------------------------------------------
  it("confirms blacklisted+frozen account cannot transfer tokens out", async () => {
    // Fund the target with SOL so they could theoretically sign
    const airdropSig = await provider.connection.requestAirdrop(
      target.publicKey,
      1_000_000_000,
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Attempt a direct SPL Token-2022 transfer from target to innocent
    // This should fail because the target's token account is frozen.
    try {
      const transferIx = anchor.web3.SystemProgram.programId; // placeholder

      // Use the raw spl-token-2022 transfer instruction
      const { createTransferInstruction } = await import("@solana/spl-token");
      const ix = createTransferInstruction(
        targetAta,
        innocentAta,
        target.publicKey,
        100_000_000, // 100 tokens
        [],
        TOKEN_2022_PROGRAM_ID,
      );

      const tx = new anchor.web3.Transaction().add(ix);
      tx.feePayer = target.publicKey;
      tx.recentBlockhash = (
        await provider.connection.getLatestBlockhash()
      ).blockhash;
      tx.sign(target);

      await provider.connection.sendRawTransaction(tx.serialize());
      expect.fail("Should have thrown — account is frozen, transfers blocked");
    } catch (e: any) {
      // Token-2022 error for frozen account
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("frozen") ||
          msg.includes("Account is frozen") ||
          msg.includes("0x11") ||
          msg.includes("custom program error"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 5. Seize SUCCEEDS on the blacklisted+frozen target
  // ------------------------------------------------------------------
  it("confirms seize works on the blacklisted frozen target", async () => {
    const seizeAmount = new BN(200_000_000); // 200 tokens

    const tx = await program.methods
      .seize(seizeAmount)
      .accountsPartial({
        seizer: authority.publicKey,
        config: sss2ConfigPda,
        seizerRole,
        blacklistEntry: targetBlacklistEntry,
        targetOwner: target.publicKey,
        mint: sss2MintKey,
        sourceTokenAccount: targetAta,
        treasuryTokenAccount: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    seize (blacklisted target) tx:", tx);
  });

  // ------------------------------------------------------------------
  // 6. Seize fails if target is NOT blacklisted
  // ------------------------------------------------------------------
  it("rejects seize when target is not blacklisted", async () => {
    // innocent is NOT blacklisted — the blacklist PDA does not exist
    try {
      await program.methods
        .seize(new BN(100_000_000))
        .accountsPartial({
          seizer: authority.publicKey,
          config: sss2ConfigPda,
          seizerRole,
          blacklistEntry: innocentBlacklistEntry,
          targetOwner: innocent.publicKey,
          mint: sss2MintKey,
          sourceTokenAccount: innocentAta,
          treasuryTokenAccount: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown — target is not blacklisted");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("SeizeNonBlacklisted") ||
          msg.includes("account not found") ||
          msg.includes("Could not find"),
      );
    }
  });

  // ==================================================================
  // SSS-1 COMPLIANCE BOUNDARY TESTS
  // ==================================================================

  it("initializes SSS-1 stablecoin (compliance disabled)", async () => {
    const input = {
      name: "No Compliance USD",
      symbol: "NCUSD",
      uri: "https://example.com/ncusd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: sss1MintKey,
        config: sss1ConfigPda,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1MintKeypair])
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(sss1ConfigPda);
    expect(config.complianceEnabled).to.equal(false);
  });

  // ------------------------------------------------------------------
  // 7. SSS-1 rejects blacklister role grant (ComplianceNotEnabled)
  // ------------------------------------------------------------------
  it("rejects granting blacklister role on SSS-1 (compliance disabled)", async () => {
    // Note: the role PDA seeds include the holder, so these are unique even
    // if the authority already has the role on the SSS-2 mint.
    // However, the PDA is global (not per-config), so if authority already
    // has ROLE_BLACKLISTER from the SSS-2 test, the init will fail for a
    // different reason. We use a fresh holder to avoid that.
    const freshHolder = Keypair.generate();
    const [freshBlRole] = getRoleAddress(ROLE_BLACKLISTER, sss1ConfigPda, freshHolder.publicKey);

    try {
      await program.methods
        .grantRole(ROLE_BLACKLISTER, freshHolder.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: sss1ConfigPda,
          roleAssignment: freshBlRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — compliance not enabled for SSS-1");
    } catch (e: any) {
      expect(e.toString()).to.contain("ComplianceNotEnabled");
    }
  });

  // ------------------------------------------------------------------
  // 8. SSS-1 rejects seizer role grant (ComplianceNotEnabled)
  // ------------------------------------------------------------------
  it("rejects granting seizer role on SSS-1 (compliance disabled)", async () => {
    const freshHolder = Keypair.generate();
    const [freshSzRole] = getRoleAddress(ROLE_SEIZER, sss1ConfigPda, freshHolder.publicKey);

    try {
      await program.methods
        .grantRole(ROLE_SEIZER, freshHolder.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: sss1ConfigPda,
          roleAssignment: freshSzRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — compliance not enabled for SSS-1");
    } catch (e: any) {
      expect(e.toString()).to.contain("ComplianceNotEnabled");
    }
  });

  // ------------------------------------------------------------------
  // 9. SSS-1 rejects add_to_blacklist (ComplianceNotEnabled)
  // ------------------------------------------------------------------
  it("rejects add_to_blacklist on SSS-1 (compliance disabled)", async () => {
    const randomAddress = Keypair.generate().publicKey;
    const [bl] = getBlacklistAddress(sss1ConfigPda, randomAddress);

    // The blacklister_role PDA was already created for SSS-2; we still pass
    // it but the config constraint should fail first (compliance_enabled = false)
    try {
      await program.methods
        .addToBlacklist(randomAddress, "Test reason")
        .accountsPartial({
          blacklister: authority.publicKey,
          config: sss1ConfigPda,
          blacklisterRole,
          blacklistEntry: bl,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — compliance not enabled for SSS-1");
    } catch (e: any) {
      expect(e.toString()).to.contain("ComplianceNotEnabled");
    }
  });

  // ------------------------------------------------------------------
  // 10. SSS-1 rejects remove_from_blacklist (ComplianceNotEnabled)
  // ------------------------------------------------------------------
  it("rejects remove_from_blacklist on SSS-1 (compliance disabled)", async () => {
    const randomAddress = Keypair.generate().publicKey;
    const [bl] = getBlacklistAddress(sss1ConfigPda, randomAddress);

    try {
      await program.methods
        .removeFromBlacklist(randomAddress)
        .accountsPartial({
          blacklister: authority.publicKey,
          config: sss1ConfigPda,
          blacklisterRole,
          blacklistEntry: bl,
        })
        .rpc();
      expect.fail("Should have thrown — compliance not enabled for SSS-1");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("ComplianceNotEnabled") ||
          msg.includes("AccountNotInitialized") ||
          msg.includes("account not found") ||
          msg.includes("Could not find"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 11. Clean up: remove target from blacklist (proves full lifecycle)
  // ------------------------------------------------------------------
  it("removes target from blacklist (cleanup)", async () => {
    await program.methods
      .removeFromBlacklist(target.publicKey)
      .accountsPartial({
        blacklister: authority.publicKey,
        config: sss2ConfigPda,
        blacklisterRole,
        blacklistEntry: targetBlacklistEntry,
      })
      .rpc();

    // Verify the blacklist entry is deactivated (not closed, for audit trail)
    const entry = await program.account.blacklistEntry.fetch(targetBlacklistEntry);
    expect(entry.active).to.equal(false);
  });
});
