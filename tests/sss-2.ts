import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { expect } from "chai";

import {
  setupStablecoin,
  setupMinter,
  createTokenAccount,
  airdrop,
  TestContext,
  ROLES_SEED,
  MINTER_SEED,
  BLACKLIST_SEED,
} from "./helpers";

describe("SSS-2: Compliant Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program;
  let ctx: TestContext;
  let targetKeypair: Keypair;
  let targetAta: PublicKey;
  let treasuryKeypair: Keypair;
  let treasuryAta: PublicKey;

  before(async () => {
    ctx = await setupStablecoin(program, provider, {
      name: "Compliant USD",
      symbol: "CUSD",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
    });

    targetKeypair = Keypair.generate();
    await airdrop(provider, targetKeypair.publicKey);
    targetAta = await createTokenAccount(
      provider,
      ctx.mint.publicKey,
      targetKeypair.publicKey
    );

    treasuryKeypair = Keypair.generate();
    await airdrop(provider, treasuryKeypair.publicKey);
    treasuryAta = await createTokenAccount(
      provider,
      ctx.mint.publicKey,
      treasuryKeypair.publicKey
    );

    // Setup minter and mint some tokens to the target
    await setupMinter(ctx, ctx.authority, 0);

    const [minterRoles] = PublicKey.findProgramAddressSync(
      [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
      program.programId
    );
    const [minterConfig] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .mint(new anchor.BN(5_000_000))
      .accounts({
        minter: ctx.authority.publicKey,
        stablecoinConfig: ctx.configPDA,
        minterRoles,
        minterConfig,
        mint: ctx.mint.publicKey,
        recipientTokenAccount: targetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([ctx.authority])
      .rpc();
  });

  describe("Initialize SSS-2", () => {
    it("should have compliance features enabled", async () => {
      const config = await program.account.stablecoinConfig.fetch(ctx.configPDA);
      expect(config.enablePermanentDelegate).to.be.true;
      expect(config.enableTransferHook).to.be.true;
    });
  });

  describe("Blacklist", () => {
    it("should add address to blacklist", async () => {
      const [blacklistPDA] = PublicKey.findProgramAddressSync(
        [BLACKLIST_SEED, ctx.configPDA.toBuffer(), targetKeypair.publicKey.toBuffer()],
        program.programId
      );

      const [blacklisterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .addToBlacklist(targetKeypair.publicKey, "OFAC match")
        .accounts({
          blacklister: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          blacklisterRoles,
          blacklistEntry: blacklistPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistPDA);
      expect(entry.account.toBase58()).to.equal(targetKeypair.publicKey.toBase58());
      expect(entry.reason).to.equal("OFAC match");
    });

    it("should remove address from blacklist", async () => {
      const [blacklistPDA] = PublicKey.findProgramAddressSync(
        [BLACKLIST_SEED, ctx.configPDA.toBuffer(), targetKeypair.publicKey.toBuffer()],
        program.programId
      );

      const [blacklisterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .removeFromBlacklist(targetKeypair.publicKey)
        .accounts({
          blacklister: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          blacklisterRoles,
          blacklistEntry: blacklistPDA,
        })
        .signers([ctx.authority])
        .rpc();

      // Verify the account is closed
      const account = await provider.connection.getAccountInfo(blacklistPDA);
      expect(account).to.be.null;
    });
  });

  describe("Seize", () => {
    it("should seize tokens from an account using permanent delegate", async () => {
      const [seizerRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      const targetAccountBefore = await getAccount(
        provider.connection,
        targetAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const initialAmount = Number(targetAccountBefore.amount);
      expect(initialAmount).to.be.greaterThan(0);

      await program.methods
        .seize()
        .accounts({
          seizer: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          seizerRoles,
          mint: ctx.mint.publicKey,
          fromTokenAccount: targetAta,
          toTokenAccount: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([ctx.authority])
        .rpc();

      const targetAccountAfter = await getAccount(
        provider.connection,
        targetAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(targetAccountAfter.amount)).to.equal(0);

      const treasuryAccount = await getAccount(
        provider.connection,
        treasuryAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(treasuryAccount.amount)).to.equal(initialAmount);
    });
  });

  describe("SSS-2 on SSS-1 should fail", () => {
    let sss1Ctx: TestContext;

    before(async () => {
      sss1Ctx = await setupStablecoin(program, provider, {
        name: "Simple USD",
        symbol: "SUSD",
        enablePermanentDelegate: false,
        enableTransferHook: false,
      });
    });

    it("should reject blacklist on SSS-1 stablecoin", async () => {
      const dummyTarget = Keypair.generate();
      const [blacklistPDA] = PublicKey.findProgramAddressSync(
        [BLACKLIST_SEED, sss1Ctx.configPDA.toBuffer(), dummyTarget.publicKey.toBuffer()],
        program.programId
      );

      const [blacklisterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, sss1Ctx.configPDA.toBuffer(), sss1Ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .addToBlacklist(dummyTarget.publicKey, "test")
          .accounts({
            blacklister: sss1Ctx.authority.publicKey,
            stablecoinConfig: sss1Ctx.configPDA,
            blacklisterRoles,
            blacklistEntry: blacklistPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([sss1Ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("ComplianceNotEnabled");
      }
    });
  });
});
