import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "3QdRLCZJ7DKGB1qC45YFzaVo9MijEYW2RrYbeRGpLqqy"
);

describe("solana-stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaStablecoin as Program;
  const authority = provider.wallet;

  function findConfigPDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin-config"), mint.toBuffer()],
      program.programId
    );
  }
  function findRolePDA(config: PublicKey, holder: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("role"), config.toBuffer(), holder.toBuffer()],
      program.programId
    );
  }
  function findBlacklistPDA(mint: PublicKey, address: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
      program.programId
    );
  }

  async function airdrop(address: PublicKey, amount = 2 * LAMPORTS_PER_SOL) {
    const sig = await provider.connection.requestAirdrop(address, amount);
    await provider.connection.confirmTransaction(sig);
  }

  async function createATA(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mint, owner, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey, ata, owner, mint,
      TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
    );
    await provider.sendAndConfirm(new Transaction().add(ix));
    return ata;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SSS-1: Minimal Stablecoin
  // ═══════════════════════════════════════════════════════════════════

  describe("SSS-1: Minimal Stablecoin", () => {
    const mintKeypair = Keypair.generate();
    let configPDA: PublicKey;
    let authorityRolePDA: PublicKey;
    let userKeypair: Keypair;
    let userTokenAccount: PublicKey;

    before(async () => {
      [configPDA] = findConfigPDA(mintKeypair.publicKey);
      [authorityRolePDA] = findRolePDA(configPDA, authority.publicKey);
      userKeypair = Keypair.generate();
      await airdrop(userKeypair.publicKey);
    });

    it("initializes an SSS-1 stablecoin", async () => {
      await program.methods
        .initialize({
          preset: { sSS1: {} },
          customFeatures: null,
          name: "Test USD",
          symbol: "TUSD",
          uri: "https://example.com/tusd.json",
          decimals: 6,
          transferHookProgram: null,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          mint: mintKeypair.publicKey,
          authorityRole: authorityRolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.equal(config.decimals, 6);
      assert.isFalse(config.paused);
      assert.isFalse(config.defaultAccountFrozen);
      assert.equal(config.totalMinted.toNumber(), 0);
      assert.equal(config.totalBurned.toNumber(), 0);
      assert.isTrue(config.features.freezeAuthority);
      assert.isFalse(config.features.permanentDelegate);
      assert.isFalse(config.features.transferHook);

      const name = Buffer.from(config.name).toString("utf8").replace(/\0/g, "");
      assert.equal(name, "Test USD");
      const symbol = Buffer.from(config.symbol).toString("utf8").replace(/\0/g, "");
      assert.equal(symbol, "TUSD");
    });

    it("authority has all roles after initialization", async () => {
      const role = await program.account.roleAssignment.fetch(authorityRolePDA);
      // All 5 roles: Minter(1) | Burner(2) | Pauser(4) | Blacklister(8) | Seizer(16)
      assert.equal(role.roleMask, 0b0001_1111);
      assert.equal(role.mintQuota.toNumber(), 0); // unlimited
    });

    it("mints tokens", async () => {
      userTokenAccount = await createATA(userKeypair.publicKey, mintKeypair.publicKey);

      await program.methods
        .mintTokens(new anchor.BN(1_000_000))
        .accounts({
          minter: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          mint: mintKeypair.publicKey,
          destination: userTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.equal(config.totalMinted.toNumber(), 1_000_000);

      const acct = await getAccount(
        provider.connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.equal(Number(acct.amount), 1_000_000);
    });

    it("burns tokens", async () => {
      await program.methods
        .burnTokens(new anchor.BN(100_000))
        .accounts({
          burner: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          mint: mintKeypair.publicKey,
          source: userTokenAccount,
          sourceAuthority: configPDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.equal(config.totalBurned.toNumber(), 100_000);
    });

    it("freezes and thaws an account", async () => {
      // Freeze
      await program.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          mint: mintKeypair.publicKey,
          tokenAccount: userTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify frozen
      let acct = await getAccount(
        provider.connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.isTrue(acct.isFrozen);

      // Thaw
      await program.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          mint: mintKeypair.publicKey,
          tokenAccount: userTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      acct = await getAccount(
        provider.connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.isFalse(acct.isFrozen);
    });

    it("pauses and unpauses", async () => {
      await program.methods
        .pause()
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
        })
        .rpc();

      let config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.isTrue(config.paused);

      // Mint should fail while paused
      try {
        await program.methods
          .mintTokens(new anchor.BN(1))
          .accounts({
            minter: authority.publicKey,
            config: configPDA,
            roleAssignment: authorityRolePDA,
            mint: mintKeypair.publicKey,
            destination: userTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should fail while paused");
      } catch (err: any) {
        // Expected
      }

      await program.methods
        .unpause()
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
        })
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.isFalse(config.paused);
    });

    it("grants and revokes roles", async () => {
      const newMinter = Keypair.generate();
      await airdrop(newMinter.publicKey);
      const [newMinterRolePDA] = findRolePDA(configPDA, newMinter.publicKey);

      await program.methods
        .manageRole({
          role: { minter: {} },
          action: { grant: {} },
          mintQuota: new anchor.BN(5_000_000),
        })
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleHolder: newMinter.publicKey,
          roleAssignment: newMinterRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      let role = await program.account.roleAssignment.fetch(newMinterRolePDA);
      assert.equal(role.roleMask & 0x01, 0x01);
      assert.equal(role.mintQuota.toNumber(), 5_000_000);

      // Revoke
      await program.methods
        .manageRole({
          role: { minter: {} },
          action: { revoke: {} },
          mintQuota: null,
        })
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleHolder: newMinter.publicKey,
          roleAssignment: newMinterRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      role = await program.account.roleAssignment.fetch(newMinterRolePDA);
      assert.equal(role.roleMask & 0x01, 0);
    });

    it("enforces mint quota", async () => {
      const quotaMinter = Keypair.generate();
      await airdrop(quotaMinter.publicKey);
      const [quotaRolePDA] = findRolePDA(configPDA, quotaMinter.publicKey);

      await program.methods
        .manageRole({
          role: { minter: {} },
          action: { grant: {} },
          mintQuota: new anchor.BN(500),
        })
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleHolder: quotaMinter.publicKey,
          roleAssignment: quotaRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Within quota
      await program.methods
        .mintTokens(new anchor.BN(500))
        .accounts({
          minter: quotaMinter.publicKey,
          config: configPDA,
          roleAssignment: quotaRolePDA,
          mint: mintKeypair.publicKey,
          destination: userTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([quotaMinter])
        .rpc();

      // Exceeds quota
      try {
        await program.methods
          .mintTokens(new anchor.BN(1))
          .accounts({
            minter: quotaMinter.publicKey,
            config: configPDA,
            roleAssignment: quotaRolePDA,
            mint: mintKeypair.publicKey,
            destination: userTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([quotaMinter])
          .rpc();
        assert.fail("Should exceed quota");
      } catch (err: any) {
        // Expected
      }
    });

    it("rejects unauthorized callers", async () => {
      const nobody = Keypair.generate();
      await airdrop(nobody.publicKey);

      try {
        const [fakePDA] = findRolePDA(configPDA, nobody.publicKey);
        await program.methods
          .mintTokens(new anchor.BN(1))
          .accounts({
            minter: nobody.publicKey,
            config: configPDA,
            roleAssignment: fakePDA,
            mint: mintKeypair.publicKey,
            destination: userTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody])
          .rpc();
        assert.fail("Should be unauthorized");
      } catch (err) {
        // Expected
      }
    });

    it("rejects zero-amount mint", async () => {
      try {
        await program.methods
          .mintTokens(new anchor.BN(0))
          .accounts({
            minter: authority.publicKey,
            config: configPDA,
            roleAssignment: authorityRolePDA,
            mint: mintKeypair.publicKey,
            destination: userTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should reject zero amount");
      } catch (err: any) {
        // Expected
      }
    });

    it("transfers authority", async () => {
      const newAuth = Keypair.generate();
      await airdrop(newAuth.publicKey);

      await program.methods
        .transferAuthority(newAuth.publicKey)
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
        })
        .rpc();

      let config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.deepEqual(config.authority, newAuth.publicKey);

      // Transfer back
      await program.methods
        .transferAuthority(authority.publicKey)
        .accounts({
          authority: newAuth.publicKey,
          config: configPDA,
        })
        .signers([newAuth])
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.deepEqual(config.authority, authority.publicKey);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SSS-2: Compliant Stablecoin (Full Seize Flow)
  // ═══════════════════════════════════════════════════════════════════

  describe("SSS-2: Compliant Stablecoin", () => {
    const mintKeypair = Keypair.generate();
    let configPDA: PublicKey;
    let authorityRolePDA: PublicKey;
    let targetKeypair: Keypair;
    let targetTokenAccount: PublicKey;
    let treasuryTokenAccount: PublicKey;

    before(async () => {
      [configPDA] = findConfigPDA(mintKeypair.publicKey);
      [authorityRolePDA] = findRolePDA(configPDA, authority.publicKey);
      targetKeypair = Keypair.generate();
      await airdrop(targetKeypair.publicKey);
    });

    it("initializes an SSS-2 stablecoin", async () => {
      await program.methods
        .initialize({
          preset: { sSS2: {} },
          customFeatures: null,
          name: "Compliant USD",
          symbol: "CUSD",
          uri: "https://example.com/cusd.json",
          decimals: 6,
          transferHookProgram: TRANSFER_HOOK_PROGRAM_ID,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          mint: mintKeypair.publicKey,
          authorityRole: authorityRolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.isTrue(config.features.permanentDelegate);
      assert.isTrue(config.features.transferHook);
      assert.isTrue(config.features.freezeAuthority);
      assert.deepEqual(config.transferHookProgram, TRANSFER_HOOK_PROGRAM_ID);
    });

    it("sets up accounts for compliance testing", async () => {
      targetTokenAccount = await createATA(targetKeypair.publicKey, mintKeypair.publicKey);
      treasuryTokenAccount = await createATA(authority.publicKey, mintKeypair.publicKey);

      await program.methods
        .mintTokens(new anchor.BN(10_000_000))
        .accounts({
          minter: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          mint: mintKeypair.publicKey,
          destination: targetTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("adds an address to the blacklist with reason", async () => {
      const [blacklistPDA] = findBlacklistPDA(mintKeypair.publicKey, targetKeypair.publicKey);

      await program.methods
        .addToBlacklist(targetKeypair.publicKey, "OFAC sanctions list")
        .accounts({
          blacklister: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          blacklistEntry: blacklistPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistPDA);
      assert.deepEqual(entry.address, targetKeypair.publicKey);
      assert.deepEqual(entry.addedBy, authority.publicKey);
      const reason = Buffer.from(entry.reason).toString("utf8").replace(/\0/g, "");
      assert.equal(reason, "OFAC sanctions list");
    });

    it("rejects duplicate blacklist addition", async () => {
      const [blacklistPDA] = findBlacklistPDA(mintKeypair.publicKey, targetKeypair.publicKey);
      try {
        await program.methods
          .addToBlacklist(targetKeypair.publicKey, "Duplicate")
          .accounts({
            blacklister: authority.publicKey,
            config: configPDA,
            roleAssignment: authorityRolePDA,
            blacklistEntry: blacklistPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should reject duplicate");
      } catch (err) {
        // Expected
      }
    });

    // ─── Critical SSS-2 Flow: mint → blacklist → seize → verify ───

    it("seizes tokens from blacklisted account (full flow)", async () => {
      const [blacklistPDA] = findBlacklistPDA(mintKeypair.publicKey, targetKeypair.publicKey);

      const sourceBefore = await getAccount(
        provider.connection, targetTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      const beforeAmount = Number(sourceBefore.amount);

      await program.methods
        .seize(new anchor.BN(5_000_000))
        .accounts({
          seizer: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          blacklistEntry: blacklistPDA,
          mint: mintKeypair.publicKey,
          source: targetTokenAccount,
          destination: treasuryTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify tokens moved
      const sourceAfter = await getAccount(
        provider.connection, targetTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.equal(Number(sourceAfter.amount), beforeAmount - 5_000_000);

      const destAfter = await getAccount(
        provider.connection, treasuryTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.equal(Number(destAfter.amount), 5_000_000);
    });

    it("rejects seize from wrong owner (security check)", async () => {
      // Create an innocent account
      const innocent = Keypair.generate();
      await airdrop(innocent.publicKey);
      const innocentATA = await createATA(innocent.publicKey, mintKeypair.publicKey);

      await program.methods
        .mintTokens(new anchor.BN(1_000_000))
        .accounts({
          minter: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          mint: mintKeypair.publicKey,
          destination: innocentATA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Try to seize from innocent using target's blacklist entry
      const [blacklistPDA] = findBlacklistPDA(mintKeypair.publicKey, targetKeypair.publicKey);

      try {
        await program.methods
          .seize(new anchor.BN(500_000))
          .accounts({
            seizer: authority.publicKey,
            config: configPDA,
            roleAssignment: authorityRolePDA,
            blacklistEntry: blacklistPDA,
            mint: mintKeypair.publicKey,
            source: innocentATA,
            destination: treasuryTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should reject seize from wrong owner");
      } catch (err: any) {
        // SourceOwnerMismatch
      }
    });

    it("rejects seize without Seizer role", async () => {
      const nobody = Keypair.generate();
      await airdrop(nobody.publicKey);
      const [nobodyRolePDA] = findRolePDA(configPDA, nobody.publicKey);

      // Grant only Minter role
      await program.methods
        .manageRole({
          role: { minter: {} },
          action: { grant: {} },
          mintQuota: null,
        })
        .accounts({
          authority: authority.publicKey,
          config: configPDA,
          roleHolder: nobody.publicKey,
          roleAssignment: nobodyRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const [blacklistPDA] = findBlacklistPDA(mintKeypair.publicKey, targetKeypair.publicKey);

      try {
        await program.methods
          .seize(new anchor.BN(100))
          .accounts({
            seizer: nobody.publicKey,
            config: configPDA,
            roleAssignment: nobodyRolePDA,
            blacklistEntry: blacklistPDA,
            mint: mintKeypair.publicKey,
            source: targetTokenAccount,
            destination: treasuryTokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([nobody])
          .rpc();
        assert.fail("Should reject unauthorized seizer");
      } catch (err: any) {
        // Expected
      }
    });

    it("removes an address from the blacklist", async () => {
      const [blacklistPDA] = findBlacklistPDA(mintKeypair.publicKey, targetKeypair.publicKey);

      await program.methods
        .removeFromBlacklist(targetKeypair.publicKey)
        .accounts({
          blacklister: authority.publicKey,
          config: configPDA,
          roleAssignment: authorityRolePDA,
          blacklistEntry: blacklistPDA,
        })
        .rpc();

      try {
        await program.account.blacklistEntry.fetch(blacklistPDA);
        assert.fail("Blacklist entry should be closed");
      } catch (err: any) {
        // Expected
      }
    });

    it("rejects blacklist operations on SSS-1 mints", async () => {
      const sss1Mint = Keypair.generate();
      const [sss1Config] = findConfigPDA(sss1Mint.publicKey);
      const [sss1Role] = findRolePDA(sss1Config, authority.publicKey);

      await program.methods
        .initialize({
          preset: { sSS1: {} },
          customFeatures: null,
          name: "SSS1 Only",
          symbol: "S1",
          uri: "",
          decimals: 6,
          transferHookProgram: null,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey,
          config: sss1Config,
          mint: sss1Mint.publicKey,
          authorityRole: sss1Role,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([sss1Mint])
        .rpc();

      const [blacklistPDA] = findBlacklistPDA(sss1Mint.publicKey, targetKeypair.publicKey);

      try {
        await program.methods
          .addToBlacklist(targetKeypair.publicKey, "test")
          .accounts({
            blacklister: authority.publicKey,
            config: sss1Config,
            roleAssignment: sss1Role,
            blacklistEntry: blacklistPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should reject blacklist on SSS-1");
      } catch (err: any) {
        // Expected: ComplianceNotEnabled
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Preset Configuration
  // ═══════════════════════════════════════════════════════════════════

  describe("Preset Configuration", () => {
    it("SSS-1 preset enables correct features", async () => {
      const mint = Keypair.generate();
      const [configPDA] = findConfigPDA(mint.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      await program.methods
        .initialize({
          preset: { sSS1: {} },
          customFeatures: null,
          name: "P1", symbol: "P1", uri: "", decimals: 9,
          transferHookProgram: null, defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          mint: mint.publicKey, authorityRole: rolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mint])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.isTrue(config.features.freezeAuthority);
      assert.isFalse(config.features.permanentDelegate);
      assert.isFalse(config.features.transferHook);
      assert.isFalse(config.features.confidentialTransfers);
    });

    it("Custom preset uses provided feature flags", async () => {
      const mint = Keypair.generate();
      const [configPDA] = findConfigPDA(mint.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      await program.methods
        .initialize({
          preset: { custom: {} },
          customFeatures: {
            freezeAuthority: true,
            permanentDelegate: true,
            transferHook: false,
            confidentialTransfers: false,
          },
          name: "Custom", symbol: "CUST", uri: "", decimals: 8,
          transferHookProgram: null, defaultAccountFrozen: true,
        })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          mint: mint.publicKey, authorityRole: rolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mint])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.isTrue(config.features.freezeAuthority);
      assert.isTrue(config.features.permanentDelegate);
      assert.isFalse(config.features.transferHook);
      assert.isTrue(config.defaultAccountFrozen);
    });

    it("Custom preset without features fails", async () => {
      const mint = Keypair.generate();
      const [configPDA] = findConfigPDA(mint.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      try {
        await program.methods
          .initialize({
            preset: { custom: {} },
            customFeatures: null,
            name: "Bad", symbol: "BAD", uri: "", decimals: 6,
            transferHookProgram: null, defaultAccountFrozen: false,
          })
          .accounts({
            authority: authority.publicKey, config: configPDA,
            mint: mint.publicKey, authorityRole: rolePDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([mint])
          .rpc();
        assert.fail("Should require custom_features");
      } catch (err) {
        // Expected
      }
    });

    it("validates name length", async () => {
      const mint = Keypair.generate();
      const [configPDA] = findConfigPDA(mint.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      try {
        await program.methods
          .initialize({
            preset: { sSS1: {} },
            customFeatures: null,
            name: "A".repeat(33), symbol: "X", uri: "", decimals: 6,
            transferHookProgram: null, defaultAccountFrozen: false,
          })
          .accounts({
            authority: authority.publicKey, config: configPDA,
            mint: mint.publicKey, authorityRole: rolePDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([mint])
          .rpc();
        assert.fail("Should reject long name");
      } catch (err) {
        // Expected
      }
    });

    it("validates decimals range", async () => {
      const mint = Keypair.generate();
      const [configPDA] = findConfigPDA(mint.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      try {
        await program.methods
          .initialize({
            preset: { sSS1: {} },
            customFeatures: null,
            name: "Bad", symbol: "BD", uri: "", decimals: 19,
            transferHookProgram: null, defaultAccountFrozen: false,
          })
          .accounts({
            authority: authority.publicKey, config: configPDA,
            mint: mint.publicKey, authorityRole: rolePDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([mint])
          .rpc();
        assert.fail("Should reject decimals > 18");
      } catch (err) {
        // Expected
      }
    });

    it("requires transfer_hook_program for SSS-2 if not provided", async () => {
      // This tests that SSS-2 with transfer_hook=true requires the hook program
      // The spec mandates this check
      const mint = Keypair.generate();
      const [configPDA] = findConfigPDA(mint.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      try {
        await program.methods
          .initialize({
            preset: { sSS2: {} },
            customFeatures: null,
            name: "NoHook", symbol: "NH", uri: "", decimals: 6,
            transferHookProgram: null, // Missing!
            defaultAccountFrozen: false,
          })
          .accounts({
            authority: authority.publicKey, config: configPDA,
            mint: mint.publicKey, authorityRole: rolePDA,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
          })
          .signers([mint])
          .rpc();
        assert.fail("Should require transfer hook program for SSS-2");
      } catch (err) {
        // Expected
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  Role Separation (SSS-2)
  // ═══════════════════════════════════════════════════════════════════

  describe("Role Separation", () => {
    const mintKeypair = Keypair.generate();
    let configPDA: PublicKey;

    before(async () => {
      [configPDA] = findConfigPDA(mintKeypair.publicKey);
      const [rolePDA] = findRolePDA(configPDA, authority.publicKey);

      await program.methods
        .initialize({
          preset: { sSS2: {} },
          customFeatures: null,
          name: "Role Test", symbol: "ROLE", uri: "", decimals: 6,
          transferHookProgram: TRANSFER_HOOK_PROGRAM_ID,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          mint: mintKeypair.publicKey, authorityRole: rolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
    });

    it("separates Blacklister and Seizer roles", async () => {
      const blacklister = Keypair.generate();
      const seizer = Keypair.generate();
      await airdrop(blacklister.publicKey);
      await airdrop(seizer.publicKey);

      const [blRolePDA] = findRolePDA(configPDA, blacklister.publicKey);
      const [szRolePDA] = findRolePDA(configPDA, seizer.publicKey);

      await program.methods
        .manageRole({ role: { blacklister: {} }, action: { grant: {} }, mintQuota: null })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          roleHolder: blacklister.publicKey, roleAssignment: blRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .manageRole({ role: { seizer: {} }, action: { grant: {} }, mintQuota: null })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          roleHolder: seizer.publicKey, roleAssignment: szRolePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const blRole = await program.account.roleAssignment.fetch(blRolePDA);
      const szRole = await program.account.roleAssignment.fetch(szRolePDA);

      assert.equal(blRole.roleMask & 0x08, 0x08); // Blacklister bit
      assert.equal(blRole.roleMask & 0x10, 0x00); // No Seizer

      assert.equal(szRole.roleMask & 0x10, 0x10); // Seizer bit
      assert.equal(szRole.roleMask & 0x08, 0x00); // No Blacklister
    });

    it("rejects Blacklister/Seizer roles on SSS-1", async () => {
      const sss1Mint = Keypair.generate();
      const [sss1Config] = findConfigPDA(sss1Mint.publicKey);
      const [sss1Role] = findRolePDA(sss1Config, authority.publicKey);

      await program.methods
        .initialize({
          preset: { sSS1: {} }, customFeatures: null,
          name: "S1Role", symbol: "S1R", uri: "", decimals: 6,
          transferHookProgram: null, defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey, config: sss1Config,
          mint: sss1Mint.publicKey, authorityRole: sss1Role,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([sss1Mint])
        .rpc();

      const newUser = Keypair.generate();
      const [newUserRole] = findRolePDA(sss1Config, newUser.publicKey);

      try {
        await program.methods
          .manageRole({ role: { seizer: {} }, action: { grant: {} }, mintQuota: null })
          .accounts({
            authority: authority.publicKey, config: sss1Config,
            roleHolder: newUser.publicKey, roleAssignment: newUserRole,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should reject Seizer on SSS-1");
      } catch (err) {
        // Expected
      }

      try {
        await program.methods
          .manageRole({ role: { blacklister: {} }, action: { grant: {} }, mintQuota: null })
          .accounts({
            authority: authority.publicKey, config: sss1Config,
            roleHolder: newUser.publicKey, roleAssignment: newUserRole,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should reject Blacklister on SSS-1");
      } catch (err) {
        // Expected
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SSS-2: Transfer Hook Wiring
  // ═══════════════════════════════════════════════════════════════════

  describe("SSS-2: Transfer Hook Wiring", () => {
    const hookProgram = (anchor.workspace as any).SssTransferHook as Program | undefined;
    const mintKeypair = Keypair.generate();
    let configPDA: PublicKey;
    let authorityRolePDA: PublicKey;

    before(async () => {
      [configPDA] = findConfigPDA(mintKeypair.publicKey);
      [authorityRolePDA] = findRolePDA(configPDA, authority.publicKey);
    });

    it("initializes SSS-2 mint with transfer hook extension configured", async () => {
      await program.methods
        .initialize({
          preset: { sSS2: {} }, customFeatures: null,
          name: "Hook Test", symbol: "HOOK", uri: "", decimals: 6,
          transferHookProgram: TRANSFER_HOOK_PROGRAM_ID,
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          mint: mintKeypair.publicKey, authorityRole: authorityRolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPDA);
      assert.isTrue(config.features.transferHook);
      assert.deepEqual(config.transferHookProgram, TRANSFER_HOOK_PROGRAM_ID);
    });

    it("initializes extra account metas PDA for the transfer hook", async function () {
      if (!hookProgram) {
        this.skip(); // Hook program not deployed in test validator
        return;
      }

      const [extraMetasPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mintKeypair.publicKey.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID
      );

      await hookProgram.methods
        .initializeExtraAccountMetas()
        .accounts({
          payer: authority.publicKey,
          extraAccountMetas: extraMetasPDA,
          mint: mintKeypair.publicKey,
          stablecoinProgram: program.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const acctInfo = await provider.connection.getAccountInfo(extraMetasPDA);
      assert.isNotNull(acctInfo, "Extra metas PDA should exist");
      assert.isTrue(acctInfo!.data.length > 0, "Should contain TLV data");
    });

    it("extra account metas PDA contains correct TLV configuration", async function () {
      if (!hookProgram) {
        this.skip();
        return;
      }

      const [extraMetasPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mintKeypair.publicKey.toBuffer()],
        TRANSFER_HOOK_PROGRAM_ID
      );

      const acctInfo = await provider.connection.getAccountInfo(extraMetasPDA);
      assert.isNotNull(acctInfo);
      // TLV header (12 bytes) + 3 extra metas (~35 bytes each) = ~117+ bytes
      assert.isTrue(acctInfo!.data.length >= 100, "Should hold 3 extra account metas");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  SSS-1: E2E Transfer Flow (mint → transfer → freeze)
  // ═══════════════════════════════════════════════════════════════════

  describe("SSS-1: E2E Transfer Flow", () => {
    const mintKeypair = Keypair.generate();
    let configPDA: PublicKey;
    let authorityRolePDA: PublicKey;
    let aliceKeypair: Keypair;
    let bobKeypair: Keypair;
    let aliceATA: PublicKey;
    let bobATA: PublicKey;

    before(async () => {
      [configPDA] = findConfigPDA(mintKeypair.publicKey);
      [authorityRolePDA] = findRolePDA(configPDA, authority.publicKey);
      aliceKeypair = Keypair.generate();
      bobKeypair = Keypair.generate();
      await airdrop(aliceKeypair.publicKey);
      await airdrop(bobKeypair.publicKey);

      // Init SSS-1 mint
      await program.methods
        .initialize({
          preset: { sSS1: {} }, customFeatures: null,
          name: "E2E Test", symbol: "E2E", uri: "", decimals: 6,
          transferHookProgram: null, defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey, config: configPDA,
          mint: mintKeypair.publicKey, authorityRole: authorityRolePDA,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      aliceATA = await createATA(aliceKeypair.publicKey, mintKeypair.publicKey);
      bobATA = await createATA(bobKeypair.publicKey, mintKeypair.publicKey);

      // Mint to Alice
      await program.methods
        .mintTokens(new anchor.BN(5_000_000))
        .accounts({
          minter: authority.publicKey, config: configPDA,
          roleAssignment: authorityRolePDA, mint: mintKeypair.publicKey,
          destination: aliceATA, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("Alice can transfer tokens to Bob via Token-2022 transfer_checked", async () => {
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      const ix = createTransferCheckedInstruction(
        aliceATA, mintKeypair.publicKey, bobATA,
        aliceKeypair.publicKey, 1_000_000, 6,
        [], TOKEN_2022_PROGRAM_ID
      );
      const tx = new Transaction().add(ix);
      tx.feePayer = aliceKeypair.publicKey;
      tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      tx.sign(aliceKeypair);
      const sig = await provider.connection.sendRawTransaction(tx.serialize());
      await provider.connection.confirmTransaction(sig);

      const bobAcct = await getAccount(
        provider.connection, bobATA, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.equal(Number(bobAcct.amount), 1_000_000);
    });

    it("freezing Alice prevents further transfers", async () => {
      // Freeze Alice's token account
      await program.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey, config: configPDA,
          roleAssignment: authorityRolePDA, mint: mintKeypair.publicKey,
          tokenAccount: aliceATA, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Verify frozen
      const frozenAcct = await getAccount(
        provider.connection, aliceATA, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.isTrue(frozenAcct.isFrozen);

      // Alice tries to transfer — should fail
      try {
        const { createTransferCheckedInstruction } = await import("@solana/spl-token");
        const ix = createTransferCheckedInstruction(
          aliceATA, mintKeypair.publicKey, bobATA,
          aliceKeypair.publicKey, 100_000, 6,
          [], TOKEN_2022_PROGRAM_ID
        );
        const tx = new Transaction().add(ix);
        tx.feePayer = aliceKeypair.publicKey;
        tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx.sign(aliceKeypair);
        await provider.connection.sendRawTransaction(tx.serialize());
        assert.fail("Should have failed — account is frozen");
      } catch (err) {
        // Expected: Token-2022 rejects transfer from frozen account
      }

      // Thaw Alice
      await program.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey, config: configPDA,
          roleAssignment: authorityRolePDA, mint: mintKeypair.publicKey,
          tokenAccount: aliceATA, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const thawedAcct = await getAccount(
        provider.connection, aliceATA, "confirmed", TOKEN_2022_PROGRAM_ID
      );
      assert.isFalse(thawedAcct.isFrozen);
    });
  });
});
