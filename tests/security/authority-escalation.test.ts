import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { findRolePda, findHookConfigPda, findBlacklistEntryPda, findExtraAccountMetaListPda } from "@sss/sdk";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS1Mint,
  createSSS2Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  initializeHook,
  blacklistWallet,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("security: authority escalation", () => {
  let configPda: PublicKey;

  beforeEach(async () => {
    const result = await createSSS1Mint();
    configPda = result.configPda;
  });

  it("minter cannot grant roles", async () => {
    const minter = Keypair.generate();
    const target = Keypair.generate();
    await airdropSol(minter.publicKey);
    await grantRole(configPda, minter.publicKey, ROLE.Minter, 100_000);

    const [targetRole] = findRolePda(configPda, target.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .grantRole({ minter: {} }, new BN(1000))
        .accounts({
          admin: minter.publicKey,
          config: configPda,
          holder: target.publicKey,
          roleAccount: targetRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([minter])
        .rpc();
      expect.fail("Minter should not be able to grant roles");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("minter cannot revoke roles", async () => {
    const minter = Keypair.generate();
    const burner = Keypair.generate();
    await airdropSol(minter.publicKey);
    await airdropSol(burner.publicKey);
    await grantRole(configPda, minter.publicKey, ROLE.Minter, 100_000);
    const burnerRole = await grantRole(configPda, burner.publicKey, ROLE.Burner);

    try {
      await coreProgram.methods
        .revokeRole()
        .accounts({
          admin: minter.publicKey,
          config: configPda,
          holder: burner.publicKey,
          roleAccount: burnerRole,
        })
        .signers([minter])
        .rpc();
      expect.fail("Minter should not be able to revoke roles");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("pauser cannot mint tokens", async () => {
    const result = await createSSS1Mint();
    const cfg = result.configPda;
    const mint = result.mintKeypair;

    const pauser = Keypair.generate();
    await airdropSol(pauser.publicKey);
    await grantRole(cfg, pauser.publicKey, ROLE.Pauser);
    const [pauserRole] = findRolePda(cfg, pauser.publicKey, ROLE.Pauser);

    const recipient = Keypair.generate();
    await airdropSol(recipient.publicKey);
    const recipientAta = await createTokenAccount(mint.publicKey, recipient.publicKey);

    try {
      await coreProgram.methods
        .mintTo(new BN(1000))
        .accounts({
          minter: pauser.publicKey,
          config: cfg,
          roleAccount: pauserRole,
          mint: mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([pauser])
        .rpc();
      expect.fail("Pauser should not be able to mint");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("burner cannot seize", async () => {
    const treasury = Keypair.generate();
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    const cfg = result.configPda;
    const mint = result.mintKeypair;
    const hookResult = await initializeHook(mint.publicKey, cfg);

    const burner = Keypair.generate();
    await airdropSol(burner.publicKey);
    await grantRole(cfg, burner.publicKey, ROLE.Burner);
    const [burnerRole] = findRolePda(cfg, burner.publicKey, ROLE.Burner);

    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mint.publicKey, target.publicKey);
    const treasuryAta = await createTokenAccount(mint.publicKey, treasury.publicKey);

    // Blacklist target and pass blacklist PDA (seize always requires it on SSS-2)
    await blacklistWallet(hookResult.hookConfig, cfg, target.publicKey);
    const [targetBlacklistEntry] = findBlacklistEntryPda(hookResult.hookConfig, target.publicKey);

    try {
      await coreProgram.methods
        .seize(new BN(100))
        .accounts({
          seizer: burner.publicKey,
          config: cfg,
          roleAccount: burnerRole,
          mint: mint.publicKey,
          from: targetAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: targetBlacklistEntry, isWritable: false, isSigner: false }])
        .signers([burner])
        .rpc();
      expect.fail("Burner should not be able to seize");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("random user cannot transfer admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await coreProgram.methods
        .transferAdmin(random.publicKey)
        .accounts({ admin: random.publicKey, config: configPda })
        .signers([random])
        .rpc();
      expect.fail("Random user should not transfer admin");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("random user cannot accept admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: random.publicKey, config: configPda })
        .signers([random])
        .rpc();
      expect.fail("Random user should not accept admin");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("non-admin cannot increment allowance", async () => {
    const minter = Keypair.generate();
    await airdropSol(minter.publicKey);
    await grantRole(configPda, minter.publicKey, ROLE.Minter, 100);
    const [minterRole] = findRolePda(configPda, minter.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .incrementAllowance(new BN(99999))
        .accounts({ admin: minter.publicKey, config: configPda, roleAccount: minterRole })
        .signers([minter])
        .rpc();
      expect.fail("Non-admin should not increment allowance");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("compliance officer cannot pause (only Pauser role)", async () => {
    const co = Keypair.generate();
    await airdropSol(co.publicKey);
    await grantRole(configPda, co.publicKey, ROLE.ComplianceOfficer);
    const [coRole] = findRolePda(configPda, co.publicKey, ROLE.ComplianceOfficer);

    try {
      await coreProgram.methods
        .pause()
        .accounts({ authority: co.publicKey, config: configPda, roleAccount: coRole })
        .signers([co])
        .rpc();
      expect.fail("ComplianceOfficer should not be able to pause");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("seizer cannot blacklist", async () => {
    const treasury = Keypair.generate();
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    const cfg = result.configPda;
    const mint = result.mintKeypair;
    const hookResult = await initializeHook(mint.publicKey, cfg);

    const seizer = Keypair.generate();
    await airdropSol(seizer.publicKey);
    await grantRole(cfg, seizer.publicKey, ROLE.Seizer);

    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookResult.hookConfig, wallet);

    try {
      await coreProgram.methods
        .blacklist(wallet)
        .accounts({
          payer: seizer.publicKey, admin: seizer.publicKey, config: cfg,
          hookConfig: hookResult.hookConfig, blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([seizer])
        .rpc();
      expect.fail("Seizer should not blacklist");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("revoked minter cannot mint", async () => {
    const result = await createSSS1Mint();
    const cfg = result.configPda;
    const mint = result.mintKeypair;

    const minter = Keypair.generate();
    await airdropSol(minter.publicKey);
    const roleAcct = await grantRole(cfg, minter.publicKey, ROLE.Minter, 100_000);

    // Revoke
    await coreProgram.methods
      .revokeRole()
      .accounts({ admin: admin.publicKey, config: cfg, holder: minter.publicKey, roleAccount: roleAcct })
      .rpc();

    const recipient = Keypair.generate();
    await airdropSol(recipient.publicKey);
    const recipientAta = await createTokenAccount(mint.publicKey, recipient.publicKey);
    const [minterRole] = findRolePda(cfg, minter.publicKey, ROLE.Minter);

    try {
      await coreProgram.methods
        .mintTo(new BN(100))
        .accounts({
          minter: minter.publicKey, config: cfg, roleAccount: minterRole,
          mint: mint.publicKey, to: recipientAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Revoked minter should not mint");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("random user cannot initialize hook", async () => {
    const treasury = Keypair.generate();
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    const cfg = result.configPda;
    const mint = result.mintKeypair;

    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    const [hc] = findHookConfigPda(mint.publicKey);
    const [eaml] = findExtraAccountMetaListPda(mint.publicKey);

    try {
      await coreProgram.methods
        .initializeHook()
        .accounts({
          payer: random.publicKey, admin: random.publicKey, config: cfg,
          mint: mint.publicKey, hookConfig: hc, extraAccountMetaList: eaml,
          transferHookProgram: hookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([random])
        .rpc();
      expect.fail("Random user should not init hook");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("pauser cannot unblacklist", async () => {
    const treasury = Keypair.generate();
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    const cfg = result.configPda;
    const mint = result.mintKeypair;
    const hookResult = await initializeHook(mint.publicKey, cfg);

    const pauser = Keypair.generate();
    await airdropSol(pauser.publicKey);
    await grantRole(cfg, pauser.publicKey, ROLE.Pauser);

    // Admin blacklists first
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookResult.hookConfig, wallet);
    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey, admin: admin.publicKey, config: cfg,
        hookConfig: hookResult.hookConfig, blacklistEntry,
        transferHookProgram: hookProgram.programId, systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await coreProgram.methods
        .unblacklist(wallet)
        .accounts({
          payer: pauser.publicKey, admin: pauser.publicKey, config: cfg,
          hookConfig: hookResult.hookConfig, blacklistEntry,
          transferHookProgram: hookProgram.programId,
        })
        .signers([pauser])
        .rpc();
      expect.fail("Pauser should not unblacklist");
    } catch (error) {
      expect(error).to.exist;
    }
  });
});
