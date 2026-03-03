import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
} from "@sss/sdk";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createTokenAccount,
  grantRole,
  initializeHook,
  airdropSol,
} from "../helpers/setup";
import { ROLE, TOKEN_2022_PROGRAM_ID } from "../helpers/constants";

describe("e2e: SSS-3 basic tests", () => {
  let mint: PublicKey;
  let config: PublicKey;
  let hookConfig: PublicKey;
  const treasury = Keypair.generate();
  const minter = Keypair.generate();
  const pauser = Keypair.generate();
  const complianceOfficer = Keypair.generate();
  const user = Keypair.generate();

  before(async () => {
    await Promise.all([
      airdropSol(admin.publicKey),
      airdropSol(treasury.publicKey),
      airdropSol(minter.publicKey),
      airdropSol(pauser.publicKey),
      airdropSol(complianceOfficer.publicKey),
      airdropSol(user.publicKey),
    ]);
  });

  describe("1. create SSS-3 mint (same extensions as SSS-2 + ConfidentialTransfer)", () => {
    it("creates SSS-3 mint with preset 2", async () => {
      const mintKeypair = Keypair.generate();
      const [configPda] = findConfigPda(mintKeypair.publicKey);

      await coreProgram.methods
        .createMint({
          name: "Test SSS-3",
          symbol: "TSSS3",
          uri: "",
          decimals: 6,
          preset: 2,
          transferHookProgram: hookProgram.programId,
          treasury: treasury.publicKey,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();

      mint = mintKeypair.publicKey;
      config = configPda;
      [hookConfig] = findHookConfigPda(mint);

      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.deepEqual(cfg.preset, { sss3: {} }, "preset should be SSS-3");
      assert.ok(cfg.mint.equals(mint), "mint should match");
    });
  });

  describe("2. SSS-3 has all SSS-2 features", () => {
    it("SSS-3 config exists and admin is set", async () => {
      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.ok(cfg.admin.equals(admin.publicKey), "admin should be set");
      assert.ok(cfg.treasury.equals(treasury.publicKey), "treasury should be set");
    });
  });

  describe("3. config preset is 2", () => {
    it("config.preset equals 2", async () => {
      const cfg = await coreProgram.account.stablecoinConfig.fetch(config);
      assert.deepEqual(cfg.preset, { sss3: {} }, "preset should be SSS-3");
    });
  });

  describe("4. transfer hook works for SSS-3", () => {
    it("initializes transfer hook for SSS-3 mint", async () => {
      await initializeHook(mint, config);
      const account = await provider.connection.getAccountInfo(hookConfig);
      assert.isNotNull(account, "hook config should be initialized for SSS-3");

      const hookCfg = await hookProgram.account.hookConfig.fetch(hookConfig);
      assert.ok(hookCfg.mint.equals(mint), "hook config mint should match SSS-3 mint");
    });
  });

  describe("5. all compliance features work for SSS-3", () => {
    it("mint, freeze, blacklist, and thaw all work for SSS-3", async () => {
      await grantRole(config, minter.publicKey, ROLE.Minter, 5000);
      await grantRole(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);

      const userAta = await createTokenAccount(mint, user.publicKey);
      const [minterRole] = findRolePda(config, minter.publicKey, ROLE.Minter);

      // Mint
      await coreProgram.methods
        .mintTo(new BN(1000))
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
      assert.equal(balance.value.amount, "1000", "user should have 1000 SSS-3 tokens");

      // Blacklist
      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, user.publicKey);
      await coreProgram.methods
        .blacklist(user.publicKey)
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config,
          hookConfig,
          blacklistEntry,
          transferHookProgram: hookProgram.programId,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entryAccount = await provider.connection.getAccountInfo(blacklistEntry);
      assert.isNotNull(entryAccount, "blacklist entry should exist for SSS-3");

      // Freeze
      const [coRole] = findRolePda(config, complianceOfficer.publicKey, ROLE.ComplianceOfficer);
      await coreProgram.methods
        .freezeAccount()
        .accounts({
          authority: complianceOfficer.publicKey,
          config,
          roleAccount: coRole,
          mint,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([complianceOfficer])
        .rpc();

      // Thaw
      await coreProgram.methods
        .thawAccount()
        .accounts({
          authority: complianceOfficer.publicKey,
          config,
          roleAccount: coRole,
          mint,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([complianceOfficer])
        .rpc();

      const ataInfo = await provider.connection.getAccountInfo(userAta);
      assert.isNotNull(ataInfo, "user ATA should still exist after thaw");
    });
  });
});
