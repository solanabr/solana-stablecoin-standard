import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import {
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  blacklistWallet,
} from "../../helpers/setup";
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
} from "../../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../../helpers/constants";

describe("sss-core: seize", () => {
  let mintKeypair: Keypair;
  let configPda: PublicKey;
  let hookConfig: PublicKey;
  let treasuryKeypair: Keypair;
  let treasuryAta: PublicKey;
  let targetKeypair: Keypair;
  let targetAta: PublicKey;
  let seizerKeypair: Keypair;
  let minterKeypair: Keypair;

  beforeEach(async () => {
    treasuryKeypair = Keypair.generate();
    targetKeypair = Keypair.generate();
    seizerKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();

    await airdropSol(seizerKeypair.publicKey);
    await airdropSol(minterKeypair.publicKey);
    await airdropSol(treasuryKeypair.publicKey);
    await airdropSol(targetKeypair.publicKey);

    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;

    const [hc] = findHookConfigPda(mintKeypair.publicKey);
    hookConfig = hc;

    await initializeHook(mintKeypair.publicKey, configPda);
    await grantRole(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);

    // Create treasury ATA and target ATA
    treasuryAta = await createTokenAccount(mintKeypair.publicKey, treasuryKeypair.publicKey);
    targetAta = await createTokenAccount(mintKeypair.publicKey, targetKeypair.publicKey);

    // Mint tokens to target (SSS-2 requires blacklist PDA as remainingAccounts)
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    const [targetBlacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);
    await coreProgram.methods
      .mintTo(new BN(10_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRole,
        mint: mintKeypair.publicKey,
        to: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: targetBlacklistEntry, isWritable: false, isSigner: false }])
      .signers([minterKeypair])
      .rpc();
  });

  it("seizer can seize tokens (thaw -> burn -> freeze -> mint to treasury)", async () => {
    const [roleAccount] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    // Must blacklist target before seizing
    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    const tx = await coreProgram.methods
      .seize(new BN(5_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .signers([seizerKeypair])
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("rejects non-seizer", async () => {
    const randomUser = Keypair.generate();
    await airdropSol(randomUser.publicKey);
    const [roleAccount] = findRolePda(configPda, randomUser.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    // Blacklist target (seize always requires it on-chain)
    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    try {
      await coreProgram.methods
        .seize(new BN(1_000))
        .accounts({
          seizer: randomUser.publicKey,
          config: configPda,
          roleAccount,
          mint: mintKeypair.publicKey,
          from: targetAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
        .signers([randomUser])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects zero amount", async () => {
    const [roleAccount] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    // Blacklist target (seize always requires it on-chain)
    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    try {
      await coreProgram.methods
        .seize(new BN(0))
        .accounts({
          seizer: seizerKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintKeypair.publicKey,
          from: targetAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
        .signers([seizerKeypair])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects when paused", async () => {
    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();

    const [roleAccount] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    // Blacklist target (seize always requires it on-chain)
    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    try {
      await coreProgram.methods
        .seize(new BN(1_000))
        .accounts({
          seizer: seizerKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintKeypair.publicKey,
          from: targetAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
        .signers([seizerKeypair])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("updates totalSeized counter", async () => {
    const [roleAccount] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    // Must blacklist target before seizing
    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    await coreProgram.methods
      .seize(new BN(3_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .signers([seizerKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalSeized.toNumber()).to.equal(3_000);
  });

  it("seize partial amount", async () => {
    const [roleAccount] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    await coreProgram.methods
      .seize(new BN(2_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .signers([seizerKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalSeized.toNumber()).to.equal(2_000);
  });

  it("multiple seizes accumulate totalSeized", async () => {
    const [roleAccount] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    await coreProgram.methods
      .seize(new BN(1_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .signers([seizerKeypair])
      .rpc();

    await coreProgram.methods
      .seize(new BN(2_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .signers([seizerKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalSeized.toNumber()).to.equal(3_000);
  });

  it("requires Seizer role specifically", async () => {
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, targetKeypair.publicKey);

    await blacklistWallet(hookConfig, configPda, targetKeypair.publicKey);

    try {
      await coreProgram.methods
        .seize(new BN(1_000))
        .accounts({
          seizer: minterKeypair.publicKey,
          config: configPda,
          roleAccount: minterRole,
          mint: mintKeypair.publicKey,
          from: targetAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });
});
