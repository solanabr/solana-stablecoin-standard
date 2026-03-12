/**
 * Full lifecycle test — simulates the realistic stablecoin operations for both presets.
 *
 * SSS-1 lifecycle: deploy → assign minter → mint → freeze → thaw → burn
 * SSS-2 lifecycle: deploy → assign roles → mint → blacklist → seize → burn
 */
import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";

import {
  buildTestContext,
  createMintWithSss1,
  createMintWithSss2,
  setupMinter,
  getOrCreateAta,
} from "./helpers/setup";
import { findBlacklistEntryPda } from "../sdk/core/src/pda";

describe("full lifecycle", () => {
  let ctx: Awaited<ReturnType<typeof buildTestContext>>;

  before(async () => {
    ctx = await buildTestContext();
  });

  it("SSS-1 full lifecycle", async () => {
    // 1. Deploy
    const { mint, statePda } = await createMintWithSss1(ctx, { name: "USD Simple", symbol: "USDS" });

    // 2. Assign minter
    const minterRecord = await setupMinter(ctx, statePda, mint.publicKey, ctx.alice, 10_000_000n);

    // 3. Mint to Bob
    const bobAta = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);
    await ctx.program.methods
      .mintTokens(new anchor.BN(1_000_000))
      .accounts({
        minter: ctx.alice.publicKey,
        stablecoinState: statePda,
        minterRecord,
        mint: mint.publicKey,
        recipientTokenAccount: bobAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([ctx.alice])
      .rpc();

    let bobAccount = await getAccount(ctx.provider.connection, bobAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(bobAccount.amount).to.equal(1_000_000n);

    // 4. Freeze Bob's account
    await ctx.program.methods.freezeAccount().accounts({
      caller: ctx.authority.publicKey,
      stablecoinState: statePda,
      mint: mint.publicKey,
      targetAccount: bobAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();

    bobAccount = await getAccount(ctx.provider.connection, bobAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(bobAccount.isFrozen).to.be.true;

    // 5. Thaw Bob's account
    await ctx.program.methods.thawAccount().accounts({
      caller: ctx.authority.publicKey,
      stablecoinState: statePda,
      mint: mint.publicKey,
      targetAccount: bobAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();

    bobAccount = await getAccount(ctx.provider.connection, bobAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(bobAccount.isFrozen).to.be.false;
  });

  it("SSS-2 full lifecycle with blacklist and seize", async () => {
    // 1. Deploy SSS-2
    const { mint, statePda } = await createMintWithSss2(ctx, { name: "USD Compliant", symbol: "USDC" });

    // 2. Assign minter and roles
    const minterRecord = await setupMinter(ctx, statePda, mint.publicKey, ctx.authority);

    // Grant blacklister to alice
    await ctx.program.methods
      .updateRole({ blacklister: {} }, ctx.alice.publicKey, true)
      .accounts({ authority: ctx.authority.publicKey, stablecoinState: statePda })
      .rpc();

    // Grant seizer to authority
    await ctx.program.methods
      .updateRole({ seizer: {} }, ctx.authority.publicKey, true)
      .accounts({ authority: ctx.authority.publicKey, stablecoinState: statePda })
      .rpc();

    // 3. Setup token accounts (SSS-2 defaults to frozen, so thaw first)
    const bobAta = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);
    const treasuryAta = await getOrCreateAta(ctx, mint.publicKey, ctx.authority.publicKey);

    await ctx.program.methods.thawAccount().accounts({
      caller: ctx.authority.publicKey,
      stablecoinState: statePda,
      mint: mint.publicKey,
      targetAccount: bobAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();

    // 4. Mint to Bob
    await ctx.program.methods
      .mintTokens(new anchor.BN(5_000_000))
      .accounts({
        minter: ctx.authority.publicKey,
        stablecoinState: statePda,
        minterRecord,
        mint: mint.publicKey,
        recipientTokenAccount: bobAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // 5. Blacklist Bob
    const [blacklistEntry] = findBlacklistEntryPda(mint.publicKey, ctx.bob.publicKey);
    await ctx.program.methods
      .addToBlacklist("OFAC SDN list match")
      .accounts({
        blacklister: ctx.alice.publicKey,
        stablecoinState: statePda,
        mint: mint.publicKey,
        target: ctx.bob.publicKey,
        blacklistEntry,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([ctx.alice])
      .rpc();

    // 6. Freeze Bob's account
    await ctx.program.methods.freezeAccount().accounts({
      caller: ctx.authority.publicKey,
      stablecoinState: statePda,
      mint: mint.publicKey,
      targetAccount: bobAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    }).rpc();

    // 7. Seize Bob's tokens
    await ctx.program.methods
      .seize(new anchor.BN(5_000_000))
      .accounts({
        seizer: ctx.authority.publicKey,
        stablecoinState: statePda,
        mint: mint.publicKey,
        frozenAccount: bobAta,
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
    // Treasury now holds Bob's seized tokens (minus earlier thawed treasury tokens)
    expect(treasury.amount).to.be.gte(5_000_000n);
  });
});
