import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { findConfigPda, findHookConfigPda, findBlacklistEntryPda } from "@sss/sdk";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS2Mint,
  grantRole,
  airdropSol,
  initializeHook,
} from "../../helpers/setup";
import { ROLE } from "../../helpers/constants";

describe("sss-core: blacklist", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let hookConfig: PublicKey;
  let treasuryKeypair: Keypair;

  beforeEach(async () => {
    treasuryKeypair = Keypair.generate();
    await airdropSol(treasuryKeypair.publicKey);
    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;
    const hookResult = await initializeHook(mintKeypair.publicKey, configPda);
    hookConfig = hookResult.hookConfig;
  });

  it("admin blacklists wallet via CPI to transfer hook", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    const tx = await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    expect(tx).to.be.a("string");
    const acctInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(acctInfo).to.not.be.null;
    expect(acctInfo!.lamports).to.be.greaterThan(0);
  });

  it("rejects non-admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    try {
      await coreProgram.methods
        .blacklist(wallet)
        .accounts({
          payer: random.publicKey,
          admin: random.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("blacklist entry created on transfer hook program", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const acctInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(acctInfo).to.not.be.null;
    expect(acctInfo!.owner.toBase58()).to.equal(hookProgram.programId.toBase58());
  });

  it("multiple wallets can be blacklisted", async () => {
    const wallet1 = Keypair.generate().publicKey;
    const wallet2 = Keypair.generate().publicKey;
    const [entry1] = findBlacklistEntryPda(hookConfig, wallet1);
    const [entry2] = findBlacklistEntryPda(hookConfig, wallet2);

    await coreProgram.methods
      .blacklist(wallet1)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry: entry1,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await coreProgram.methods
      .blacklist(wallet2)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry: entry2,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const info1 = await provider.connection.getAccountInfo(entry1);
    const info2 = await provider.connection.getAccountInfo(entry2);
    expect(info1).to.not.be.null;
    expect(info2).to.not.be.null;
  });

  it("rejects duplicate blacklist", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await coreProgram.methods
        .blacklist(wallet)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("blacklist entry has correct wallet stored", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await hookProgram.account.blacklistEntry.fetch(blacklistEntry);
    expect(entry.wallet.toBase58()).to.equal(wallet.toBase58());
  });

  it("rejects blacklisting admin address", async () => {
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, admin.publicKey);

    try {
      await coreProgram.methods
        .blacklist(admin.publicKey)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed with CannotBlacklistProtectedAddress");
    } catch (err: any) {
      expect(err.toString()).to.include("CannotBlacklistProtectedAddress");
    }
  });

  it("rejects blacklisting treasury address", async () => {
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, treasuryKeypair.publicKey);

    try {
      await coreProgram.methods
        .blacklist(treasuryKeypair.publicKey)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed with CannotBlacklistProtectedAddress");
    } catch (err: any) {
      expect(err.toString()).to.include("CannotBlacklistProtectedAddress");
    }
  });

  it("rejects blacklisting pending_admin address", async () => {
    const pendingAdmin = Keypair.generate().publicKey;

    // Set pending admin first
    await coreProgram.methods
      .transferAdmin(pendingAdmin)
      .accounts({ admin: admin.publicKey, config: configPda })
      .rpc();

    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, pendingAdmin);

    try {
      await coreProgram.methods
        .blacklist(pendingAdmin)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed with CannotBlacklistProtectedAddress");
    } catch (err: any) {
      expect(err.toString()).to.include("CannotBlacklistProtectedAddress");
    }
  });
});
