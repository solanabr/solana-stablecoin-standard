import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import {
  buildTestContext,
  createMintWithSss2,
  setupMinter,
  getOrCreateAta,
} from "./helpers/setup";
import { findBlacklistEntryPda, findStablecoinStatePda } from "../sdk/core/src/pda";
import { SSS_TRANSFER_HOOK_PROGRAM_ID } from "../sdk/core/src/constants";

describe("sss-2: Compliant Stablecoin", () => {
  let ctx: Awaited<ReturnType<typeof buildTestContext>>;

  before(async () => {
    ctx = await buildTestContext();
  });

  describe("initialize", () => {
    it("creates a compliant stablecoin with SSS-2 preset", async () => {
      const { mint, statePda } = await createMintWithSss2(ctx, {
        name: "Compliant USD",
        symbol: "CUSD",
      });

      const state = await ctx.program.account.stablecoinState.fetch(statePda);
      expect(state.preset).to.equal(2);
      expect(state.enableTransferHook).to.be.true;
      expect(state.enablePermanentDelegate).to.be.true;
      expect(state.defaultAccountFrozen).to.be.true;
    });

    it("rejects compliance operations on SSS-1 stablecoin", async () => {
      // Initialize SSS-1 first
      const mint = anchor.web3.Keypair.generate();
      const [statePda] = findStablecoinStatePda(mint.publicKey);

      await ctx.program.methods
        .initialize({
          name: "Simple",
          symbol: "SIMP",
          uri: "",
          decimals: 6,
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
        .rpc();

      const [blacklistEntry] = findBlacklistEntryPda(mint.publicKey, ctx.alice.publicKey);
      await expect(
        ctx.program.methods
          .addToBlacklist("test")
          .accounts({
            blacklister: ctx.authority.publicKey,
            stablecoinState: statePda,
            mint: mint.publicKey,
            target: ctx.alice.publicKey,
            blacklistEntry,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc()
      ).to.be.rejectedWith(/ComplianceNotEnabled/);
    });
  });

  describe("blacklist", () => {
    let mint: anchor.web3.Keypair;
    let statePda: anchor.web3.PublicKey;

    before(async () => {
      ({ mint, statePda } = await createMintWithSss2(ctx));
    });

    it("adds an address to the blacklist", async () => {
      const target = anchor.web3.Keypair.generate();
      const [entry] = findBlacklistEntryPda(mint.publicKey, target.publicKey);

      await ctx.program.methods
        .addToBlacklist("OFAC match")
        .accounts({
          blacklister: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          target: target.publicKey,
          blacklistEntry: entry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const entryData = await ctx.program.account.blacklistEntry.fetch(entry);
      expect(entryData.reason).to.equal("OFAC match");
      expect(entryData.address.toBase58()).to.equal(target.publicKey.toBase58());
    });

    it("removes an address from the blacklist", async () => {
      const target = anchor.web3.Keypair.generate();
      const [entry] = findBlacklistEntryPda(mint.publicKey, target.publicKey);

      await ctx.program.methods
        .addToBlacklist("sanctions")
        .accounts({
          blacklister: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          target: target.publicKey,
          blacklistEntry: entry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await ctx.program.methods
        .removeFromBlacklist()
        .accounts({
          blacklister: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          target: target.publicKey,
          blacklistEntry: entry,
        })
        .rpc();

      const info = await ctx.provider.connection.getAccountInfo(entry);
      expect(info).to.be.null; // account closed (rent reclaimed)
    });

    it("rejects blacklisting by non-blacklister", async () => {
      const target = anchor.web3.Keypair.generate();
      const [entry] = findBlacklistEntryPda(mint.publicKey, target.publicKey);

      await expect(
        ctx.program.methods
          .addToBlacklist("test")
          .accounts({
            blacklister: ctx.alice.publicKey,
            stablecoinState: statePda,
            mint: mint.publicKey,
            target: target.publicKey,
            blacklistEntry: entry,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([ctx.alice])
          .rpc()
      ).to.be.rejectedWith(/Unauthorized/);
    });
  });

  describe("seize", () => {
    let mint: anchor.web3.Keypair;
    let statePda: anchor.web3.PublicKey;
    let victimAta: anchor.web3.PublicKey;
    let treasuryAta: anchor.web3.PublicKey;
    let minterRecord: anchor.web3.PublicKey;

    before(async () => {
      ({ mint, statePda } = await createMintWithSss2(ctx));

      // Setup minter and mint tokens to victim
      minterRecord = await setupMinter(ctx, statePda, mint.publicKey, ctx.authority);
      victimAta = await getOrCreateAta(ctx, mint.publicKey, ctx.alice.publicKey);
      treasuryAta = await getOrCreateAta(ctx, mint.publicKey, ctx.authority.publicKey);

      // Thaw first (SSS-2 defaults to frozen)
      await ctx.program.methods.thawAccount().accounts({
        caller: ctx.authority.publicKey,
        stablecoinState: statePda,
        mint: mint.publicKey,
        targetAccount: victimAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      }).rpc();

      // Mint tokens to victim
      await ctx.program.methods
        .mintTokens(new anchor.BN(1_000_000))
        .accounts({
          minter: ctx.authority.publicKey,
          stablecoinState: statePda,
          minterRecord,
          mint: mint.publicKey,
          recipientTokenAccount: victimAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Re-freeze for seize
      await ctx.program.methods.freezeAccount().accounts({
        caller: ctx.authority.publicKey,
        stablecoinState: statePda,
        mint: mint.publicKey,
        targetAccount: victimAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      }).rpc();
    });

    it("seizes tokens from a frozen account", async () => {
      await ctx.program.methods
        .seize(new anchor.BN(1_000_000))
        .accounts({
          seizer: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          frozenAccount: victimAta,
          treasuryAccount: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      const treasury = await getAccount(
        ctx.provider.connection,
        treasuryAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(treasury.amount).to.be.gte(1_000_000n);
    });

    it("rejects seize from unfrozen account", async () => {
      const unfrozenAta = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);
      // Thaw bob's account first
      try {
        await ctx.program.methods.thawAccount().accounts({
          caller: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          targetAccount: unfrozenAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        }).rpc();
      } catch { /* already thawed */ }

      await expect(
        ctx.program.methods
          .seize(new anchor.BN(1))
          .accounts({
            seizer: ctx.authority.publicKey,
            stablecoinState: statePda,
            mint: mint.publicKey,
            frozenAccount: unfrozenAta,
            treasuryAccount: treasuryAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc()
      ).to.be.rejectedWith(/AccountNotFrozen/);
    });
  });

  describe("role management", () => {
    let mint: anchor.web3.Keypair;
    let statePda: anchor.web3.PublicKey;

    before(async () => {
      ({ mint, statePda } = await createMintWithSss2(ctx));
    });

    it("grants blacklister role", async () => {
      await ctx.program.methods
        .updateRole({ blacklister: {} }, ctx.alice.publicKey, true)
        .accounts({
          authority: ctx.authority.publicKey,
          stablecoinState: statePda,
        })
        .rpc();

      const state = await ctx.program.account.stablecoinState.fetch(statePda);
      const hasRole = (state.blacklisters as anchor.web3.PublicKey[])
        .some((k) => k.toBase58() === ctx.alice.publicKey.toBase58());
      expect(hasRole).to.be.true;
    });

    it("blacklister can blacklist addresses", async () => {
      const target = anchor.web3.Keypair.generate();
      const [entry] = findBlacklistEntryPda(mint.publicKey, target.publicKey);

      await ctx.program.methods
        .addToBlacklist("Verified by alice")
        .accounts({
          blacklister: ctx.alice.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          target: target.publicKey,
          blacklistEntry: entry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([ctx.alice])
        .rpc();

      const data = await ctx.program.account.blacklistEntry.fetch(entry);
      expect(data.reason).to.equal("Verified by alice");
    });
  });
});
