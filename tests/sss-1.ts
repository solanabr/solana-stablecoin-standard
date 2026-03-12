import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";

import {
  buildTestContext,
  createMintWithSss1,
  setupMinter,
  getOrCreateAta,
} from "./helpers/setup";
import { findMinterRecordPda, findStablecoinStatePda } from "../sdk/core/src/pda";

describe("sss-1: Minimal Stablecoin", () => {
  let ctx: Awaited<ReturnType<typeof buildTestContext>>;

  before(async () => {
    ctx = await buildTestContext();
  });

  describe("initialize", () => {
    it("creates a stablecoin with SSS-1 preset", async () => {
      const { mint, statePda } = await createMintWithSss1(ctx, {
        name: "Test USD",
        symbol: "TUSD",
        decimals: 6,
      });

      const state = await ctx.program.account.stablecoinState.fetch(statePda);
      expect(state.name).to.equal("Test USD");
      expect(state.symbol).to.equal("TUSD");
      expect(state.decimals).to.equal(6);
      expect(state.preset).to.equal(1);
      expect(state.paused).to.be.false;
      expect(state.enableTransferHook).to.be.false;
      expect(state.enablePermanentDelegate).to.be.false;
    });

    it("rejects invalid decimals (>9)", async () => {
      const mint = anchor.web3.Keypair.generate();
      const [statePda] = findStablecoinStatePda(mint.publicKey);

      await expect(
        ctx.program.methods
          .initialize({
            name: "Bad",
            symbol: "BAD",
            uri: "",
            decimals: 10,
            enablePermanentDelegate: false,
            enableTransferHook: false,
            defaultAccountFrozen: false,
          })
          .accounts({
            authority: ctx.authority.publicKey,
            mint: mint.publicKey,
            stablecoinState: statePda,
            transferHookProgram: null,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([mint])
          .rpc()
      ).to.be.rejected;
    });
  });

  describe("mint_tokens", () => {
    let mint: anchor.web3.Keypair;
    let statePda: anchor.web3.PublicKey;
    let minterRecord: anchor.web3.PublicKey;

    before(async () => {
      ({ mint, statePda } = await createMintWithSss1(ctx));
      minterRecord = await setupMinter(ctx, statePda, mint.publicKey, ctx.alice, 1_000_000_000n);
    });

    it("mints tokens to a recipient", async () => {
      const recipientAta = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);

      await ctx.program.methods
        .mintTokens(new anchor.BN(500_000))
        .accounts({
          minter: ctx.alice.publicKey,
          stablecoinState: statePda,
          minterRecord,
          mint: mint.publicKey,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([ctx.alice])
        .rpc();

      const account = await getAccount(
        ctx.provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.amount).to.equal(500_000n);
    });

    it("rejects mint when cap is exceeded", async () => {
      const capMinter = anchor.web3.Keypair.generate();
      const capRecord = await setupMinter(ctx, statePda, mint.publicKey, capMinter, 100n);
      const recipientAta = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);

      await expect(
        ctx.program.methods
          .mintTokens(new anchor.BN(200))
          .accounts({
            minter: capMinter.publicKey,
            stablecoinState: statePda,
            minterRecord: capRecord,
            mint: mint.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([capMinter])
          .rpc()
      ).to.be.rejectedWith(/MintCapExceeded/);
    });

    it("rejects mint when paused", async () => {
      // Pause
      await ctx.program.methods.pause().accounts({
        caller: ctx.authority.publicKey,
        stablecoinState: statePda,
      }).rpc();

      const recipientAta = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);
      await expect(
        ctx.program.methods
          .mintTokens(new anchor.BN(1_000))
          .accounts({
            minter: ctx.alice.publicKey,
            stablecoinState: statePda,
            minterRecord,
            mint: mint.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([ctx.alice])
          .rpc()
      ).to.be.rejectedWith(/Paused/);

      // Unpause for remaining tests
      await ctx.program.methods.unpause().accounts({
        caller: ctx.authority.publicKey,
        stablecoinState: statePda,
      }).rpc();
    });
  });

  describe("freeze / thaw", () => {
    let mint: anchor.web3.Keypair;
    let statePda: anchor.web3.PublicKey;
    let targetAta: anchor.web3.PublicKey;

    before(async () => {
      ({ mint, statePda } = await createMintWithSss1(ctx));
      targetAta = await getOrCreateAta(ctx, mint.publicKey, ctx.alice.publicKey);
    });

    it("freezes a token account", async () => {
      await ctx.program.methods
        .freezeAccount()
        .accounts({
          caller: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          targetAccount: targetAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const account = await getAccount(
        ctx.provider.connection,
        targetAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.be.true;
    });

    it("thaws a frozen account", async () => {
      await ctx.program.methods
        .thawAccount()
        .accounts({
          caller: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          targetAccount: targetAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const account = await getAccount(
        ctx.provider.connection,
        targetAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.be.false;
    });
  });

  describe("authority transfer", () => {
    it("transfers authority to a new key", async () => {
      const { statePda } = await createMintWithSss1(ctx);
      const newAuth = anchor.web3.Keypair.generate();

      await ctx.program.methods
        .transferAuthority(newAuth.publicKey)
        .accounts({
          authority: ctx.authority.publicKey,
          stablecoinState: statePda,
        })
        .rpc();

      const state = await ctx.program.account.stablecoinState.fetch(statePda);
      expect(state.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
    });
  });
});
