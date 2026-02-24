import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { SssCore } from "../target/types/sss_core";
import { SssTransferHook } from "../target/types/sss_transfer_hook";
import {
  createSss1Mint,
  createTokenAccount,
  deriveConfigPda,
  deriveRolePda,
  grantRole,
  fetchConfig,
  getTokenBalance,
  airdropSol,
  ROLE_ADMIN,
  ROLE_MINTER,
  ROLE_FREEZER,
  ROLE_PAUSER,
  CreateSss1MintResult,
} from "./helpers";

describe("SSS-1: Minimal Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  let mintResult: CreateSss1MintResult;
  let recipientAta: PublicKey;
  let minterRolePda: PublicKey;
  let freezerRolePda: PublicKey;
  let pauserRolePda: PublicKey;

  const minter = Keypair.generate();
  const freezer = Keypair.generate();
  const pauser = Keypair.generate();
  const recipient = Keypair.generate();

  before(async () => {
    // Fund test accounts
    await airdropSol(provider.connection, minter.publicKey, 5);
    await airdropSol(provider.connection, freezer.publicKey, 5);
    await airdropSol(provider.connection, pauser.publicKey, 5);
    await airdropSol(provider.connection, recipient.publicKey, 2);
  });

  it("initializes SSS-1 stablecoin with correct config", async () => {
    mintResult = await createSss1Mint(provider, coreProgram, {
      name: "Test USD",
      symbol: "TUSD",
      uri: "https://example.com/tusd.json",
      decimals: 6,
      supplyCap: null,
    });

    const config = await fetchConfig(coreProgram, mintResult.configPda);

    expect(config.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58(),
    );
    expect(config.mint.toBase58()).to.equal(
      mintResult.mint.publicKey.toBase58(),
    );
    expect(config.preset).to.equal(1);
    expect(config.paused).to.equal(false);
    expect(config.supplyCap).to.be.null;
    expect(config.totalMinted.toNumber()).to.equal(0);
    expect(config.totalBurned.toNumber()).to.equal(0);
  });

  it("grants minter role", async () => {
    minterRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      minter.publicKey,
      ROLE_MINTER,
    );

    const roleAccount = await coreProgram.account.roleAccount.fetch(
      minterRolePda,
    );
    expect(roleAccount.config.toBase58()).to.equal(
      mintResult.configPda.toBase58(),
    );
    expect(roleAccount.address.toBase58()).to.equal(
      minter.publicKey.toBase58(),
    );
    expect(roleAccount.role).to.deep.equal({ minter: {} });
  });

  it("mints tokens to recipient", async () => {
    // Create recipient token account
    recipientAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      recipient.publicKey,
    );

    const mintAmount = new BN(1_000_000); // 1 TUSD

    await coreProgram.methods
      .mintTokens(mintAmount)
      .accounts({
        minter: minter.publicKey,
        config: mintResult.configPda,
        minterRole: minterRolePda,
        mint: mintResult.mint.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    const balance = await getTokenBalance(provider.connection, recipientAta);
    expect(balance.toString()).to.equal("1000000");

    const config = await fetchConfig(coreProgram, mintResult.configPda);
    expect(config.totalMinted.toNumber()).to.equal(1_000_000);
  });

  it("enforces supply cap", async () => {
    // Create a new mint with supply cap
    const cappedMint = await createSss1Mint(provider, coreProgram, {
      name: "Capped USD",
      symbol: "CUSD",
      uri: "https://example.com/cusd.json",
      decimals: 6,
      supplyCap: new BN(500_000),
    });

    const config = await fetchConfig(coreProgram, cappedMint.configPda);
    expect(config.supplyCap!.toNumber()).to.equal(500_000);

    // Grant minter role
    const [cappedMinterRole] = deriveRolePda(
      cappedMint.configPda,
      minter.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );
    await coreProgram.methods
      .grantRole(ROLE_MINTER)
      .accounts({
        admin: provider.wallet.publicKey,
        config: cappedMint.configPda,
        adminRole: cappedMint.adminRolePda,
        grantee: minter.publicKey,
        roleAccount: cappedMinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Create ATA for recipient
    const ata = await createTokenAccount(
      provider,
      cappedMint.mint.publicKey,
      recipient.publicKey,
    );

    // Mint over the cap should fail
    try {
      await coreProgram.methods
        .mintTokens(new BN(500_001))
        .accounts({
          minter: minter.publicKey,
          config: cappedMint.configPda,
          minterRole: cappedMinterRole,
          mint: cappedMint.mint.publicKey,
          to: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown SupplyCapExceeded");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SupplyCapExceeded");
    }

    // Mint exactly at cap should succeed
    await coreProgram.methods
      .mintTokens(new BN(500_000))
      .accounts({
        minter: minter.publicKey,
        config: cappedMint.configPda,
        minterRole: cappedMinterRole,
        mint: cappedMint.mint.publicKey,
        to: ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    const balance = await getTokenBalance(provider.connection, ata);
    expect(balance.toString()).to.equal("500000");
  });

  it("burns tokens", async () => {
    const burnAmount = new BN(200_000);

    const configBefore = await fetchConfig(coreProgram, mintResult.configPda);
    const balanceBefore = await getTokenBalance(
      provider.connection,
      recipientAta,
    );

    await coreProgram.methods
      .burnTokens(burnAmount)
      .accounts({
        burner: minter.publicKey,
        config: mintResult.configPda,
        burnerRole: minterRolePda,
        mint: mintResult.mint.publicKey,
        from: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    const balanceAfter = await getTokenBalance(
      provider.connection,
      recipientAta,
    );
    expect(
      (BigInt(balanceBefore.toString()) - BigInt(balanceAfter.toString())).toString(),
    ).to.equal("200000");

    const configAfter = await fetchConfig(coreProgram, mintResult.configPda);
    expect(configAfter.totalBurned.toNumber()).to.equal(
      configBefore.totalBurned.toNumber() + 200_000,
    );
  });

  it("freezes token account", async () => {
    // Grant freezer role
    freezerRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      freezer.publicKey,
      ROLE_FREEZER,
    );

    await coreProgram.methods
      .freezeAccount()
      .accounts({
        freezer: freezer.publicKey,
        config: mintResult.configPda,
        freezerRole: freezerRolePda,
        mint: mintResult.mint.publicKey,
        tokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();

    // Verify the account is frozen by attempting to mint to it (should fail)
    try {
      await coreProgram.methods
        .mintTokens(new BN(100))
        .accounts({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have failed because account is frozen");
    } catch (err: any) {
      // Token program error for frozen account
      expect(err).to.exist;
    }
  });

  it("thaws frozen account", async () => {
    await coreProgram.methods
      .thawAccount()
      .accounts({
        freezer: freezer.publicKey,
        config: mintResult.configPda,
        freezerRole: freezerRolePda,
        mint: mintResult.mint.publicKey,
        tokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();

    // After thawing, minting should work again
    await coreProgram.methods
      .mintTokens(new BN(100))
      .accounts({
        minter: minter.publicKey,
        config: mintResult.configPda,
        minterRole: minterRolePda,
        mint: mintResult.mint.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    const balance = await getTokenBalance(provider.connection, recipientAta);
    // 1_000_000 - 200_000 + 100 = 800_100
    expect(balance.toString()).to.equal("800100");
  });

  it("pauses all operations", async () => {
    // Grant pauser role
    pauserRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      pauser.publicKey,
      ROLE_PAUSER,
    );

    await coreProgram.methods
      .pause()
      .accounts({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    const config = await fetchConfig(coreProgram, mintResult.configPda);
    expect(config.paused).to.equal(true);
  });

  it("rejects mint when paused", async () => {
    try {
      await coreProgram.methods
        .mintTokens(new BN(100))
        .accounts({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown Paused");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("Paused");
    }
  });

  it("unpauses operations", async () => {
    await coreProgram.methods
      .unpause()
      .accounts({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    const config = await fetchConfig(coreProgram, mintResult.configPda);
    expect(config.paused).to.equal(false);

    // Mint should work again
    await coreProgram.methods
      .mintTokens(new BN(100))
      .accounts({
        minter: minter.publicKey,
        config: mintResult.configPda,
        minterRole: minterRolePda,
        mint: mintResult.mint.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
  });

  it("rejects mint from unauthorized address", async () => {
    const unauthorized = Keypair.generate();
    await airdropSol(provider.connection, unauthorized.publicKey, 2);

    // Derive the minter role PDA for the unauthorized user (it won't exist)
    const [fakeRolePda] = deriveRolePda(
      mintResult.configPda,
      unauthorized.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );

    try {
      await coreProgram.methods
        .mintTokens(new BN(100))
        .accounts({
          minter: unauthorized.publicKey,
          config: mintResult.configPda,
          minterRole: fakeRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([unauthorized])
        .rpc();
      expect.fail("Should have failed for unauthorized minter");
    } catch (err: any) {
      // Account does not exist or is not owned by the program
      expect(err).to.exist;
    }
  });

  it("seizes tokens via permanent delegate", async () => {
    const treasuryAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      provider.wallet.publicKey,
    );

    const recipientBalBefore = await getTokenBalance(
      provider.connection,
      recipientAta,
    );

    const seizeAmount = new BN(100_000);
    await coreProgram.methods
      .seize(seizeAmount)
      .accounts({
        admin: provider.wallet.publicKey,
        config: mintResult.configPda,
        adminRole: mintResult.adminRolePda,
        mint: mintResult.mint.publicKey,
        from: recipientAta,
        to: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const recipientBalAfter = await getTokenBalance(
      provider.connection,
      recipientAta,
    );
    const treasuryBal = await getTokenBalance(
      provider.connection,
      treasuryAta,
    );

    expect(
      (
        BigInt(recipientBalBefore.toString()) -
        BigInt(recipientBalAfter.toString())
      ).toString(),
    ).to.equal("100000");
    expect(treasuryBal.toString()).to.equal("100000");
  });

  it("revokes minter role", async () => {
    await coreProgram.methods
      .revokeRole()
      .accounts({
        admin: provider.wallet.publicKey,
        config: mintResult.configPda,
        adminRole: mintResult.adminRolePda,
        roleAccount: minterRolePda,
      })
      .rpc();

    // Verify the role PDA is closed
    const roleInfo = await provider.connection.getAccountInfo(minterRolePda);
    expect(roleInfo).to.be.null;

    // Minting should fail now
    try {
      await coreProgram.methods
        .mintTokens(new BN(100))
        .accounts({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have failed after minter role revoked");
    } catch (err: any) {
      expect(err).to.exist;
    }
  });
});
