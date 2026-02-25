import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { SssCore } from "../target/types/sss_core";
import {
  createSss1Mint,
  createTokenAccount,
  deriveRolePda,
  grantRole,
  fetchConfig,
  getTokenBalance,
  airdropSol,
  ROLE_ADMIN,
  ROLE_MINTER,
  ROLE_FREEZER,
  ROLE_PAUSER,
  ROLE_BURNER,
  ROLE_SEIZER,
  CreateSss1MintResult,
} from "./helpers";

describe("Edge Cases", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  let mintResult: CreateSss1MintResult;
  let recipientAta: PublicKey;
  let treasuryAta: PublicKey;
  let minterRolePda: PublicKey;
  let burnerRolePda: PublicKey;
  let freezerRolePda: PublicKey;
  let pauserRolePda: PublicKey;
  let seizerRolePda: PublicKey;

  const minter = Keypair.generate();
  const freezer = Keypair.generate();
  const pauser = Keypair.generate();
  const recipient = Keypair.generate();

  before(async () => {
    await airdropSol(provider.connection, minter.publicKey, 5);
    await airdropSol(provider.connection, freezer.publicKey, 5);
    await airdropSol(provider.connection, pauser.publicKey, 5);
    await airdropSol(provider.connection, recipient.publicKey, 2);

    mintResult = await createSss1Mint(provider, coreProgram, {
      name: "Edge Test USD",
      symbol: "EUSD",
      uri: "https://example.com/eusd.json",
      decimals: 6,
      supplyCap: new BN(10_000_000),
    });

    minterRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      minter.publicKey,
      ROLE_MINTER,
    );
    burnerRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      minter.publicKey,
      ROLE_BURNER,
    );
    freezerRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      freezer.publicKey,
      ROLE_FREEZER,
    );
    pauserRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      pauser.publicKey,
      ROLE_PAUSER,
    );
    seizerRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      provider.wallet.publicKey,
      ROLE_SEIZER,
    );

    recipientAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      recipient.publicKey,
    );
    treasuryAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      provider.wallet.publicKey,
    );
  });

  it("rejects zero amount mint", async () => {
    try {
      await coreProgram.methods
        .mintTokens(new BN(0))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown ZeroAmount");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ZeroAmount");
    }
  });

  it("rejects zero amount burn", async () => {
    // First mint some tokens so we have something to burn
    await coreProgram.methods
      .mintTokens(new BN(1_000_000))
      .accountsPartial({
        minter: minter.publicKey,
        config: mintResult.configPda,
        minterRole: minterRolePda,
        mint: mintResult.mint.publicKey,
        to: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    try {
      await coreProgram.methods
        .burnTokens(new BN(0))
        .accountsPartial({
          burner: minter.publicKey,
          config: mintResult.configPda,
          burnerRole: burnerRolePda,
          mint: mintResult.mint.publicKey,
          from: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown ZeroAmount");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ZeroAmount");
    }
  });

  it("rejects zero amount seize", async () => {
    try {
      await coreProgram.methods
        .seize(new BN(0))
        .accountsPartial({
          seizer: provider.wallet.publicKey,
          config: mintResult.configPda,
          seizerRole: seizerRolePda,
          mint: mintResult.mint.publicKey,
          from: recipientAta,
          to: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown ZeroAmount");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("ZeroAmount");
    }
  });

  it("allows mint at exactly supply cap", async () => {
    // Create a new mint with known supply cap for clean testing
    const cappedMint = await createSss1Mint(provider, coreProgram, {
      name: "Cap Exact",
      symbol: "CEXACT",
      uri: "https://example.com/cexact.json",
      decimals: 6,
      supplyCap: new BN(1_000_000),
    });

    const [cappedMinterRole] = deriveRolePda(
      cappedMint.configPda,
      minter.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );
    await coreProgram.methods
      .grantRole(ROLE_MINTER)
      .accountsPartial({
        admin: provider.wallet.publicKey,
        config: cappedMint.configPda,
        adminRole: cappedMint.adminRolePda,
        grantee: minter.publicKey,
        roleAccount: cappedMinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const ata = await createTokenAccount(
      provider,
      cappedMint.mint.publicKey,
      recipient.publicKey,
    );

    // Mint exactly at cap
    await coreProgram.methods
      .mintTokens(new BN(1_000_000))
      .accountsPartial({
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
    expect(balance.toString()).to.equal("1000000");

    const config = await fetchConfig(coreProgram, cappedMint.configPda);
    expect(config.totalMinted.toNumber()).to.equal(1_000_000);
  });

  it("rejects mint one over supply cap", async () => {
    // Create another capped mint
    const cappedMint = await createSss1Mint(provider, coreProgram, {
      name: "Cap Over",
      symbol: "COVER",
      uri: "https://example.com/cover.json",
      decimals: 6,
      supplyCap: new BN(500_000),
    });

    const [cappedMinterRole] = deriveRolePda(
      cappedMint.configPda,
      minter.publicKey,
      ROLE_MINTER,
      coreProgram.programId,
    );
    await coreProgram.methods
      .grantRole(ROLE_MINTER)
      .accountsPartial({
        admin: provider.wallet.publicKey,
        config: cappedMint.configPda,
        adminRole: cappedMint.adminRolePda,
        grantee: minter.publicKey,
        roleAccount: cappedMinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const ata = await createTokenAccount(
      provider,
      cappedMint.mint.publicKey,
      recipient.publicKey,
    );

    try {
      await coreProgram.methods
        .mintTokens(new BN(500_001))
        .accountsPartial({
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
  });

  it("rejects double pause", async () => {
    await coreProgram.methods
      .pause()
      .accountsPartial({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    try {
      await coreProgram.methods
        .pause()
        .accountsPartial({
          pauser: pauser.publicKey,
          config: mintResult.configPda,
          pauserRole: pauserRolePda,
        })
        .signers([pauser])
        .rpc();
      expect.fail("Should have thrown Paused (already paused)");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("Paused");
    }
  });

  it("rejects double unpause", async () => {
    // Unpause first
    await coreProgram.methods
      .unpause()
      .accountsPartial({
        pauser: pauser.publicKey,
        config: mintResult.configPda,
        pauserRole: pauserRolePda,
      })
      .signers([pauser])
      .rpc();

    // Try to unpause again
    try {
      await coreProgram.methods
        .unpause()
        .accountsPartial({
          pauser: pauser.publicKey,
          config: mintResult.configPda,
          pauserRole: pauserRolePda,
        })
        .signers([pauser])
        .rpc();
      expect.fail("Should have thrown NotPaused");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("NotPaused");
    }
  });

  it("update supply cap to new value", async () => {
    const config = await fetchConfig(coreProgram, mintResult.configPda);
    const currentSupply =
      config.totalMinted.toNumber() - config.totalBurned.toNumber();

    // Update cap to something above current supply
    const newCap = new BN(currentSupply + 5_000_000);
    await coreProgram.methods
      .updateSupplyCap(newCap)
      .accountsPartial({
        admin: provider.wallet.publicKey,
        config: mintResult.configPda,
        adminRole: mintResult.adminRolePda,
      })
      .rpc();

    const updatedConfig = await fetchConfig(coreProgram, mintResult.configPda);
    expect(updatedConfig.supplyCap!.toNumber()).to.equal(
      currentSupply + 5_000_000,
    );
  });

  it("rejects supply cap below current supply", async () => {
    // Current supply is > 0, so setting cap to 0 should fail
    try {
      await coreProgram.methods
        .updateSupplyCap(new BN(0))
        .accountsPartial({
          admin: provider.wallet.publicKey,
          config: mintResult.configPda,
          adminRole: mintResult.adminRolePda,
        })
        .rpc();
      expect.fail("Should have thrown InvalidSupplyCap");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidSupplyCap");
    }
  });

  it("removes supply cap (set to None)", async () => {
    await coreProgram.methods
      .updateSupplyCap(null)
      .accountsPartial({
        admin: provider.wallet.publicKey,
        config: mintResult.configPda,
        adminRole: mintResult.adminRolePda,
      })
      .rpc();

    const config = await fetchConfig(coreProgram, mintResult.configPda);
    expect(config.supplyCap).to.be.null;
  });
});
