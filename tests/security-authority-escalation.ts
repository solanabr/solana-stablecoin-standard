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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Security: Authority escalation & unauthorized access", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint keypair for this security test suite
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // The attacker: a separate keypair that should NEVER be able to do admin ops
  const attacker = Keypair.generate();

  // A second attacker for authority-accept spoofing
  const attacker2 = Keypair.generate();

  // Authority's own ATA for minting
  let authorityAta: PublicKey;

  // Attacker's ATA
  let attackerAta: PublicKey;

  // Role PDAs the attacker would try to use (they do NOT exist on-chain)
  const [attackerMinterRole] = getRoleAddress(ROLE_MINTER, configPda, attacker.publicKey);
  const [attackerFreezerRole] = getRoleAddress(ROLE_FREEZER, configPda, attacker.publicKey);
  const [attackerBlacklisterRole] = getRoleAddress(ROLE_BLACKLISTER, configPda, attacker.publicKey);
  const [attackerSeizerRole] = getRoleAddress(ROLE_SEIZER, configPda, attacker.publicKey);
  const [attackerMinterQuota] = getQuotaAddress(configPda, attacker.publicKey);

  // Legitimate roles for authority
  const [authorityMinterRole] = getRoleAddress(ROLE_MINTER, configPda, authority.publicKey);
  const [authorityMinterQuota] = getQuotaAddress(configPda, authority.publicKey);
  const [authorityFreezerRole] = getRoleAddress(ROLE_FREEZER, configPda, authority.publicKey);

  // ------------------------------------------------------------------
  // Setup: initialize SSS-2 mint + fund attacker + create ATAs
  // ------------------------------------------------------------------
  before(async () => {
    // Airdrop SOL to attacker wallets
    const airdrop1 = await provider.connection.requestAirdrop(
      attacker.publicKey,
      2_000_000_000,
    );
    await provider.connection.confirmTransaction(airdrop1);

    const airdrop2 = await provider.connection.requestAirdrop(
      attacker2.publicKey,
      2_000_000_000,
    );
    await provider.connection.confirmTransaction(airdrop2);
  });

  // ------------------------------------------------------------------
  // 1. Initialize SSS-2 stablecoin (compliance enabled)
  // ------------------------------------------------------------------
  it("initializes an SSS-2 stablecoin for security testing", async () => {
    const input = {
      name: "Security Test USD",
      symbol: "STUSD",
      uri: "https://example.com/stusd.json",
      decimals: 6,
      complianceEnabled: true,
      enableAllowlist: false,
      supplyCap: null,
    };

    const tx = await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintKey,
        config: configPda,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    console.log("    initialize tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(configPda);
    expect(configAccount.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(configAccount.complianceEnabled).to.equal(true);
  });

  // ------------------------------------------------------------------
  // 2. Set up legitimate roles for the real authority (for later tests)
  // ------------------------------------------------------------------
  it("grants legitimate minter role to authority", async () => {
    await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: authorityMinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("sets minter quota for the authority", async () => {
    const quotaLimit = new BN(10_000_000_000); // 10,000 tokens

    await program.methods
      .setQuota(authority.publicKey, quotaLimit)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole: authorityMinterRole,
        minterQuota: authorityMinterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("grants legitimate freezer role to authority", async () => {
    await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: authorityFreezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("creates ATAs and thaws them for authority and attacker", async () => {
    authorityAta = getAssociatedTokenAddressSync(
      mintKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    attackerAta = getAssociatedTokenAddressSync(
      mintKey,
      attacker.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction();
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAta,
        authority.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        attackerAta,
        attacker.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx);

    // SSS-2: DefaultAccountState::Frozen, so thaw both ATAs
    await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: configPda,
        freezerRole: authorityFreezerRole,
        mint: mintKey,
        targetTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: configPda,
        freezerRole: authorityFreezerRole,
        mint: mintKey,
        targetTokenAccount: attackerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  // ==================================================================
  // NEGATIVE TESTS: Unauthorized operations must fail
  // ==================================================================

  // ------------------------------------------------------------------
  // 3. Attacker CANNOT grant themselves any role
  // ------------------------------------------------------------------
  it("rejects attacker granting themselves minter role", async () => {
    try {
      await program.methods
        .grantRole(ROLE_MINTER, attacker.publicKey)
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          roleAssignment: attackerMinterRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  it("rejects attacker granting themselves freezer role", async () => {
    try {
      await program.methods
        .grantRole(ROLE_FREEZER, attacker.publicKey)
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          roleAssignment: attackerFreezerRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  it("rejects attacker granting themselves blacklister role", async () => {
    try {
      await program.methods
        .grantRole(ROLE_BLACKLISTER, attacker.publicKey)
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          roleAssignment: attackerBlacklisterRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  it("rejects attacker granting themselves seizer role", async () => {
    try {
      await program.methods
        .grantRole(ROLE_SEIZER, attacker.publicKey)
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          roleAssignment: attackerSeizerRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  // ------------------------------------------------------------------
  // 4. Attacker CANNOT mint without minter role
  // ------------------------------------------------------------------
  it("rejects minting from attacker without minter role", async () => {
    try {
      await program.methods
        .mintTokens(new BN(1_000_000))
        .accountsPartial({
          minter: attacker.publicKey,
          config: configPda,
          minterRole: attackerMinterRole,
          minterQuota: attackerMinterQuota,
          mint: mintKey,
          recipientTokenAccount: attackerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker has no minter role");
    } catch (e: any) {
      // The role PDA does not exist, so Anchor throws AccountNotInitialized
      // or a seeds constraint error
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("Unauthorized") ||
          msg.includes("account not found") ||
          msg.includes("Could not find"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 5. Attacker CANNOT freeze without freezer role
  // ------------------------------------------------------------------
  it("rejects freeze from attacker without freezer role", async () => {
    try {
      await program.methods
        .freezeAccount()
        .accountsPartial({
          freezer: attacker.publicKey,
          config: configPda,
          freezerRole: attackerFreezerRole,
          mint: mintKey,
          targetTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker has no freezer role");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("Unauthorized") ||
          msg.includes("account not found") ||
          msg.includes("Could not find"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 6. Attacker CANNOT blacklist without blacklister role
  // ------------------------------------------------------------------
  it("rejects blacklist from attacker without blacklister role", async () => {
    const [victimBlacklistEntry] = getBlacklistAddress(configPda, authority.publicKey);
    try {
      await program.methods
        .addToBlacklist(authority.publicKey, "Attacker attempt")
        .accountsPartial({
          blacklister: attacker.publicKey,
          config: configPda,
          blacklisterRole: attackerBlacklisterRole,
          blacklistEntry: victimBlacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker has no blacklister role");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("Unauthorized") ||
          msg.includes("account not found") ||
          msg.includes("Could not find"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 7. Attacker CANNOT seize without seizer role
  // ------------------------------------------------------------------
  it("rejects seize from attacker without seizer role", async () => {
    // Even if they somehow had the right accounts, the seizer_role PDA is not initialized
    const [dummyBlacklistEntry] = getBlacklistAddress(configPda, authority.publicKey);
    try {
      await program.methods
        .seize(new BN(100_000))
        .accountsPartial({
          seizer: attacker.publicKey,
          config: configPda,
          seizerRole: attackerSeizerRole,
          blacklistEntry: dummyBlacklistEntry,
          targetOwner: authority.publicKey,
          mint: mintKey,
          sourceTokenAccount: authorityAta,
          treasuryTokenAccount: attackerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker has no seizer role");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AccountNotInitialized") ||
          msg.includes("Unauthorized") ||
          msg.includes("account not found") ||
          msg.includes("Could not find"),
      );
    }
  });

  // ------------------------------------------------------------------
  // 8. Attacker CANNOT accept an authority transfer not proposed for them
  // ------------------------------------------------------------------
  it("rejects accept_authority from someone not proposed", async () => {
    // First, propose transfer to attacker2 (from real authority)
    await program.methods
      .proposeAuthority(attacker2.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    // Now attacker (not attacker2) tries to accept
    try {
      await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: attacker.publicKey,
          config: configPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not the proposed authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }

    // Cancel the proposal so it does not interfere with later tests
    await program.methods
      .cancelAuthorityTransfer()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();
  });

  // ------------------------------------------------------------------
  // 9. Attacker CANNOT pause or unpause
  // ------------------------------------------------------------------
  it("rejects pause from attacker (non-authority)", async () => {
    try {
      await program.methods
        .pause()
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  it("rejects unpause from attacker (non-authority)", async () => {
    // First pause legitimately so unpause is a valid operation
    await program.methods
      .pause()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    try {
      await program.methods
        .unpause()
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }

    // Unpause legitimately to restore normal state
    await program.methods
      .unpause()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();
  });

  // ------------------------------------------------------------------
  // 10. Attacker CANNOT propose authority transfer
  // ------------------------------------------------------------------
  it("rejects propose_authority from attacker (non-authority)", async () => {
    try {
      await program.methods
        .proposeAuthority(attacker.publicKey)
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  // ------------------------------------------------------------------
  // 11. After authority transfer, OLD authority CANNOT do admin actions
  // ------------------------------------------------------------------
  it("proves old authority loses access after authority transfer", async () => {
    // Propose transfer to attacker2
    await program.methods
      .proposeAuthority(attacker2.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    // attacker2 accepts
    await program.methods
      .acceptAuthority()
      .accountsPartial({
        newAuthority: attacker2.publicKey,
        config: configPda,
      })
      .signers([attacker2])
      .rpc();

    // Verify authority changed
    const configAccount = await program.account.stablecoinConfig.fetch(configPda);
    expect(configAccount.authority.toBase58()).to.equal(attacker2.publicKey.toBase58());

    // Old authority (provider.wallet) tries to pause — should fail
    try {
      await program.methods
        .pause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
      expect.fail("Should have thrown — old authority has no power");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }

    // Old authority tries to grant a role — should fail
    const [someRole] = getRoleAddress(ROLE_PAUSER, configPda, authority.publicKey);
    try {
      await program.methods
        .grantRole(ROLE_PAUSER, authority.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
          roleAssignment: someRole,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown — old authority cannot grant roles");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }

    // Transfer authority back for any subsequent tests
    await program.methods
      .proposeAuthority(authority.publicKey)
      .accountsPartial({
        authority: attacker2.publicKey,
        config: configPda,
      })
      .signers([attacker2])
      .rpc();

    await program.methods
      .acceptAuthority()
      .accountsPartial({
        newAuthority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    const restored = await program.account.stablecoinConfig.fetch(configPda);
    expect(restored.authority.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  // ------------------------------------------------------------------
  // 12. Attacker CANNOT cancel an authority transfer they did not propose
  // ------------------------------------------------------------------
  it("rejects cancel_authority_transfer from attacker (non-authority)", async () => {
    // Propose real transfer first
    await program.methods
      .proposeAuthority(attacker2.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    try {
      await program.methods
        .cancelAuthorityTransfer()
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }

    // Clean up: cancel legitimately
    await program.methods
      .cancelAuthorityTransfer()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();
  });

  // ------------------------------------------------------------------
  // 13. Attacker CANNOT revoke roles they did not grant
  // ------------------------------------------------------------------
  it("rejects revoke_role from attacker (non-authority)", async () => {
    try {
      await program.methods
        .revokeRole(ROLE_MINTER, authority.publicKey)
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          roleAssignment: authorityMinterRole,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  // ------------------------------------------------------------------
  // 14. Attacker CANNOT set quota
  // ------------------------------------------------------------------
  it("rejects set_quota from attacker (non-authority)", async () => {
    try {
      await program.methods
        .setQuota(authority.publicKey, new BN("18446744073709551615"))
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          minterRole: authorityMinterRole,
          minterQuota: authorityMinterQuota,
          systemProgram: SystemProgram.programId,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  // ------------------------------------------------------------------
  // 15. Attacker CANNOT set metadata
  // ------------------------------------------------------------------
  it("rejects set_metadata from attacker (non-authority)", async () => {
    try {
      await program.methods
        .setMetadata({ field: "name", value: "Hacked" })
        .accountsPartial({
          authority: attacker.publicKey,
          config: configPda,
          mint: mintKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — attacker is not authority");
    } catch (e: any) {
      expect(e.toString()).to.contain("Unauthorized");
    }
  });

  // ------------------------------------------------------------------
  // 16. accept_authority when no proposal exists fails
  // ------------------------------------------------------------------
  it("rejects accept_authority when no proposal is pending", async () => {
    // Verify no pending authority
    const configAccount = await program.account.stablecoinConfig.fetch(configPda);
    expect(configAccount.pendingAuthority.toBase58()).to.equal(
      PublicKey.default.toBase58(),
    );

    try {
      await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: attacker.publicKey,
          config: configPda,
        })
        .signers([attacker])
        .rpc();
      expect.fail("Should have thrown — no pending authority");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("NoPendingAuthority") ||
          msg.includes("Unauthorized"),
      );
    }
  });
});
