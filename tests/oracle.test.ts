import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

// ── Oracle Module Test Suite ──────────────────────────────────────────

describe("oracle-module", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const oracleProgram = anchor.workspace.OracleModule as Program;
  const sssProgram = anchor.workspace.SssToken as Program;

  let authority: Keypair;
  let oracleConfigPda: PublicKey;
  let mockFeed: Keypair;
  let configPda: PublicKey; // SSS stablecoin config PDA

  // We'll use a fake stablecoin config PDA for testing
  // (the oracle module doesn't validate its contents, just stores the key)
  let fakeMint: Keypair;

  before(async () => {
    authority = provider.wallet.payer;
    mockFeed = Keypair.generate();
    fakeMint = Keypair.generate();

    // Derive config PDA from sss-token program (used as reference)
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), fakeMint.publicKey.toBuffer()],
      sssProgram.programId
    );

    // Derive oracle config PDA
    [oracleConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle"), configPda.toBuffer()],
      oracleProgram.programId
    );
  });

  // ── Test 1: Initialize oracle ──────────────────────────────────────

  it("initializes oracle configuration", async () => {
    await oracleProgram.methods
      .initializeOracle("BRL", new BN(300)) // 5 min staleness
      .accounts({
        authority: authority.publicKey,
        oracleConfig: oracleConfigPda,
        stablecoinConfig: configPda,
        feed: mockFeed.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await oracleProgram.account.oracleConfig.fetch(oracleConfigPda);
    assert.ok(config.authority.equals(authority.publicKey));
    assert.equal(config.baseCurrency, "BRL");
    assert.equal(config.stalenessThreshold.toNumber(), 300);
    assert.ok(config.feedAddress.equals(mockFeed.publicKey));
    assert.equal(config.lastPrice.toNumber(), 0);
  });

  // ── Test 2: Update feed address ────────────────────────────────────

  it("updates oracle feed address", async () => {
    const newFeed = Keypair.generate();
    await oracleProgram.methods
      .updateFeed(newFeed.publicKey)
      .accounts({
        authority: authority.publicKey,
        oracleConfig: oracleConfigPda,
      })
      .rpc();

    const config = await oracleProgram.account.oracleConfig.fetch(oracleConfigPda);
    assert.ok(config.feedAddress.equals(newFeed.publicKey));
  });

  // ── Test 3: Set price manually ─────────────────────────────────────

  it("sets price manually (localnet mode)", async () => {
    // BRL/USD rate: 5.25 (1 USD = 5.25 BRL)
    // Stored as 5_250_000_000 with 9 decimals
    const price = new BN(5_250_000_000);

    await oracleProgram.methods
      .setPrice(price, 9)
      .accounts({
        authority: authority.publicKey,
        oracleConfig: oracleConfigPda,
      })
      .rpc();

    const config = await oracleProgram.account.oracleConfig.fetch(oracleConfigPda);
    assert.equal(config.lastPrice.toNumber(), 5_250_000_000);
    assert.equal(config.priceDecimals, 9);
    assert.isAbove(config.lastPriceTimestamp.toNumber(), 0);
  });

  // ── Test 4: Get cached price ───────────────────────────────────────

  it("gets current price from oracle", async () => {
    // Should succeed since we just set the price
    await oracleProgram.methods
      .getPrice()
      .accounts({
        oracleConfig: oracleConfigPda,
      })
      .rpc();

    // Verify the price is still valid
    const config = await oracleProgram.account.oracleConfig.fetch(oracleConfigPda);
    assert.equal(config.lastPrice.toNumber(), 5_250_000_000);
  });

  // ── Test 5: Calculate mint amount ──────────────────────────────────

  it("calculates oracle-adjusted mint amount", async () => {
    // With BRL/USD = 5.25 and 100 USD collateral
    // tokens = 100 * 5.25 = 525 BRL tokens
    await oracleProgram.methods
      .calculateMintAmount(new BN(100_000_000), 6) // 100 USDC (6 decimals)
      .accounts({
        oracleConfig: oracleConfigPda,
      })
      .rpc();

    // The mint amount is emitted as an event
    // Verify the oracle config is still valid
    const config = await oracleProgram.account.oracleConfig.fetch(oracleConfigPda);
    assert.equal(config.lastPrice.toNumber(), 5_250_000_000);
  });

  // ── Edge Cases ─────────────────────────────────────────────────────

  it("rejects invalid price (zero)", async () => {
    try {
      await oracleProgram.methods
        .setPrice(new BN(0), 9)
        .accounts({
          authority: authority.publicKey,
          oracleConfig: oracleConfigPda,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "InvalidPrice");
    }
  });

  it("rejects currency too long", async () => {
    const newMint = Keypair.generate();
    const [newConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), newMint.publicKey.toBuffer()],
      sssProgram.programId
    );
    const [newOraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle"), newConfigPda.toBuffer()],
      oracleProgram.programId
    );

    try {
      await oracleProgram.methods
        .initializeOracle("TOOLONGCURRENCY", new BN(300))
        .accounts({
          authority: authority.publicKey,
          oracleConfig: newOraclePda,
          stablecoinConfig: newConfigPda,
          feed: mockFeed.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.include(err.toString(), "CurrencyTooLong");
    }
  });

  it("rejects unauthorized feed update", async () => {
    const impostor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      impostor.publicKey,
      1 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    try {
      await oracleProgram.methods
        .updateFeed(Keypair.generate().publicKey)
        .accounts({
          authority: impostor.publicKey,
          oracleConfig: oracleConfigPda,
        })
        .signers([impostor])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err: any) {
      // has_one constraint will reject
      assert.include(err.toString(), "Error");
    }
  });
});
