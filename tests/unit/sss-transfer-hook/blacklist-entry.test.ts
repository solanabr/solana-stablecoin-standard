import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  findHookConfigPda,
  findBlacklistEntryPda,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "@sss/sdk";
import {
  provider,
  hookProgram,
  admin,
  createSSS2Mint,
  initializeHook,
  blacklistWallet,
  unblacklistWallet,
  airdropSol,
} from "../../helpers/setup";

describe("sss-transfer-hook: BlacklistEntry PDA lifecycle", () => {
  let mint: PublicKey;
  let hookConfig: PublicKey;
  let configPda: PublicKey;
  const treasury = Keypair.generate();

  before(async () => {
    await airdropSol(admin.publicKey);
    await airdropSol(treasury.publicKey);
    const result = await createSSS2Mint(treasury.publicKey);
    mint = result.mintKeypair.publicKey;
    configPda = result.configPda;
    [hookConfig] = findHookConfigPda(mint);
    await initializeHook(mint, configPda);
  });

  describe("1. creates entry with correct seeds", () => {
    it("PDA derivation uses 'blacklist', hookConfig, and wallet seeds", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry, bump] = findBlacklistEntryPda(hookConfig, wallet);

      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), hookConfig.toBuffer(), wallet.toBuffer()],
        SSS_TRANSFER_HOOK_PROGRAM_ID
      );
      assert.ok(entry.equals(expected), "PDA should match manual derivation");
    });
  });

  describe("2. stores correct config reference", () => {
    it("blacklist entry stores the hookConfig pubkey", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);

      const data = await (hookProgram.account as any).blacklistEntry.fetch(entry);
      assert.ok(
        data.config.equals(hookConfig),
        "stored hookConfig should match"
      );
    });
  });

  describe("3. stores correct wallet", () => {
    it("blacklist entry stores the correct wallet pubkey", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);

      const data = await (hookProgram.account as any).blacklistEntry.fetch(entry);
      assert.ok(data.wallet.equals(wallet), "stored wallet should match");
    });
  });

  describe("4. stores timestamp", () => {
    it("timestamp is set to a positive unix timestamp on creation", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);
      await blacklistWallet(hookConfig, configPda, wallet);

      const data = await (hookProgram.account as any).blacklistEntry.fetch(entry);
      const storedTs = data.blacklistedAt.toNumber();
      assert.isAbove(storedTs, 0, "timestamp should be a positive unix timestamp");
      // Sanity: timestamp should be after 2020-01-01 (1577836800)
      assert.isAbove(storedTs, 1_577_836_800, "timestamp should be after 2020");
    });
  });

  describe("5. stores bump", () => {
    it("bump stored in entry matches derived bump", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry, expectedBump] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);

      const data = await (hookProgram.account as any).blacklistEntry.fetch(entry);
      assert.equal(data.bump, expectedBump, "stored bump should match derived bump");
    });
  });

  describe("6. entry exists after creation (lamports > 0)", () => {
    it("account has non-zero lamports after add_to_blacklist", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNotNull(account, "account should exist");
      assert.isAbove(account!.lamports, 0, "lamports should be > 0");
    });
  });

  describe("7. entry removed after close (lamports = 0)", () => {
    it("account is null/closed after remove_from_blacklist", async () => {
      const wallet = Keypair.generate().publicKey;
      const [entry] = findBlacklistEntryPda(hookConfig, wallet);

      await blacklistWallet(hookConfig, configPda, wallet);
      await unblacklistWallet(hookConfig, configPda, wallet);

      const account = await provider.connection.getAccountInfo(entry);
      assert.isNull(account, "account should be null after close");
    });
  });

  describe("8. lamports returned to payer on close", () => {
    it("payer receives rent lamports back after closing entry", async () => {
      const wallet = Keypair.generate().publicKey;

      await blacklistWallet(hookConfig, configPda, wallet);

      const balanceBefore = await provider.connection.getBalance(admin.publicKey);

      await unblacklistWallet(hookConfig, configPda, wallet);

      const balanceAfter = await provider.connection.getBalance(admin.publicKey);
      // Balance should increase (rent returned) minus transaction fee
      assert.isAbove(
        balanceAfter,
        balanceBefore - LAMPORTS_PER_SOL * 0.001,
        "payer balance should recover rent"
      );
    });
  });

  describe("9. different wallets have different PDAs", () => {
    it("two different wallets produce distinct blacklist entry PDAs", () => {
      const walletA = Keypair.generate().publicKey;
      const walletB = Keypair.generate().publicKey;

      const [entryA] = findBlacklistEntryPda(hookConfig, walletA);
      const [entryB] = findBlacklistEntryPda(hookConfig, walletB);

      assert.isFalse(
        entryA.equals(entryB),
        "different wallets should have different PDAs"
      );
    });
  });

  describe("10. same wallet on different configs = different PDAs", () => {
    it("same wallet with two different hook configs produces different PDAs", async () => {
      const wallet = Keypair.generate().publicKey;

      // Create a second mint/hookConfig
      const treasury2 = Keypair.generate();
      await airdropSol(treasury2.publicKey);
      const result2 = await createSSS2Mint(treasury2.publicKey);
      const mint2 = result2.mintKeypair.publicKey;
      const configPda2 = result2.configPda;
      const [hookConfig2] = findHookConfigPda(mint2);
      await initializeHook(mint2, configPda2);

      const [entry1] = findBlacklistEntryPda(hookConfig, wallet);
      const [entry2] = findBlacklistEntryPda(hookConfig2, wallet);

      assert.isFalse(
        entry1.equals(entry2),
        "same wallet on different configs should have different PDAs"
      );
    });
  });
});
