import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
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
  airdropSol,
  initializeHook,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("e2e: seize flow", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let hookConfig: PublicKey;
  let treasuryKeypair: Keypair;
  let treasuryAta: PublicKey;
  let seizerKeypair: Keypair;
  let minterKeypair: Keypair;
  let complianceKeypair: Keypair;

  before(async () => {
    treasuryKeypair = Keypair.generate();
    seizerKeypair = Keypair.generate();
    minterKeypair = Keypair.generate();
    complianceKeypair = Keypair.generate();

    await Promise.all([
      airdropSol(treasuryKeypair.publicKey),
      airdropSol(seizerKeypair.publicKey),
      airdropSol(minterKeypair.publicKey),
      airdropSol(complianceKeypair.publicKey),
    ]);

    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;

    const hookResult = await initializeHook(mintKeypair.publicKey, configPda);
    hookConfig = hookResult.hookConfig;

    await grantRole(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    await grantRole(configPda, complianceKeypair.publicKey, ROLE.ComplianceOfficer);

    treasuryAta = await createTokenAccount(mintKeypair.publicKey, treasuryKeypair.publicKey);
  });

  it("full seize lifecycle: mint → blacklist → freeze → seize → verify treasury", async () => {
    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    // 1. Mint tokens to target
    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    await coreProgram.methods
      .mintTo(new BN(50_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount: minterRole,
        mint: mintKeypair.publicKey,
        to: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    // 2. Blacklist target
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, target.publicKey);
    await coreProgram.methods
      .blacklist(target.publicKey)
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

    const blEntry = await provider.connection.getAccountInfo(blacklistEntry);
    expect(blEntry).to.not.be.null;

    // 3. Freeze target account
    const [coRole] = findRolePda(configPda, complianceKeypair.publicKey, ROLE.ComplianceOfficer);
    await coreProgram.methods
      .freezeAccount()
      .accounts({
        authority: complianceKeypair.publicKey,
        config: configPda,
        roleAccount: coRole,
        mint: mintKeypair.publicKey,
        tokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([complianceKeypair])
      .rpc();

    // 4. Seize all tokens
    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    await coreProgram.methods
      .seize(new BN(50_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount: seizerRole,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizerKeypair])
      .rpc();

    // 5. Verify treasury received tokens
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryAta);
    expect(treasuryBalance.value.amount).to.equal("50000");

    // 6. Verify config counter
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalSeized.toNumber()).to.equal(50_000);
  });

  it("partial seize leaves remaining tokens frozen", async () => {
    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
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
      .signers([minterKeypair])
      .rpc();

    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    await coreProgram.methods
      .seize(new BN(3_000))
      .accounts({
        seizer: seizerKeypair.publicKey,
        config: configPda,
        roleAccount: seizerRole,
        mint: mintKeypair.publicKey,
        from: targetAta,
        treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizerKeypair])
      .rpc();

    const targetBalance = await provider.connection.getTokenAccountBalance(targetAta);
    expect(targetBalance.value.amount).to.equal("7000");
  });

  it("seize fails without Seizer role", async () => {
    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    const [fakeRole] = findRolePda(configPda, random.publicKey, ROLE.Seizer);

    try {
      await coreProgram.methods
        .seize(new BN(1_000))
        .accounts({
          seizer: random.publicKey,
          config: configPda,
          roleAccount: fakeRole,
          mint: mintKeypair.publicKey,
          from: targetAta,
          treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("multiple seizes accumulate in treasury", async () => {
    const target1 = Keypair.generate();
    const target2 = Keypair.generate();
    await airdropSol(target1.publicKey);
    await airdropSol(target2.publicKey);
    const ata1 = await createTokenAccount(mintKeypair.publicKey, target1.publicKey);
    const ata2 = await createTokenAccount(mintKeypair.publicKey, target2.publicKey);

    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);

    await coreProgram.methods
      .mintTo(new BN(5_000))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: ata1, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    await coreProgram.methods
      .mintTo(new BN(5_000))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: ata2, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);

    const treasuryBefore = await provider.connection.getTokenAccountBalance(treasuryAta);
    const beforeAmount = parseInt(treasuryBefore.value.amount);

    await coreProgram.methods
      .seize(new BN(2_000))
      .accounts({
        seizer: seizerKeypair.publicKey, config: configPda, roleAccount: seizerRole,
        mint: mintKeypair.publicKey, from: ata1, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizerKeypair])
      .rpc();

    await coreProgram.methods
      .seize(new BN(3_000))
      .accounts({
        seizer: seizerKeypair.publicKey, config: configPda, roleAccount: seizerRole,
        mint: mintKeypair.publicKey, from: ata2, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizerKeypair])
      .rpc();

    const treasuryAfter = await provider.connection.getTokenAccountBalance(treasuryAta);
    const afterAmount = parseInt(treasuryAfter.value.amount);
    expect(afterAmount - beforeAmount).to.equal(5_000);
  });

  it("seize entire balance empties account", async () => {
    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    await coreProgram.methods
      .mintTo(new BN(7_777))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: targetAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    await coreProgram.methods
      .seize(new BN(7_777))
      .accounts({
        seizer: seizerKeypair.publicKey, config: configPda, roleAccount: seizerRole,
        mint: mintKeypair.publicKey, from: targetAta, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([seizerKeypair])
      .rpc();

    const targetBalance = await provider.connection.getTokenAccountBalance(targetAta);
    expect(targetBalance.value.amount).to.equal("0");
  });

  it("seize exceeding balance fails", async () => {
    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    const [minterRole] = findRolePda(configPda, minterKeypair.publicKey, ROLE.Minter);
    await coreProgram.methods
      .mintTo(new BN(100))
      .accounts({
        minter: minterKeypair.publicKey, config: configPda, roleAccount: minterRole,
        mint: mintKeypair.publicKey, to: targetAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    try {
      await coreProgram.methods
        .seize(new BN(99999))
        .accounts({
          seizer: seizerKeypair.publicKey, config: configPda, roleAccount: seizerRole,
          mint: mintKeypair.publicKey, from: targetAta, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([seizerKeypair])
        .rpc();
      expect.fail("Should fail - seize exceeds balance");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("seize zero amount fails", async () => {
    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    try {
      await coreProgram.methods
        .seize(new BN(0))
        .accounts({
          seizer: seizerKeypair.publicKey, config: configPda, roleAccount: seizerRole,
          mint: mintKeypair.publicKey, from: targetAta, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([seizerKeypair])
        .rpc();
      expect.fail("Should fail - zero seize");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("seize when paused fails", async () => {
    await coreProgram.methods
      .pause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();

    const target = Keypair.generate();
    await airdropSol(target.publicKey);
    const targetAta = await createTokenAccount(mintKeypair.publicKey, target.publicKey);

    const [seizerRole] = findRolePda(configPda, seizerKeypair.publicKey, ROLE.Seizer);
    try {
      await coreProgram.methods
        .seize(new BN(100))
        .accounts({
          seizer: seizerKeypair.publicKey, config: configPda, roleAccount: seizerRole,
          mint: mintKeypair.publicKey, from: targetAta, treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([seizerKeypair])
        .rpc();
      expect.fail("Should fail when paused");
    } catch (error) {
      expect(error).to.exist;
    }

    await coreProgram.methods
      .unpause()
      .accounts({ authority: admin.publicKey, config: configPda, roleAccount: null })
      .rpc();
  });
});
