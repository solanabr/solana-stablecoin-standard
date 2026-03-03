import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  findConfigPda,
  findRolePda,
} from "@sss/sdk";
import {
  provider,
  coreProgram,
  admin,
  createSSS1Mint,
  grantRole,
  createTokenAccount,
  airdropSol,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("e2e: SSS-1 full lifecycle", () => {
  let mint: PublicKey;
  let config: PublicKey;
  let mintKeypair: Keypair;
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const user = Keypair.generate();

  before(async () => {
    await airdropSol(admin.publicKey);
    await airdropSol(minter.publicKey);
    await airdropSol(burner.publicKey);
    await airdropSol(user.publicKey);
  });

  describe("1. create SSS-1 mint", () => {
    it("initializes a new SSS-1 mint and config PDA", async () => {
      const result = await createSSS1Mint();
      mintKeypair = result.mintKeypair;
      mint = mintKeypair.publicKey;
      config = result.configPda;

      const configAccount = await provider.connection.getAccountInfo(config);
      assert.isNotNull(configAccount, "config PDA should exist");

      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.deepEqual(cfg.preset, { sss1: {} }, "preset should be SSS-1");
      assert.ok(cfg.admin.equals(admin.publicKey), "admin should be set correctly");
    });
  });

  describe("2. grant minter role with allowance", () => {
    it("grants minter role with allowance of 1000", async () => {
      await grantRole(config, minter.publicKey, ROLE.Minter, 1000);

      const [rolePda] = findRolePda(config, minter.publicKey, ROLE.Minter);
      const role = await coreProgram.account.roleAccount.fetch(rolePda);
      assert.ok(role.holder.equals(minter.publicKey), "holder should match");
      assert.equal(role.allowance.toNumber(), 1000, "allowance should be 1000");
    });
  });

  describe("3. grant burner role", () => {
    it("grants burner role to burner keypair", async () => {
      await grantRole(config, burner.publicKey, ROLE.Burner);

      const [rolePda] = findRolePda(config, burner.publicKey, ROLE.Burner);
      const role = await coreProgram.account.roleAccount.fetch(rolePda);
      assert.ok(role.holder.equals(burner.publicKey), "holder should match");
    });
  });

  describe("4. mint tokens", () => {
    it("minter can mint 500 tokens to user", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);

      await coreProgram.methods
        .mintTo(new BN(500))
        .accounts({
          minter: minter.publicKey,
          config,
          roleAccount: minterRole,
          mint,
          to: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const balance = await provider.connection.getTokenAccountBalance(userAta);
      assert.equal(balance.value.amount, "500", "user should have 500 tokens");
    });
  });

  describe("5. burn tokens (SSS-1 has no PermanentDelegate)", () => {
    it("burnFrom fails on SSS-1 (no PermanentDelegate)", async () => {
      const userAta = await createTokenAccount(mint, user.publicKey);
      const [burnerRole] = findRolePda(config, burner.publicKey, ROLE.Burner);

      try {
        await coreProgram.methods
          .burnFrom(new BN(100))
          .accounts({
            burner: burner.publicKey,
            config,
            roleAccount: burnerRole,
            mint,
            from: userAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burner])
          .rpc();
        assert.fail("burnFrom should fail on SSS-1 (no PermanentDelegate)");
      } catch (err: any) {
        assert.ok(err, "expected error: SSS-1 does not support burnFrom");
      }
    });
  });

  describe("6. pause -> mint fails -> unpause -> mint succeeds", () => {
    let pauserKeypair: Keypair;

    before(async () => {
      pauserKeypair = Keypair.generate();
      await airdropSol(pauserKeypair.publicKey);
      await grantRole(config, pauserKeypair.publicKey, ROLE.Pauser);
    });

    it("pauses the stablecoin and blocks minting", async () => {
      const [pauserRole] = findRolePda(config, pauserKeypair.publicKey, ROLE.Pauser);

      await coreProgram.methods
        .pause()
        .accounts({
          authority: pauserKeypair.publicKey,
          config,
          roleAccount: pauserRole,
        })
        .signers([pauserKeypair])
        .rpc();

      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.isTrue(cfg.paused, "should be paused");

      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);
      const pauserAta = await createTokenAccount(mint, pauserKeypair.publicKey);

      try {
        await coreProgram.methods
          .mintTo(new BN(10))
          .accounts({
            minter: minter.publicKey,
            config,
            roleAccount: minterRole,
            mint,
            to: pauserAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("mint should fail when paused");
      } catch (err: any) {
        assert.ok(err, "expected error when minting while paused");
      }
    });

    it("unpauses and allows minting again", async () => {
      const [pauserRole] = findRolePda(config, pauserKeypair.publicKey, ROLE.Pauser);

      await coreProgram.methods
        .unpause()
        .accounts({
          authority: pauserKeypair.publicKey,
          config,
          roleAccount: pauserRole,
        })
        .signers([pauserKeypair])
        .rpc();

      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.isFalse(cfg.paused, "should be unpaused");

      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);
      const userAta = await createTokenAccount(mint, user.publicKey);

      await coreProgram.methods
        .mintTo(new BN(10))
        .accounts({
          minter: minter.publicKey,
          config,
          roleAccount: minterRole,
          mint,
          to: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
    });
  });

  describe("7. grant role -> revoke role -> cannot mint", () => {
    it("revoked minter cannot mint", async () => {
      const tempMinter = Keypair.generate();
      await airdropSol(tempMinter.publicKey);
      await grantRole(config, tempMinter.publicKey, ROLE.Minter, 500);

      const [rolePda] = findRolePda(config, tempMinter.publicKey, ROLE.Minter);

      await coreProgram.methods
        .revokeRole()
        .accounts({
          admin: admin.publicKey,
          config,
          holder: tempMinter.publicKey,
          roleAccount: rolePda,
        })
        .rpc();

      const userAta = await createTokenAccount(mint, tempMinter.publicKey);
      try {
        await coreProgram.methods
          .mintTo(new BN(10))
          .accounts({
            minter: tempMinter.publicKey,
            config,
            roleAccount: rolePda,
            mint,
            to: userAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([tempMinter])
          .rpc();
        assert.fail("revoked minter should not be able to mint");
      } catch (err: any) {
        assert.ok(err, "expected error for revoked minter");
      }
    });
  });

  describe("8. transfer admin -> accept admin", () => {
    it("completes a two-step admin transfer", async () => {
      const newAdmin = Keypair.generate();
      await airdropSol(newAdmin.publicKey);

      await coreProgram.methods
        .transferAdmin(newAdmin.publicKey)
        .accounts({ admin: admin.publicKey, config })
        .rpc();

      let cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.ok(cfg.pendingAdmin.equals(newAdmin.publicKey), "pending admin should be set");

      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: newAdmin.publicKey, config })
        .signers([newAdmin])
        .rpc();

      cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.ok(cfg.admin.equals(newAdmin.publicKey), "admin should be transferred");

      // Transfer back
      await coreProgram.methods
        .transferAdmin(admin.publicKey)
        .accounts({ admin: newAdmin.publicKey, config })
        .signers([newAdmin])
        .rpc();
      await coreProgram.methods
        .acceptAdmin()
        .accounts({ pendingAdmin: admin.publicKey, config })
        .rpc();
    });
  });

  describe("9. info query returns correct data", () => {
    it("fetches config and verifies all fields", async () => {
      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.ok(cfg.admin.equals(admin.publicKey), "admin should match");
      assert.ok(cfg.mint.equals(mint), "mint should match");
      assert.deepEqual(cfg.preset, { sss1: {} }, "preset should be SSS-1");
      assert.isFalse(cfg.paused, "should not be paused");
      assert.isAbove(cfg.totalMinted.toNumber(), 0, "totalMinted should be > 0");
    });
  });

  describe("10. multiple minters with different allowances", () => {
    it("two minters with different allowances can each mint their share", async () => {
      const minter2 = Keypair.generate();
      const minter3 = Keypair.generate();
      await airdropSol(minter2.publicKey);
      await airdropSol(minter3.publicKey);

      await grantRole(config, minter2.publicKey, ROLE.Minter, 200);
      await grantRole(config, minter3.publicKey, ROLE.Minter, 300);

      const ata2 = await createTokenAccount(mint, minter2.publicKey);
      const ata3 = await createTokenAccount(mint, minter3.publicKey);

      const [role2] = findRolePda(config, minter2.publicKey, ROLE.Minter);
      const [role3] = findRolePda(config, minter3.publicKey, ROLE.Minter);

      await coreProgram.methods
        .mintTo(new BN(200))
        .accounts({
          minter: minter2.publicKey,
          config,
          roleAccount: role2,
          mint,
          to: ata2,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter2])
        .rpc();

      await coreProgram.methods
        .mintTo(new BN(300))
        .accounts({
          minter: minter3.publicKey,
          config,
          roleAccount: role3,
          mint,
          to: ata3,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter3])
        .rpc();

      const bal2 = await provider.connection.getTokenAccountBalance(ata2);
      const bal3 = await provider.connection.getTokenAccountBalance(ata3);
      assert.equal(bal2.value.amount, "200", "minter2 ATA should have 200");
      assert.equal(bal3.value.amount, "300", "minter3 ATA should have 300");
    });
  });
});
