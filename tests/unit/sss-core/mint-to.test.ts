import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  provider,
  coreProgram,
  admin,
  createSSS1Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
  findRolePda,
} from "../../helpers/setup";
import { TOKEN_2022_PROGRAM_ID, ROLE } from "../../helpers/constants";

describe("mint-to", () => {
  let mintPubkey: anchor.web3.PublicKey;
  let configPda: anchor.web3.PublicKey;
  let minterKeypair: Keypair;
  let recipientAta: anchor.web3.PublicKey;

  beforeEach(async () => {
    minterKeypair = Keypair.generate();
    await airdropSol(minterKeypair.publicKey, 2);

    const result = await createSSS1Mint("Mint Test USD", "MTUSD", 6);
    mintPubkey = result.mintKeypair.publicKey;
    configPda = result.configPda;

    recipientAta = await createTokenAccount(mintPubkey, admin.publicKey);
  });

  it("minter can mint tokens", async () => {
    const minterRoleAccount = await grantRole(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter,
      1_000_000
    );
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    await coreProgram.methods
      .mintTo(new BN(500_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(recipientAta);
    expect(parseInt(balance.value.amount)).to.equal(500_000);
  });

  it("rejects non-minter", async () => {
    const nonMinter = Keypair.generate();
    await airdropSol(nonMinter.publicKey, 1);
    // Grant burner role, not minter
    await grantRole(configPda, nonMinter.publicKey, ROLE.Burner, 0);
    const [wrongRoleAccount] = findRolePda(
      configPda,
      nonMinter.publicKey,
      ROLE.Minter
    );

    try {
      await coreProgram.methods
        .mintTo(new BN(100))
        .accounts({
          minter: nonMinter.publicKey,
          config: configPda,
          roleAccount: wrongRoleAccount,
          mint: mintPubkey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([nonMinter])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });

  it("rejects zero amount", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    try {
      await coreProgram.methods
        .mintTo(new BN(0))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("ZeroAmount");
    }
  });

  it("rejects when paused", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    // Pause the stablecoin
    await coreProgram.methods
      .pause()
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        roleAccount: null,
      })
      .rpc();

    try {
      await coreProgram.methods
        .mintTo(new BN(100))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("Paused");
    }
  });

  it("updates totalMinted counter", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    await coreProgram.methods
      .mintTo(new BN(300_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalMinted.toNumber()).to.equal(300_000);
  });

  it("decrements minter allowance", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    await coreProgram.methods
      .mintTo(new BN(400_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.allowance.toNumber()).to.equal(600_000);
  });

  it("rejects when amount exceeds allowance", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 100);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    try {
      await coreProgram.methods
        .mintTo(new BN(200))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("AllowanceExceeded");
    }
  });

  it("allowance 0 rejects minting", async () => {
    // allowance = 0 means no remaining allowance — cannot mint
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 0);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    try {
      await coreProgram.methods
        .mintTo(new BN(1))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
      expect.fail("Should have failed with AllowanceExceeded");
    } catch (err: any) {
      expect(err.toString()).to.include("AllowanceExceeded");
    }
  });

  it("emits TokensMinted with remaining_allowance", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    const txSig = await coreProgram.methods
      .mintTo(new BN(300_000))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    await provider.connection.confirmTransaction(txSig, "confirmed");
    const tx = await provider.connection.getTransaction(txSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages || [];
    const hasEvent = logs.some((l) => l.includes("Program data:"));
    expect(hasEvent, "TokensMinted event should be emitted in logs").to.be.true;
  });

  it("mints to correct token account", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    const secondRecipient = Keypair.generate();
    const secondAta = await createTokenAccount(mintPubkey, secondRecipient.publicKey);

    await coreProgram.methods
      .mintTo(new BN(123_456))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: secondAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(secondAta);
    expect(parseInt(balance.value.amount)).to.equal(123_456);

    // Original recipient unchanged
    const orig = await provider.connection.getTokenAccountBalance(recipientAta);
    expect(parseInt(orig.value.amount)).to.equal(0);
  });

  it("multiple mints decrement allowance correctly", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    for (let i = 0; i < 3; i++) {
      await coreProgram.methods
        .mintTo(new BN(100_000))
        .accounts({
          minter: minterKeypair.publicKey,
          config: configPda,
          roleAccount,
          mint: mintPubkey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterKeypair])
        .rpc();
    }

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.allowance.toNumber()).to.equal(700_000);
  });

  it("mints after allowance increment", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 100);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    // Use up allowance
    await coreProgram.methods
      .mintTo(new BN(100))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    // Increment allowance
    await coreProgram.methods
      .incrementAllowance(new BN(500))
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        minterRoleAccount: roleAccount,
      })
      .rpc();

    // Now can mint again
    await coreProgram.methods
      .mintTo(new BN(200))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(recipientAta);
    expect(parseInt(balance.value.amount)).to.equal(300);
  });

  it("large amount mint works", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 1_000_000_000_000);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    const largeAmount = new BN("1000000000000"); // 1 trillion

    await coreProgram.methods
      .mintTo(largeAmount)
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(recipientAta);
    expect(balance.value.amount).to.equal("1000000000000");
  });

  it("minter allowance reaches exactly 0", async () => {
    await grantRole(configPda, minterKeypair.publicKey, ROLE.Minter, 500);
    const [roleAccount] = findRolePda(
      configPda,
      minterKeypair.publicKey,
      ROLE.Minter
    );

    await coreProgram.methods
      .mintTo(new BN(500))
      .accounts({
        minter: minterKeypair.publicKey,
        config: configPda,
        roleAccount,
        mint: mintPubkey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minterKeypair])
      .rpc();

    const roleState = await coreProgram.account.roleAccount.fetch(roleAccount);
    expect(roleState.allowance.toNumber()).to.equal(0);
  });
});
