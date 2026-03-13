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
} from "./helpers";

describe("SSS-1: Minimal Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program;
  let ctx: TestContext;
  let recipientKeypair: Keypair;
  let recipientAta: PublicKey;

  before(async () => {
    ctx = await setupStablecoin(program, provider, {
      name: "Test USD",
      symbol: "TUSD",
      decimals: 6,
      supplyCap: 100_000_000,
      enablePermanentDelegate: false,
      enableTransferHook: false,
    });

    recipientKeypair = Keypair.generate();
    await airdrop(provider, recipientKeypair.publicKey);
    recipientAta = await createTokenAccount(
      provider,
      ctx.mint.publicKey,
      recipientKeypair.publicKey
    );
  });

  // ============ Initialize ============

  describe("Initialize", () => {
    it("should initialize stablecoin config correctly", async () => {
      const config = await program.account.stablecoinConfig.fetch(ctx.configPDA);
      expect(config.name).to.equal("Test USD");
      expect(config.symbol).to.equal("TUSD");
      expect(config.decimals).to.equal(6);
      expect(config.enablePermanentDelegate).to.be.false;
      expect(config.enableTransferHook).to.be.false;
      expect(config.paused).to.be.false;
      expect(Number(config.supplyCap)).to.equal(100_000_000);
    });

    it("should assign all roles to authority", async () => {
      const [rolesPDA] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );
      const roles = await program.account.roleAccount.fetch(rolesPDA);
      expect(roles.roles).to.equal(63);
      expect(roles.active).to.be.true;
    });

    it("should set pending_authority to None", async () => {
      const config = await program.account.stablecoinConfig.fetch(ctx.configPDA);
      expect(config.pendingAuthority).to.be.null;
    });

    it("should reject name that is too long", async () => {
      try {
        await setupStablecoin(program, provider, {
          name: "A".repeat(33),
          symbol: "X",
          enablePermanentDelegate: false,
          enableTransferHook: false,
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("NameTooLong");
      }
    });

    it("should reject symbol that is too long", async () => {
      try {
        await setupStablecoin(program, provider, {
          name: "Test",
          symbol: "X".repeat(11),
          enablePermanentDelegate: false,
          enableTransferHook: false,
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("SymbolTooLong");
      }
    });

    it("should reject invalid decimals > 9", async () => {
      try {
        await setupStablecoin(program, provider, {
          name: "Test",
          symbol: "TST",
          decimals: 10,
          enablePermanentDelegate: false,
          enableTransferHook: false,
        });
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidDecimals");
      }
    });
  });

  // ============ Mint ============

  describe("Mint", () => {
    it("should setup minter and mint tokens", async () => {
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
        .mint(new anchor.BN(1_000_000))
        .accounts({
          minter: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          minterRoles,
          minterConfig,
          mint: ctx.mint.publicKey,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([ctx.authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(Number(account.amount)).to.equal(1_000_000);
    });

    it("should track total minted", async () => {
      const config = await program.account.stablecoinConfig.fetch(ctx.configPDA);
      expect(Number(config.totalMinted)).to.equal(1_000_000);
    });

    it("should reject zero amount mint", async () => {
      const [minterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );
      const [minterConfig] = PublicKey.findProgramAddressSync(
        [MINTER_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .mint(new anchor.BN(0))
          .accounts({
            minter: ctx.authority.publicKey,
            stablecoinConfig: ctx.configPDA,
            minterRoles,
            minterConfig,
            mint: ctx.mint.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("ZeroAmount");
      }
    });

    it("should enforce supply cap", async () => {
      const [minterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );
      const [minterConfig] = PublicKey.findProgramAddressSync(
        [MINTER_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .mint(new anchor.BN(200_000_000))
          .accounts({
            minter: ctx.authority.publicKey,
            stablecoinConfig: ctx.configPDA,
            minterRoles,
            minterConfig,
            mint: ctx.mint.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown - exceeds supply cap");
      } catch (err: any) {
        expect(err.toString()).to.include("SupplyCapExceeded");
      }
    });

    it("should enforce minter quota", async () => {
      const quotaMinter = Keypair.generate();
      await airdrop(provider, quotaMinter.publicKey);
      await setupMinter(ctx, quotaMinter, 500);

      const quotaMinterAta = await createTokenAccount(
        provider,
        ctx.mint.publicKey,
        quotaMinter.publicKey
      );

      const [minterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), quotaMinter.publicKey.toBuffer()],
        program.programId
      );
      const [minterConfig] = PublicKey.findProgramAddressSync(
        [MINTER_SEED, ctx.configPDA.toBuffer(), quotaMinter.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .mint(new anchor.BN(1000))
          .accounts({
            minter: quotaMinter.publicKey,
            stablecoinConfig: ctx.configPDA,
            minterRoles,
            minterConfig,
            mint: ctx.mint.publicKey,
            recipientTokenAccount: quotaMinterAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([quotaMinter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("QuotaExceeded");
      }
    });

    it("should reject mint from unauthorized user", async () => {
      const randomUser = Keypair.generate();
      await airdrop(provider, randomUser.publicKey);

      const [minterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), randomUser.publicKey.toBuffer()],
        program.programId
      );
      const [minterConfig] = PublicKey.findProgramAddressSync(
        [MINTER_SEED, ctx.configPDA.toBuffer(), randomUser.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .mint(new anchor.BN(100))
          .accounts({
            minter: randomUser.publicKey,
            stablecoinConfig: ctx.configPDA,
            minterRoles,
            minterConfig,
            mint: ctx.mint.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("AccountNotInitialized");
      }
    });
  });

  // ============ Freeze / Thaw ============

  describe("Freeze / Thaw", () => {
    it("should freeze a token account", async () => {
      const [freezerRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .freezeAccount()
        .accounts({
          freezer: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          freezerRoles,
          mint: ctx.mint.publicKey,
          targetTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([ctx.authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.be.true;
    });

    it("should thaw a token account", async () => {
      const [freezerRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .thawAccount()
        .accounts({
          freezer: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          freezerRoles,
          mint: ctx.mint.publicKey,
          targetTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([ctx.authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.be.false;
    });
  });

  // ============ Pause / Unpause ============

  describe("Pause / Unpause", () => {
    it("should pause the stablecoin", async () => {
      const [pauserRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .pause()
        .accounts({
          pauser: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          pauserRoles,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(ctx.configPDA);
      expect(config.paused).to.be.true;
    });

    it("should reject double pause", async () => {
      const [pauserRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .pause()
          .accounts({
            pauser: ctx.authority.publicKey,
            stablecoinConfig: ctx.configPDA,
            pauserRoles,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }
    });

    it("should reject mint when paused", async () => {
      const [minterRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );
      const [minterConfig] = PublicKey.findProgramAddressSync(
        [MINTER_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .mint(new anchor.BN(100))
          .accounts({
            minter: ctx.authority.publicKey,
            stablecoinConfig: ctx.configPDA,
            minterRoles,
            minterConfig,
            mint: ctx.mint.publicKey,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }
    });

    it("should reject burn when paused", async () => {
      const burnerAta = await createTokenAccount(
        provider,
        ctx.mint.publicKey,
        ctx.authority.publicKey
      );

      const [burnerRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .burn(new anchor.BN(100))
          .accounts({
            burner: ctx.authority.publicKey,
            stablecoinConfig: ctx.configPDA,
            burnerRoles,
            mint: ctx.mint.publicKey,
            tokenAccount: burnerAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }
    });

    it("should unpause the stablecoin", async () => {
      const [pauserRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .unpause()
        .accounts({
          pauser: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          pauserRoles,
        })
        .signers([ctx.authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(ctx.configPDA);
      expect(config.paused).to.be.false;
    });

    it("should reject double unpause", async () => {
      const [pauserRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), ctx.authority.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .unpause()
          .accounts({
            pauser: ctx.authority.publicKey,
            stablecoinConfig: ctx.configPDA,
            pauserRoles,
          })
          .signers([ctx.authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("NotPaused");
      }
    });
  });

  // ============ Role Management ============

  describe("Role Management", () => {
    it("should grant and revoke roles", async () => {
      const newUser = Keypair.generate();
      await airdrop(provider, newUser.publicKey);

      const [userRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), newUser.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .updateRoles(newUser.publicKey, 2, true)
        .accounts({
          authority: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          targetRoles: userRoles,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();

      let roles = await program.account.roleAccount.fetch(userRoles);
      expect(roles.roles & 2).to.equal(2);
      expect(roles.active).to.be.true;

      await program.methods
        .updateRoles(newUser.publicKey, 2, false)
        .accounts({
          authority: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          targetRoles: userRoles,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();

      roles = await program.account.roleAccount.fetch(userRoles);
      expect(roles.roles & 2).to.equal(0);
    });

    it("should record audit fields (granted_by, last_modified)", async () => {
      const auditUser = Keypair.generate();
      await airdrop(provider, auditUser.publicKey);

      const [userRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), auditUser.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .updateRoles(auditUser.publicKey, 1, true)
        .accounts({
          authority: ctx.authority.publicKey,
          stablecoinConfig: ctx.configPDA,
          targetRoles: userRoles,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.authority])
        .rpc();

      const roles = await program.account.roleAccount.fetch(userRoles);
      expect(roles.grantedBy.toBase58()).to.equal(ctx.authority.publicKey.toBase58());
      expect(Number(roles.lastModified)).to.be.greaterThan(0);
    });

    it("should reject role update from non-authority", async () => {
      const randomUser = Keypair.generate();
      await airdrop(provider, randomUser.publicKey);

      const target = Keypair.generate();
      const [targetRoles] = PublicKey.findProgramAddressSync(
        [ROLES_SEED, ctx.configPDA.toBuffer(), target.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .updateRoles(target.publicKey, 1, true)
          .accounts({
            authority: randomUser.publicKey,
            stablecoinConfig: ctx.configPDA,
            targetRoles,
            systemProgram: SystemProgram.programId,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  // ============ Two-Step Authority Transfer ============

  describe("Two-Step Authority Transfer", () => {
    let authCtx: TestContext;
    let newAuthority: Keypair;

    before(async () => {
      authCtx = await setupStablecoin(program, provider, {
        name: "Auth Test",
        symbol: "AUTH",
        enablePermanentDelegate: false,
        enableTransferHook: false,
      });
      newAuthority = Keypair.generate();
      await airdrop(provider, newAuthority.publicKey);
    });

    it("should nominate a new authority", async () => {
      await program.methods
        .nominateAuthority(newAuthority.publicKey)
        .accounts({
          authority: authCtx.authority.publicKey,
          stablecoinConfig: authCtx.configPDA,
        })
        .signers([authCtx.authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(authCtx.configPDA);
      expect(config.pendingAuthority.toBase58()).to.equal(newAuthority.publicKey.toBase58());
    });

    it("should reject accept from wrong key", async () => {
      const wrongKey = Keypair.generate();
      await airdrop(provider, wrongKey.publicKey);

      try {
        await program.methods
          .acceptAuthority()
          .accounts({
            newAuthority: wrongKey.publicKey,
            stablecoinConfig: authCtx.configPDA,
          })
          .signers([wrongKey])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("NotPendingAuthority");
      }
    });

    it("should accept authority from the nominated key", async () => {
      await program.methods
        .acceptAuthority()
        .accounts({
          newAuthority: newAuthority.publicKey,
          stablecoinConfig: authCtx.configPDA,
        })
        .signers([newAuthority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(authCtx.configPDA);
      expect(config.authority.toBase58()).to.equal(newAuthority.publicKey.toBase58());
      expect(config.pendingAuthority).to.be.null;
    });
  });

  // ============ Supply Cap ============

  describe("Supply Cap", () => {
    let capCtx: TestContext;

    before(async () => {
      capCtx = await setupStablecoin(program, provider, {
        name: "Cap Test",
        symbol: "CAP",
        supplyCap: 1000,
        enablePermanentDelegate: false,
        enableTransferHook: false,
      });
    });

    it("should update supply cap", async () => {
      await program.methods
        .updateSupplyCap(new anchor.BN(5000))
        .accounts({
          authority: capCtx.authority.publicKey,
          stablecoinConfig: capCtx.configPDA,
        })
        .signers([capCtx.authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(capCtx.configPDA);
      expect(Number(config.supplyCap)).to.equal(5000);
    });

    it("should remove supply cap (set to 0)", async () => {
      await program.methods
        .updateSupplyCap(new anchor.BN(0))
        .accounts({
          authority: capCtx.authority.publicKey,
          stablecoinConfig: capCtx.configPDA,
        })
        .signers([capCtx.authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(capCtx.configPDA);
      expect(Number(config.supplyCap)).to.equal(0);
    });
  });
});
