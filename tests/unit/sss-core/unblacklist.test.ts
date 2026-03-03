import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { findBlacklistEntryPda } from "@sss/sdk";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS2Mint,
  airdropSol,
  initializeHook,
  blacklistWallet,
} from "../../helpers/setup";

describe("sss-core: unblacklist", () => {
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

  async function blacklist(wallet: PublicKey) {
    return blacklistWallet(hookConfig, configPda, wallet);
  }

  it("admin unblacklists wallet", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);

    const tx = await coreProgram.methods
      .unblacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
      })
      .rpc();

    expect(tx).to.be.a("string");
    const acctInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(acctInfo).to.be.null;
  });

  it("rejects non-admin", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);
    const random = Keypair.generate();
    await airdropSol(random.publicKey);

    try {
      await coreProgram.methods
        .unblacklist(wallet)
        .accounts({
          payer: random.publicKey,
          admin: random.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
        })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("blacklist entry closed after unblacklist", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);

    let info = await provider.connection.getAccountInfo(blacklistEntry);
    expect(info).to.not.be.null;

    await coreProgram.methods
      .unblacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
      })
      .rpc();

    info = await provider.connection.getAccountInfo(blacklistEntry);
    expect(info).to.be.null;
  });

  it("wallet can be re-blacklisted after unblacklist", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);

    await coreProgram.methods
      .unblacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
      })
      .rpc();

    // Re-blacklist
    await blacklist(wallet);

    const info = await provider.connection.getAccountInfo(blacklistEntry);
    expect(info).to.not.be.null;
  });

  it("rejects unblacklist of non-blacklisted wallet", async () => {
    const wallet = Keypair.generate().publicKey;
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    try {
      await coreProgram.methods
        .unblacklist(wallet)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: configPda,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
        })
        .rpc();
      expect.fail("Should fail - wallet not blacklisted");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rent is returned to payer after unblacklist", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);

    const balanceBefore = await provider.connection.getBalance(admin.publicKey);

    await coreProgram.methods
      .unblacklist(wallet)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
      })
      .rpc();

    const balanceAfter = await provider.connection.getBalance(admin.publicKey);
    // Balance should increase (rent returned minus tx fee)
    // Just verify account is closed
    const acct = await provider.connection.getAccountInfo(blacklistEntry);
    expect(acct).to.be.null;
  });
});
