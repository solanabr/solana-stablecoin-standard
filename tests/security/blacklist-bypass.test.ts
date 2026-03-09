import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import {
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
  airdropSol,
  initializeHook,
  blacklistWallet,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("security: blacklist bypass attempts", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let hookConfig: PublicKey;
  let treasuryKeypair: Keypair;
  let minterKeypair: Keypair;

  beforeEach(async () => {
    treasuryKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    await airdropSol(treasuryKeypair.publicKey);
    await airdropSol(minterKeypair.publicKey);

    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;
    const hookResult = await initializeHook(mintKeypair.publicKey, configPda);
    hookConfig = hookResult.hookConfig;

    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
  });

  async function blacklist(wallet: PublicKey) {
    return blacklistWallet(hookConfig, configPda, wallet);
  }

  it("blacklisted sender cannot transfer tokens", async () => {
    const sender = Keypair.generate();
    const receiver = Keypair.generate();
    await airdropSol(sender.publicKey);
    await airdropSol(receiver.publicKey);

    const senderAta = await createTokenAccount(mintKeypair.publicKey, sender.publicKey);
    const receiverAta = await createTokenAccount(mintKeypair.publicKey, receiver.publicKey);

    // Mint to sender
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    const [senderBlEntry] = findBlacklistEntryPda(hookConfig, sender.publicKey);
    await coreProgram.methods
      .mintTo(new BN(1_000))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: senderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: senderBlEntry, isWritable: false, isSigner: false }])
      .signers([minterKeypair])
      .rpc();

    // Blacklist sender
    await blacklist(sender.publicKey);

    // Verify blacklist entry exists
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, sender.publicKey);
    const entryInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(entryInfo).to.not.be.null;
  });

  it("blacklisted receiver cannot receive transfers", async () => {
    const sender = Keypair.generate();
    const receiver = Keypair.generate();
    await airdropSol(sender.publicKey);
    await airdropSol(receiver.publicKey);

    const senderAta = await createTokenAccount(mintKeypair.publicKey, sender.publicKey);
    const receiverAta = await createTokenAccount(mintKeypair.publicKey, receiver.publicKey);

    // Mint to sender
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    const [senderBlEntry2] = findBlacklistEntryPda(hookConfig, sender.publicKey);
    await coreProgram.methods
      .mintTo(new BN(1_000))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: senderAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: senderBlEntry2, isWritable: false, isSigner: false }])
      .signers([minterKeypair])
      .rpc();

    // Blacklist receiver
    await blacklist(receiver.publicKey);

    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, receiver.publicKey);
    const entryInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(entryInfo).to.not.be.null;
  });

  it("unblacklisted wallet can transfer again", async () => {
    const wallet = Keypair.generate();
    await airdropSol(wallet.publicKey);

    const walletAta = await createTokenAccount(mintKeypair.publicKey, wallet.publicKey);

    // Blacklist then unblacklist
    const blacklistEntry = await blacklist(wallet.publicKey);

    await coreProgram.methods
      .unblacklist(wallet.publicKey)
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        hookConfig,
        blacklistEntry,
        transferHookProgram: hookProgram.programId,
      })
      .rpc();

    // Verify blacklist entry is gone
    const entryInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(entryInfo).to.be.null;
  });

  it("non-admin cannot blacklist", async () => {
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
      expect.fail("Non-admin should not blacklist");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("non-admin cannot unblacklist", async () => {
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
      expect.fail("Non-admin should not unblacklist");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("blacklist entry is on transfer hook program (not core)", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);

    const entryInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(entryInfo).to.not.be.null;
    expect(entryInfo!.owner.toBase58()).to.equal(hookProgram.programId.toBase58());
  });

  it("cannot blacklist same wallet twice", async () => {
    const wallet = Keypair.generate().publicKey;
    await blacklist(wallet);

    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

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
      expect.fail("Should not blacklist same wallet twice");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("re-blacklist after unblacklist works", async () => {
    const wallet = Keypair.generate().publicKey;
    const blacklistEntry = await blacklist(wallet);

    // Unblacklist
    await coreProgram.methods
      .unblacklist(wallet)
      .accounts({
        payer: admin.publicKey, admin: admin.publicKey, config: configPda,
        hookConfig, blacklistEntry, transferHookProgram: hookProgram.programId,
      })
      .rpc();

    // Re-blacklist
    await coreProgram.methods
      .blacklist(wallet)
      .accounts({
        payer: admin.publicKey, admin: admin.publicKey, config: configPda,
        hookConfig, blacklistEntry,
        transferHookProgram: hookProgram.programId, systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entryInfo = await provider.connection.getAccountInfo(blacklistEntry);
    expect(entryInfo).to.not.be.null;
  });
});
