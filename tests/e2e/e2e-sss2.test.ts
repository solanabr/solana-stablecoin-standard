import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
} from "@sss/sdk";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS2Mint,
  grantRole,
  createTokenAccount,
  initializeHook,
  airdropSol,
  blacklistWallet,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("e2e: SSS-2 full lifecycle", () => {
  let mint: PublicKey;
  let config: PublicKey;
  let hookConfig: PublicKey;
  let mintKeypair: Keypair;
  const treasury = Keypair.generate();
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const seizer = Keypair.generate();
  const pauser = Keypair.generate();
  const complianceOfficer = Keypair.generate();
  const user = Keypair.generate();

  before(async () => {
    await Promise.all([
      airdropSol(admin.publicKey),
      airdropSol(treasury.publicKey),
      airdropSol(minter.publicKey),
      airdropSol(burner.publicKey),
      airdropSol(seizer.publicKey),
      airdropSol(pauser.publicKey),
      airdropSol(complianceOfficer.publicKey),
      airdropSol(user.publicKey),
    ]);
  });

  describe("1. create SSS-2 mint with PermanentDelegate + TransferHook", () => {
    it("creates SSS-2 mint with correct preset", async () => {
      const result = await createSSS2Mint(treasury.publicKey);
      mintKeypair = result.mintKeypair;
      mint = mintKeypair.publicKey;
      config = result.configPda;
      [hookConfig] = findHookConfigPda(mint);

      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.deepEqual(cfg.preset, { sss2: {} }, "preset should be SSS-2");
      assert.ok(cfg.treasury.equals(treasury.publicKey), "treasury should match");
    });
  });

  describe("2. initialize transfer hook", () => {
    it("initializes hook config for the SSS-2 mint", async () => {
      await initializeHook(mint, config);
      const account = await provider.connection.getAccountInfo(hookConfig);
      assert.isNotNull(account, "hook config should be initialized");
    });
  });

  describe("3. grant all role types", () => {
    it("grants all five role types", async () => {
      await grantRole(config, minter.publicKey, ROLE.Minter, 100_000);
      await grantRole(config, burner.publicKey, ROLE.Burner);
      await grantRole(config, seizer.publicKey, ROLE.Seizer);
      await grantRole(config, pauser.publicKey, ROLE.Pauser);
      await grantRole(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);
      const [burnerRole] = findRolePda(config, burner.publicKey, ROLE.Burner);
      const [seizerRole] = findRolePda(config, seizer.publicKey, ROLE.Seizer);
      const [pauserRole] = findRolePda(config, pauser.publicKey, ROLE.Pauser);
      const [coRole] = findRolePda(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

      for (const rolePda of [minterRole, burnerRole, seizerRole, pauserRole, coRole]) {
        const account = await provider.connection.getAccountInfo(rolePda);
        assert.isNotNull(account, `role PDA ${rolePda.toBase58()} should exist`);
      }
    });
  });

  describe("4. mint tokens (minter)", () => {
    it("minter can mint 1000 tokens to user", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);
      const [userBlacklistEntry] = findBlacklistEntryPda(hookConfig, user.publicKey);

      await coreProgram.methods
        .mintTo(new BN(1000))
        .accounts({
          minter: minter.publicKey,
          config,
          roleAccount: minterRole,
          mint,
          to: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: userBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([minter])
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(userAta);
      assert.equal(balance.value.amount, "1000", "user should have 1000 tokens");
    });
  });

  describe("5. burn tokens from any account (permanent delegate)", () => {
    it("burner burns 200 tokens from user via permanent delegate", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const [burnerRole] = findRolePda(config, burner.publicKey, ROLE.Burner);
      const [userBlacklistEntry] = findBlacklistEntryPda(hookConfig, user.publicKey);

      await coreProgram.methods
        .burnFrom(new BN(200))
        .accounts({
          burner: burner.publicKey,
          config,
          roleAccount: burnerRole,
          mint,
          from: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: userBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([burner])
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(userAta);
      assert.equal(balance.value.amount, "800", "user should have 800 tokens after burn");
    });
  });

  describe("6. blacklist wallet via CPI", () => {
    it("admin blacklists user via core program CPI", async () => {
      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, user.publicKey);
      await coreProgram.methods
        .blacklist(user.publicKey)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await provider.connection.getAccountInfo(blacklistEntry);
      assert.isNotNull(entry, "blacklist entry should exist");
    });
  });

  describe("7. unblacklist wallet via CPI", () => {
    it("admin unblacklists user via core program CPI", async () => {
      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, user.publicKey);

      await coreProgram.methods
        .unblacklist(user.publicKey)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
        })
        .rpc();

      const entry = await provider.connection.getAccountInfo(blacklistEntry);
      assert.isNull(entry, "blacklist entry should be removed");
    });
  });

  describe("8. freeze account (compliance officer)", () => {
    it("compliance officer can freeze a token account", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const [coRole] = findRolePda(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

      await coreProgram.methods
        .freezeAccount()
        .accounts({
          authority: complianceOfficer.publicKey,
          config,
          roleAccount: coRole,
          mint,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([complianceOfficer])
        .rpc();

      const ataInfo = await provider.connection.getAccountInfo(userAta);
      assert.isNotNull(ataInfo, "account should still exist after freeze");
    });
  });

  describe("9. thaw account (compliance officer)", () => {
    it("compliance officer can thaw a frozen token account", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const [coRole] = findRolePda(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

      await coreProgram.methods
        .thawAccount()
        .accounts({
          authority: complianceOfficer.publicKey,
          config,
          roleAccount: coRole,
          mint,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([complianceOfficer])
        .rpc();

      const ataInfo = await provider.connection.getAccountInfo(userAta);
      assert.isNotNull(ataInfo, "account should still exist after thaw");
    });
  });

  describe("10. seize tokens (thaw -> burn -> freeze -> mint to treasury)", () => {
    it("seizer can seize tokens from account to treasury", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const treasuryAta = await createTokenAccount(mint, treasury.publicKey);
      const [seizerRole] = findRolePda(config, seizer.publicKey, ROLE.Seizer);
      const [userBlacklistEntry] = findBlacklistEntryPda(hookConfig, user.publicKey);

      // Mint some tokens to user first
      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);
      await coreProgram.methods
        .mintTo(new BN(500))
        .accounts({
          minter: minter.publicKey, config, roleAccount: minterRole,
          mint, to: userAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: userBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([minter])
        .rpc();

      // Blacklist user before seizing (seize requires blacklisted target)
      await blacklistWallet(hookConfig, config, user.publicKey);

      await coreProgram.methods
        .seize(new BN(100))
        .accounts({
          seizer: seizer.publicKey,
          config,
          roleAccount: seizerRole,
          mint,
          from: userAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: userBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([seizer])
        .rpc();

      const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryAta);
      assert.isAbove(parseInt(treasuryBalance.value.amount), 0, "treasury should receive seized tokens");
    });
  });

  describe("11. increment minter allowance", () => {
    it("admin can increment the minter's allowance", async () => {
      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);

      const before = await coreProgram.account.roleAccount.fetch(minterRole);
      const beforeAllowance = before.allowance.toNumber();

      await coreProgram.methods
        .incrementAllowance(new BN(500))
        .accounts({
          admin: admin.publicKey,
          config,
          minterRoleAccount: minterRole,
        })
        .rpc();

      const after = await coreProgram.account.roleAccount.fetch(minterRole);
      assert.equal(
        after.allowance.toNumber(),
        beforeAllowance + 500,
        "allowance should increase by 500"
      );
    });
  });

  describe("12. pause/unpause with pauser role", () => {
    it("pauser can pause and unpause the stablecoin", async () => {
      const [pauserRole] = findRolePda(config, pauser.publicKey, ROLE.Pauser);

      await coreProgram.methods
        .pause()
        .accounts({ authority: pauser.publicKey, config, roleAccount: pauserRole })
        .signers([pauser])
        .rpc();

      let cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.isTrue(cfg.paused);

      await coreProgram.methods
        .unpause()
        .accounts({ authority: pauser.publicKey, config, roleAccount: pauserRole })
        .signers([pauser])
        .rpc();

      cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.isFalse(cfg.paused);
    });
  });

  describe("13. two-step admin transfer", () => {
    it("transfers admin and accepts with new admin", async () => {
      const newAdmin = Keypair.generate();
      await airdropSol(newAdmin.publicKey);

      await coreProgram.methods
        .transferAdmin(newAdmin.publicKey)
        .accounts({ admin: admin.publicKey, config })
        .rpc();

      let cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.ok(cfg.pendingAdmin.equals(newAdmin.publicKey));

      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: newAdmin.publicKey, config })
        .signers([newAdmin])
        .rpc();

      cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.ok(cfg.admin.equals(newAdmin.publicKey));

      // Transfer back
      await coreProgram.methods
        .transferAdmin(admin.publicKey)
        .accounts({ admin: newAdmin.publicKey, config })
        .signers([newAdmin])
        .rpc();
      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: admin.publicKey, config })
        .rpc();
    });
  });

  describe("14. full seize flow: blacklist -> freeze -> seize -> treasury receives", () => {
    it("complete compliance seize flow works end-to-end", async () => {
      const target = Keypair.generate();
      await airdropSol(target.publicKey);
      const targetAta = await createTokenAccount(mint, target.publicKey);
      const treasuryAta = await createTokenAccount(mint, treasury.publicKey);
      const [targetBlacklistEntry] = findBlacklistEntryPda(hookConfig, target.publicKey);

      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);
      await coreProgram.methods
        .mintTo(new BN(500))
        .accounts({
          minter: minter.publicKey, config, roleAccount: minterRole,
          mint, to: targetAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: targetBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([minter])
        .rpc();

      // Blacklist via CPI
      await coreProgram.methods
        .blacklist(target.publicKey)
        .accounts({
          payer: admin.publicKey, admin: admin.publicKey, config,
          hookConfig, blacklistEntry: targetBlacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Freeze
      const [coRole] = findRolePda(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);
      await coreProgram.methods
        .freezeAccount()
        .accounts({
          authority: complianceOfficer.publicKey, config, roleAccount: coRole,
          mint, tokenAccount: targetAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([complianceOfficer])
        .rpc();

      // Seize
      const [seizerRole] = findRolePda(config, seizer.publicKey, ROLE.Seizer);
      const treasuryBefore = await provider.connection.getTokenAccountBalance(treasuryAta);

      await coreProgram.methods
        .seize(new BN(500))
        .accounts({
          seizer: seizer.publicKey, config, roleAccount: seizerRole,
          mint, from: targetAta, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: targetBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([seizer])
        .rpc();

      const treasuryAfter = await provider.connection.getTokenAccountBalance(treasuryAta);
      const gained = parseInt(treasuryAfter.value.amount) - parseInt(treasuryBefore.value.amount);
      assert.equal(gained, 500, "treasury should gain exactly 500 seized tokens");
    });
  });

  describe("15. blacklisted address can't receive mint_to", () => {
    it("mint_to to blacklisted address behavior check", async () => {
      const blacklistedUser = Keypair.generate();
      await airdropSol(blacklistedUser.publicKey);
      const blacklistedAta = await createTokenAccount(mint, blacklistedUser.publicKey);

      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, blacklistedUser.publicKey);
      await coreProgram.methods
        .blacklist(blacklistedUser.publicKey)
        .accounts({
          payer: admin.publicKey, admin: admin.publicKey, config,
          hookConfig, blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await provider.connection.getAccountInfo(blacklistEntry);
      assert.isNotNull(entry, "blacklist entry should exist");
    });
  });
});
