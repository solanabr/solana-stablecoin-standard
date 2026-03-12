import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import {
  PRESET_MINIMAL,
  StablecoinCtx,
  airdrop,
  initializeStablecoin,
  createAta,
  configureMinter,
  mintTokens,
  findMinterStatePda,
} from "./helpers";

describe("Multi-Minter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.sssCore as Program<SssCore>;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // ── Three Concurrent Minters ────────────────────────────────────────────

  describe("three concurrent minters with independent quotas", () => {
    let stablecoin: StablecoinCtx;
    let minterA: Keypair;
    let minterB: Keypair;
    let minterC: Keypair;
    let minterAState: PublicKey;
    let minterBState: PublicKey;
    let minterCState: PublicKey;
    let recipientAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minterA = Keypair.generate();
      minterB = Keypair.generate();
      minterC = Keypair.generate();
      await airdrop(provider, minterA.publicKey);
      await airdrop(provider, minterB.publicKey);
      await airdrop(provider, minterC.publicKey);

      minterAState = await configureMinter(
        program,
        stablecoin,
        minterA.publicKey,
        new anchor.BN(100_000_000) // 100 tokens
      );

      minterBState = await configureMinter(
        program,
        stablecoin,
        minterB.publicKey,
        new anchor.BN(200_000_000) // 200 tokens
      );

      minterCState = await configureMinter(
        program,
        stablecoin,
        minterC.publicKey,
        new anchor.BN(300_000_000) // 300 tokens
      );

      recipientAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        authority.publicKey
      );
    });

    it("all three minters have independent quota tracking", async () => {
      // Minter A mints 50
      await mintTokens(
        program,
        stablecoin,
        minterA,
        recipientAta,
        new anchor.BN(50_000_000),
        minterAState
      );

      // Minter B mints 150
      await mintTokens(
        program,
        stablecoin,
        minterB,
        recipientAta,
        new anchor.BN(150_000_000),
        minterBState
      );

      // Minter C mints 250
      await mintTokens(
        program,
        stablecoin,
        minterC,
        recipientAta,
        new anchor.BN(250_000_000),
        minterCState
      );

      // Verify each minter's minted_amount is independent
      const stateA = await program.account.minterState.fetch(minterAState);
      const stateB = await program.account.minterState.fetch(minterBState);
      const stateC = await program.account.minterState.fetch(minterCState);

      assert.ok(stateA.mintedAmount.eq(new anchor.BN(50_000_000)));
      assert.ok(stateB.mintedAmount.eq(new anchor.BN(150_000_000)));
      assert.ok(stateC.mintedAmount.eq(new anchor.BN(250_000_000)));
    });

    it("global total_minted reflects combined amount from all minters", async () => {
      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      // 50 + 150 + 250 = 450
      assert.ok(config.totalMinted.eq(new anchor.BN(450_000_000)));
    });

    it("each minter's remaining quota is correctly tracked", async () => {
      // Minter A: 100M quota, 50M used → 50M remaining
      await mintTokens(
        program,
        stablecoin,
        minterA,
        recipientAta,
        new anchor.BN(50_000_000),
        minterAState
      );

      // Now minter A is at quota limit
      try {
        await mintTokens(
          program,
          stablecoin,
          minterA,
          recipientAta,
          new anchor.BN(1),
          minterAState
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }

      // Minter B and C can still mint (B has 50M remaining, C has 50M remaining)
      await mintTokens(
        program,
        stablecoin,
        minterB,
        recipientAta,
        new anchor.BN(50_000_000),
        minterBState
      );

      await mintTokens(
        program,
        stablecoin,
        minterC,
        recipientAta,
        new anchor.BN(50_000_000),
        minterCState
      );
    });
  });

  // ── Remove and Re-add Minter ────────────────────────────────────────────

  describe("remove minter A, minter B can still mint", () => {
    let stablecoin: StablecoinCtx;
    let minterA: Keypair;
    let minterB: Keypair;
    let minterAState: PublicKey;
    let minterBState: PublicKey;
    let recipientAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minterA = Keypair.generate();
      minterB = Keypair.generate();
      await airdrop(provider, minterA.publicKey);
      await airdrop(provider, minterB.publicKey);

      minterAState = await configureMinter(
        program,
        stablecoin,
        minterA.publicKey,
        new anchor.BN(100_000_000)
      );

      minterBState = await configureMinter(
        program,
        stablecoin,
        minterB.publicKey,
        new anchor.BN(200_000_000)
      );

      recipientAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        authority.publicKey
      );
    });

    it("removing minter A does not affect minter B", async () => {
      // Remove minter A
      await program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: authority.publicKey,
          config: stablecoin.configPda,
          minterState: minterAState,
        })
        .rpc();

      // Minter A is disabled
      const stateA = await program.account.minterState.fetch(minterAState);
      assert.equal(stateA.enabled, false);

      // Minter B can still mint
      await mintTokens(
        program,
        stablecoin,
        minterB,
        recipientAta,
        new anchor.BN(100_000_000),
        minterBState
      );

      const stateB = await program.account.minterState.fetch(minterBState);
      assert.ok(stateB.mintedAmount.eq(new anchor.BN(100_000_000)));
      assert.equal(stateB.enabled, true);
    });

    it("disabled minter A cannot mint", async () => {
      const minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minterA.publicKey
      );

      try {
        await mintTokens(
          program,
          stablecoin,
          minterA,
          minterAta,
          new anchor.BN(1_000),
          minterAState
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "MinterDisabled");
      }
    });
  });

  // ── Remove and Re-add with Different Quota ──────────────────────────────

  describe("remove minter, re-add with different quota", () => {
    let stablecoin: StablecoinCtx;
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(100_000_000)
      );

      minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );

      // Mint some tokens
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(60_000_000),
        minterStatePda
      );
    });

    it("remove and re-add with new quota takes effect", async () => {
      // Remove minter
      await program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: authority.publicKey,
          config: stablecoin.configPda,
          minterState: minterStatePda,
        })
        .rpc();

      // Re-add with different quota
      await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(500_000_000) // much higher quota
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.equal(state.enabled, true);
      assert.ok(state.quota.eq(new anchor.BN(500_000_000)));
      // minted_amount should still reflect previous minting
      assert.ok(state.mintedAmount.eq(new anchor.BN(60_000_000)));
    });

    it("re-added minter can mint up to new quota minus already minted", async () => {
      // 500M quota - 60M already minted = 440M remaining
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(440_000_000),
        minterStatePda
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.mintedAmount.eq(new anchor.BN(500_000_000)));

      // Now at new quota limit
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          minterAta,
          new anchor.BN(1),
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }
    });
  });

  // ── Quota Does Not Reset After Burn ─────────────────────────────────────

  describe("minter quota does not reset after burn", () => {
    let stablecoin: StablecoinCtx;
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(100_000_000) // 100 tokens
      );

      minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );
    });

    it("burning tokens does NOT restore quota", async () => {
      // Mint full quota
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(100_000_000),
        minterStatePda
      );

      // Burn half the tokens
      await program.methods
        .burnTokens(new anchor.BN(50_000_000))
        .accountsPartial({
          burner: minter.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          tokenAccount: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // minted_amount should still be 100M (burn does not reduce it)
      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.mintedAmount.eq(new anchor.BN(100_000_000)));

      // Minting even 1 token should still fail
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          minterAta,
          new anchor.BN(1),
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }
    });
  });

  // ── Configure Same Minter Twice (Quota Update) ──────────────────────────

  describe("configure same minter twice updates quota", () => {
    let stablecoin: StablecoinCtx;
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(100_000_000)
      );

      minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );

      // Mint 60 tokens
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(60_000_000),
        minterStatePda
      );
    });

    it("reconfigure with higher quota preserves minted_amount", async () => {
      // Update quota to 200M
      await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(200_000_000)
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.quota.eq(new anchor.BN(200_000_000)));
      assert.ok(state.mintedAmount.eq(new anchor.BN(60_000_000)));
      assert.equal(state.enabled, true);

      // Can now mint up to 140M more (200M - 60M)
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(140_000_000),
        minterStatePda
      );

      const stateAfter = await program.account.minterState.fetch(minterStatePda);
      assert.ok(stateAfter.mintedAmount.eq(new anchor.BN(200_000_000)));
    });
  });

  // ── Configure Same Minter with Lower Quota ──────────────────────────────

  describe("configure same minter with lower quota (below minted_amount)", () => {
    let stablecoin: StablecoinCtx;
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(100_000_000)
      );

      minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );

      // Mint 80 tokens
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(80_000_000),
        minterStatePda
      );
    });

    it("reducing quota below current minted_amount succeeds", async () => {
      // Reduce quota to 50M (below the 80M already minted)
      await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(50_000_000)
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.quota.eq(new anchor.BN(50_000_000)));
      assert.ok(state.mintedAmount.eq(new anchor.BN(80_000_000)));
      assert.equal(state.enabled, true);
    });

    it("minter with reduced quota cannot mint any more", async () => {
      // 50M quota with 80M already minted → cannot mint anything
      // The on-chain check computes remaining = quota - minted_amount, which
      // underflows (checked_sub) when minted_amount > quota, yielding ArithmeticOverflow.
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          minterAta,
          new anchor.BN(1),
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        const msg = e.toString();
        assert.ok(
          msg.includes("QuotaExceeded") || msg.includes("ArithmeticOverflow"),
          `Expected QuotaExceeded or ArithmeticOverflow, got: ${msg}`
        );
      }
    });
  });
});
