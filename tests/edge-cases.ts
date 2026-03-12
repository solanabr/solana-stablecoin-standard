import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import { buildTestContext, createMintWithSss1, setupMinter, getOrCreateAta } from "./helpers/setup";
import { findBlacklistEntryPda } from "../sdk/core/src/pda";

describe("edge cases", () => {
  let ctx: Awaited<ReturnType<typeof buildTestContext>>;

  before(async () => {
    ctx = await buildTestContext();
  });

  it("rejects zero-amount mint", async () => {
    const { mint, statePda } = await createMintWithSss1(ctx);
    const minterRecord = await setupMinter(ctx, statePda, mint.publicKey, ctx.alice);
    const ata = await getOrCreateAta(ctx, mint.publicKey, ctx.bob.publicKey);

    await expect(
      ctx.program.methods
        .mintTokens(new anchor.BN(0))
        .accounts({
          minter: ctx.alice.publicKey,
          stablecoinState: statePda,
          minterRecord,
          mint: mint.publicKey,
          recipientTokenAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([ctx.alice])
        .rpc()
    ).to.be.rejectedWith(/ZeroAmount/);
  });

  it("rejects duplicate blacklist entry", async () => {
    const mint = anchor.web3.Keypair.generate();
    const [statePda] = (await import("../sdk/core/src/pda")).findStablecoinStatePda(mint.publicKey);

    await ctx.program.methods
      .initialize({
        name: "T",
        symbol: "T",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: false,
      })
      .accounts({
        authority: ctx.authority.publicKey,
        mint: mint.publicKey,
        stablecoinState: statePda,
        transferHookProgram: (await import("../sdk/core/src/constants")).SSS_TRANSFER_HOOK_PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    const target = anchor.web3.Keypair.generate();
    const [entry] = findBlacklistEntryPda(mint.publicKey, target.publicKey);

    await ctx.program.methods
      .addToBlacklist("first")
      .accounts({
        blacklister: ctx.authority.publicKey,
        stablecoinState: statePda,
        mint: mint.publicKey,
        target: target.publicKey,
        blacklistEntry: entry,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // second add should fail because the PDA already exists (init constraint)
    await expect(
      ctx.program.methods
        .addToBlacklist("second")
        .accounts({
          blacklister: ctx.authority.publicKey,
          stablecoinState: statePda,
          mint: mint.publicKey,
          target: target.publicKey,
          blacklistEntry: entry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc()
    ).to.be.rejected;
  });

  it("non-authority cannot transfer authority", async () => {
    const { statePda } = await createMintWithSss1(ctx);

    await expect(
      ctx.program.methods
        .transferAuthority(ctx.bob.publicKey)
        .accounts({
          authority: ctx.alice.publicKey,
          stablecoinState: statePda,
        })
        .signers([ctx.alice])
        .rpc()
    ).to.be.rejectedWith(/Unauthorized/);
  });
});
