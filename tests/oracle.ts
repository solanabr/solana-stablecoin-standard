import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

// Workaround: @coral-xyz/anchor is CJS. Named exports may not resolve in ESM context.
// Use namespace import and destructure at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BN = (anchor as any).default?.BN ?? (anchor as any).BN;

describe("Oracle: pricing module via mock Switchboard feed", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oracleProgram = anchor.workspace.OraclePricing as any;
  const mint = Keypair.generate();

  const FEED_DECIMALS = 6;
  const STALE_SECS = 3600;

  let feedKp: Keypair;
  let priceFeedConfigPda: PublicKey;

  before(async () => {
    [priceFeedConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("price_feed"), mint.publicKey.toBuffer()],
      oracleProgram.programId
    );
  });

  it("initializes a price feed config", async () => {
    feedKp = Keypair.generate();
    const space = 256;
    const lamports = await connection.getMinimumBalanceForRentExemption(space);

    const createTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: feedKp.publicKey,
        lamports,
        space,
        programId: SystemProgram.programId,
      })
    );
    await anchor.web3.sendAndConfirmTransaction(connection, createTx, [authority, feedKp], {
      commitment: "confirmed",
    });

    await oracleProgram.methods
      .initializeFeed("BRL/USD", FEED_DECIMALS, new BN(STALE_SECS))
      .accounts({
        authority: authority.publicKey,
        mint: mint.publicKey,
        feed: feedKp.publicKey,
        priceFeedConfig: priceFeedConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const config = await oracleProgram.account.priceFeedConfig.fetch(priceFeedConfigPda);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(config.mint.toBase58()).to.equal(mint.publicKey.toBase58());
    expect(config.feed.toBase58()).to.equal(feedKp.publicKey.toBase58());
    expect(config.pairName).to.equal("BRL/USD");
    expect(config.feedDecimals).to.equal(FEED_DECIMALS);
  });

  it("updates the feed config", async () => {
    const newFeed = Keypair.generate();
    const space = 256;
    const lamports = await connection.getMinimumBalanceForRentExemption(space);

    const createTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: newFeed.publicKey,
        lamports,
        space,
        programId: SystemProgram.programId,
      })
    );
    await anchor.web3.sendAndConfirmTransaction(connection, createTx, [authority, newFeed], {
      commitment: "confirmed",
    });

    await oracleProgram.methods
      .updateFeed("EUR/USD", 8, new BN(7200))
      .accounts({
        authority: authority.publicKey,
        priceFeedConfig: priceFeedConfigPda,
        feed: newFeed.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });

    const config = await oracleProgram.account.priceFeedConfig.fetch(priceFeedConfigPda);
    expect(config.pairName).to.equal("EUR/USD");
    expect(config.feedDecimals).to.equal(8);
    expect(config.staleAfterSecs.toNumber()).to.equal(7200);
    expect(config.feed.toBase58()).to.equal(newFeed.publicKey.toBase58());

    // Restore original feed for next tests
    await oracleProgram.methods
      .updateFeed("BRL/USD", FEED_DECIMALS, new BN(STALE_SECS))
      .accounts({
        authority: authority.publicKey,
        priceFeedConfig: priceFeedConfigPda,
        feed: feedKp.publicKey,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  });

  it("get_price rejects zero-data feed (NonPositivePrice)", async () => {
    try {
      await oracleProgram.methods
        .getPrice()
        .accounts({
          priceFeedConfig: priceFeedConfigPda,
          feed: feedKp.publicKey,
        })
        .rpc({ commitment: "confirmed" });
      expect.fail("should have thrown");
    } catch (err: unknown) {
      const msg = String((err as Error).message);
      // Anchor wraps custom errors — check for error code 6002 (NonPositivePrice)
      expect(msg).to.satisfy(
        (m: string) => m.includes("NonPositivePrice") || m.includes("6002") || m.includes("Custom"),
        `Expected NonPositivePrice error, got: ${msg}`
      );
    }
  });

  it("rejects unauthorized feed updates", async () => {
    const imposter = Keypair.generate();
    const sig = await connection.requestAirdrop(imposter.publicKey, 1e9);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

    try {
      await oracleProgram.methods
        .updateFeed(null, null, null)
        .accounts({
          authority: imposter.publicKey,
          priceFeedConfig: priceFeedConfigPda,
          feed: feedKp.publicKey,
        })
        .signers([imposter])
        .rpc({ commitment: "confirmed" });
      expect.fail("should have thrown");
    } catch (err: unknown) {
      const msg = String((err as Error).message);
      expect(msg).to.satisfy(
        (m: string) => m.includes("ConstraintHasOne") || m.includes("has_one") || m.includes("2001") || m.includes("constraint"),
        `Expected has_one constraint error, got: ${msg}`
      );
    }
  });
});
