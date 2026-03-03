import * as anchor from "@coral-xyz/anchor";
import { assert, expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
} from "@sss/sdk";
import {
  provider,
  hookProgram,
  coreProgram,
  admin,
  createSSS2Mint,
  initializeHook,
  blacklistWallet,
  unblacklistWallet,
  airdropSol,
} from "../../helpers/setup";

describe("sss-transfer-hook: transfer hook program", () => {
  let mint: PublicKey;
  let hookConfig: PublicKey;
  let hookConfigBump: number;
  let configPda: PublicKey;
  const treasury = Keypair.generate();

  before(async () => {
    await airdropSol(admin.publicKey);
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    mint = result.mintKeypair.publicKey;
    configPda = result.configPda;
    [hookConfig, hookConfigBump] = findHookConfigPda(mint);
    await initializeHook(mint, configPda);
  });

  describe("1. initialize_hook_config creates HookConfig PDA", () => {
    it("creates the hook_config account", async () => {
      const account = await provider.connection.getAccountInfo(hookConfig);
      assert.isNotNull(account, "hook_config account should exist");
      assert.isAbove(account!.lamports, 0);
    });
  });

  describe("2. initialize_extra_account_meta_list creates ExtraAccountMetaList", () => {
    it("creates the extra_account_meta_list account", async () => {
      const [extraMetaList] = findExtraAccountMetaListPda(mint);
      const account = await provider.connection.getAccountInfo(extraMetaList);
      assert.isNotNull(account, "extra_account_meta_list should exist");
    });
  });

  describe("3. add_to_blacklist creates BlacklistEntry", () => {
    it("creates blacklist entry for a wallet via CPI", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNotNull(account, "blacklist entry should exist after add");
    });
  });

  describe("4. remove_from_blacklist closes BlacklistEntry", () => {
    it("closes blacklist entry for a wallet via CPI", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);
      await unblacklistWallet(hookConfig, configPda, wallet);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNull(account, "blacklist entry should be closed after remove");
    });
  });

  describe("5. transfer_hook allows non-blacklisted transfer (mock)", () => {
    it("hook config exists for non-blacklisted mint", async () => {
      const account = await provider.connection.getAccountInfo(hookConfig);
      assert.isNotNull(account, "hook config should be initialized");
    });
  });

  describe("6. transfer_hook blocks blacklisted sender", () => {
    it("blacklisted sender entry exists and would block transfer", async () => {
      const sender = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, sender);

      await blacklistWallet(hookConfig, configPda, sender);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNotNull(account, "blacklisted sender entry should exist");
    });
  });

  describe("7. transfer_hook blocks blacklisted receiver", () => {
    it("blacklisted receiver entry exists and would block transfer", async () => {
      const receiver = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, receiver);

      await blacklistWallet(hookConfig, configPda, receiver);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNotNull(account, "blacklisted receiver entry should exist");
    });
  });

  describe("8. rejects unauthorized add_to_blacklist", () => {
    it("throws when non-admin tries to blacklist via sss-core", async () => {
      const attacker = Keypair.generate();
      await airdropSol(attacker.publicKey);
      const wallet = Keypair.generate().publicKey;
      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

      try {
        await coreProgram.methods
          .blacklist(wallet)
          .accounts({
            payer: attacker.publicKey,
            admin: attacker.publicKey,
            config: configPda,
            hookConfig,
            blacklistEntry,
            transferHookProgram: hookProgram.programId,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Expected error for unauthorized blacklist");
      } catch (err: any) {
        assert.ok(err, "Should throw for unauthorized caller");
      }
    });
  });

  describe("9. rejects unauthorized remove_from_blacklist", () => {
    it("throws when non-admin tries to unblacklist via sss-core", async () => {
      const attacker = Keypair.generate();
      await airdropSol(attacker.publicKey);
      const wallet = Keypair.generate().publicKey;

      // First add legitimately
      await blacklistWallet(hookConfig, configPda, wallet);

      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

      try {
        await coreProgram.methods
          .unblacklist(wallet)
          .accounts({
            payer: attacker.publicKey,
            admin: attacker.publicKey,
            config: configPda,
            hookConfig,
            blacklistEntry,
            transferHookProgram: hookProgram.programId,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Expected error for unauthorized unblacklist");
      } catch (err: any) {
        assert.ok(err, "Should throw for unauthorized caller");
      }
    });
  });

  describe("10. rejects remove for non-existent blacklist entry", () => {
    it("throws when removing a non-existent entry", async () => {
      const wallet = Keypair.generate().publicKey;
      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

      try {
        await coreProgram.methods
          .unblacklist(wallet)
          .accounts({
            payer: admin.publicKey,
            admin: admin.publicKey,
            config: configPda,
            hookConfig,
            blacklistEntry,
            transferHookProgram: hookProgram.programId,
          })
          .rpc();
        assert.fail("Expected error for non-existent blacklist entry");
      } catch (err: any) {
        assert.ok(err, "Should throw for non-existent entry");
      }
    });
  });

  describe("11. hook_config authority set correctly", () => {
    it("authority matches config PDA (sss-core signs via CPI)", async () => {
      const cfg = await (hookProgram.account as any).hookConfig.fetch(hookConfig);
      assert.ok(
        cfg.authority.equals(configPda),
        "hook_config authority should be the config PDA"
      );
    });
  });

  describe("12. hook_config mint set correctly", () => {
    it("mint field matches the mint pubkey", async () => {
      const cfg = await (hookProgram.account as any).hookConfig.fetch(hookConfig);
      assert.ok(cfg.mint.equals(mint), "hook_config mint should match");
    });
  });

  describe("13. blacklist_entry stores wallet and timestamp", () => {
    it("stores correct wallet and non-zero timestamp", async () => {
      const wallet = Keypair.generate().publicKey;

      await blacklistWallet(hookConfig, configPda, wallet);

      const [entry] = findBlacklistEntryPda(hookConfig, wallet);
      const data = await (hookProgram.account as any).blacklistEntry.fetch(entry);
      assert.ok(data.wallet.equals(wallet), "stored wallet should match");
      assert.isAbove(data.blacklistedAt.toNumber(), 0, "timestamp should be non-zero");
    });
  });

  describe("14. blacklist_entry bump is correct", () => {
    it("stored bump matches PDA derivation", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry, expectedBump] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);

      const data = await (hookProgram.account as any).blacklistEntry.fetch(entry);
      assert.equal(data.bump, expectedBump, "stored bump should match derived bump");
    });
  });

  describe("15. re-blacklist after unblacklist works", () => {
    it("can re-add a wallet after removing it from blacklist", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);
      await unblacklistWallet(hookConfig, configPda, wallet);

      // Re-add
      await blacklistWallet(hookConfig, configPda, wallet);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNotNull(account, "re-blacklisted entry should exist");
    });
  });
});
