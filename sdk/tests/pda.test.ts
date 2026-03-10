import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  findConfigPda,
  findMintAuthorityPda,
  findMinterStatePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
} from "../src/pda";
import {
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  MINTER_SEED,
  HOOK_CONFIG_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
} from "../src/constants";

describe("PDA derivation functions", () => {
  // Fixed keys for deterministic testing
  const mintA = Keypair.generate().publicKey;
  const mintB = Keypair.generate().publicKey;
  const walletA = Keypair.generate().publicKey;
  const walletB = Keypair.generate().publicKey;

  // ---------- findConfigPda ----------

  describe("findConfigPda", () => {
    it("should return a [PublicKey, number] tuple", () => {
      const result = findConfigPda(mintA);
      expect(result).to.be.an("array").with.lengthOf(2);
      expect(result[0]).to.be.instanceOf(PublicKey);
      expect(result[1]).to.be.a("number");
    });

    it("should produce a valid bump (0-255)", () => {
      const [, bump] = findConfigPda(mintA);
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });

    it("should be deterministic (same inputs produce same outputs)", () => {
      const result1 = findConfigPda(mintA);
      const result2 = findConfigPda(mintA);
      expect(result1[0].equals(result2[0])).to.be.true;
      expect(result1[1]).to.equal(result2[1]);
    });

    it("should produce different PDAs for different mints", () => {
      const [pdaA] = findConfigPda(mintA);
      const [pdaB] = findConfigPda(mintB);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should default to SSS_CORE_PROGRAM_ID", () => {
      const resultDefault = findConfigPda(mintA);
      const resultExplicit = findConfigPda(mintA, SSS_CORE_PROGRAM_ID);
      expect(resultDefault[0].equals(resultExplicit[0])).to.be.true;
      expect(resultDefault[1]).to.equal(resultExplicit[1]);
    });

    it("should produce different PDAs for different program IDs", () => {
      const customProgram = Keypair.generate().publicKey;
      const [pdaDefault] = findConfigPda(mintA);
      const [pdaCustom] = findConfigPda(mintA, customProgram);
      expect(pdaDefault.equals(pdaCustom)).to.be.false;
    });

    it("should derive using the correct seeds ['config', mint]", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from(CONFIG_SEED), mintA.toBuffer()],
        SSS_CORE_PROGRAM_ID
      );
      const [actual] = findConfigPda(mintA);
      expect(actual.equals(expected)).to.be.true;
    });
  });

  // ---------- findMintAuthorityPda ----------

  describe("findMintAuthorityPda", () => {
    it("should return a [PublicKey, number] tuple", () => {
      const result = findMintAuthorityPda(mintA);
      expect(result).to.be.an("array").with.lengthOf(2);
      expect(result[0]).to.be.instanceOf(PublicKey);
      expect(result[1]).to.be.a("number");
    });

    it("should produce a valid bump (0-255)", () => {
      const [, bump] = findMintAuthorityPda(mintA);
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });

    it("should be deterministic (same inputs produce same outputs)", () => {
      const result1 = findMintAuthorityPda(mintA);
      const result2 = findMintAuthorityPda(mintA);
      expect(result1[0].equals(result2[0])).to.be.true;
      expect(result1[1]).to.equal(result2[1]);
    });

    it("should produce different PDAs for different mints", () => {
      const [pdaA] = findMintAuthorityPda(mintA);
      const [pdaB] = findMintAuthorityPda(mintB);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should default to SSS_CORE_PROGRAM_ID", () => {
      const resultDefault = findMintAuthorityPda(mintA);
      const resultExplicit = findMintAuthorityPda(mintA, SSS_CORE_PROGRAM_ID);
      expect(resultDefault[0].equals(resultExplicit[0])).to.be.true;
    });

    it("should derive using the correct seeds ['mint-authority', mint]", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from(MINT_AUTHORITY_SEED), mintA.toBuffer()],
        SSS_CORE_PROGRAM_ID
      );
      const [actual] = findMintAuthorityPda(mintA);
      expect(actual.equals(expected)).to.be.true;
    });

    it("should produce a PDA different from findConfigPda for the same mint", () => {
      const [configPda] = findConfigPda(mintA);
      const [mintAuthPda] = findMintAuthorityPda(mintA);
      expect(configPda.equals(mintAuthPda)).to.be.false;
    });
  });

  // ---------- findMinterStatePda ----------

  describe("findMinterStatePda", () => {
    let configKey: PublicKey;

    before(() => {
      [configKey] = findConfigPda(mintA);
    });

    it("should return a [PublicKey, number] tuple", () => {
      const result = findMinterStatePda(configKey, walletA);
      expect(result).to.be.an("array").with.lengthOf(2);
      expect(result[0]).to.be.instanceOf(PublicKey);
      expect(result[1]).to.be.a("number");
    });

    it("should produce a valid bump (0-255)", () => {
      const [, bump] = findMinterStatePda(configKey, walletA);
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });

    it("should be deterministic (same inputs produce same outputs)", () => {
      const result1 = findMinterStatePda(configKey, walletA);
      const result2 = findMinterStatePda(configKey, walletA);
      expect(result1[0].equals(result2[0])).to.be.true;
      expect(result1[1]).to.equal(result2[1]);
    });

    it("should use both config key and minter wallet in derivation", () => {
      const [pdaA] = findMinterStatePda(configKey, walletA);
      const [pdaB] = findMinterStatePda(configKey, walletB);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should produce different PDAs for different config keys", () => {
      const [configKey2] = findConfigPda(mintB);
      const [pdaA] = findMinterStatePda(configKey, walletA);
      const [pdaB] = findMinterStatePda(configKey2, walletA);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should default to SSS_CORE_PROGRAM_ID", () => {
      const resultDefault = findMinterStatePda(configKey, walletA);
      const resultExplicit = findMinterStatePda(
        configKey,
        walletA,
        SSS_CORE_PROGRAM_ID
      );
      expect(resultDefault[0].equals(resultExplicit[0])).to.be.true;
    });

    it("should derive using the correct seeds ['minter', config, minter_wallet]", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(MINTER_SEED),
          configKey.toBuffer(),
          walletA.toBuffer(),
        ],
        SSS_CORE_PROGRAM_ID
      );
      const [actual] = findMinterStatePda(configKey, walletA);
      expect(actual.equals(expected)).to.be.true;
    });
  });

  // ---------- findHookConfigPda ----------

  describe("findHookConfigPda", () => {
    it("should return a [PublicKey, number] tuple", () => {
      const result = findHookConfigPda(mintA);
      expect(result).to.be.an("array").with.lengthOf(2);
      expect(result[0]).to.be.instanceOf(PublicKey);
      expect(result[1]).to.be.a("number");
    });

    it("should produce a valid bump (0-255)", () => {
      const [, bump] = findHookConfigPda(mintA);
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });

    it("should be deterministic (same inputs produce same outputs)", () => {
      const result1 = findHookConfigPda(mintA);
      const result2 = findHookConfigPda(mintA);
      expect(result1[0].equals(result2[0])).to.be.true;
      expect(result1[1]).to.equal(result2[1]);
    });

    it("should produce different PDAs for different mints", () => {
      const [pdaA] = findHookConfigPda(mintA);
      const [pdaB] = findHookConfigPda(mintB);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should default to SSS_HOOK_PROGRAM_ID", () => {
      const resultDefault = findHookConfigPda(mintA);
      const resultExplicit = findHookConfigPda(mintA, SSS_HOOK_PROGRAM_ID);
      expect(resultDefault[0].equals(resultExplicit[0])).to.be.true;
    });

    it("should derive using the correct seeds ['hook-config', mint]", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from(HOOK_CONFIG_SEED), mintA.toBuffer()],
        SSS_HOOK_PROGRAM_ID
      );
      const [actual] = findHookConfigPda(mintA);
      expect(actual.equals(expected)).to.be.true;
    });
  });

  // ---------- findExtraAccountMetaListPda ----------

  describe("findExtraAccountMetaListPda", () => {
    it("should return a [PublicKey, number] tuple", () => {
      const result = findExtraAccountMetaListPda(mintA);
      expect(result).to.be.an("array").with.lengthOf(2);
      expect(result[0]).to.be.instanceOf(PublicKey);
      expect(result[1]).to.be.a("number");
    });

    it("should produce a valid bump (0-255)", () => {
      const [, bump] = findExtraAccountMetaListPda(mintA);
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });

    it("should be deterministic (same inputs produce same outputs)", () => {
      const result1 = findExtraAccountMetaListPda(mintA);
      const result2 = findExtraAccountMetaListPda(mintA);
      expect(result1[0].equals(result2[0])).to.be.true;
      expect(result1[1]).to.equal(result2[1]);
    });

    it("should produce different PDAs for different mints", () => {
      const [pdaA] = findExtraAccountMetaListPda(mintA);
      const [pdaB] = findExtraAccountMetaListPda(mintB);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should default to SSS_HOOK_PROGRAM_ID", () => {
      const resultDefault = findExtraAccountMetaListPda(mintA);
      const resultExplicit = findExtraAccountMetaListPda(
        mintA,
        SSS_HOOK_PROGRAM_ID
      );
      expect(resultDefault[0].equals(resultExplicit[0])).to.be.true;
    });

    it("should derive using the correct seeds ['extra-account-metas', mint]", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from(EXTRA_ACCOUNT_METAS_SEED), mintA.toBuffer()],
        SSS_HOOK_PROGRAM_ID
      );
      const [actual] = findExtraAccountMetaListPda(mintA);
      expect(actual.equals(expected)).to.be.true;
    });
  });

  // ---------- findBlacklistEntryPda ----------

  describe("findBlacklistEntryPda", () => {
    it("should return a [PublicKey, number] tuple", () => {
      const result = findBlacklistEntryPda(mintA, walletA);
      expect(result).to.be.an("array").with.lengthOf(2);
      expect(result[0]).to.be.instanceOf(PublicKey);
      expect(result[1]).to.be.a("number");
    });

    it("should produce a valid bump (0-255)", () => {
      const [, bump] = findBlacklistEntryPda(mintA, walletA);
      expect(bump).to.be.at.least(0);
      expect(bump).to.be.at.most(255);
    });

    it("should be deterministic (same inputs produce same outputs)", () => {
      const result1 = findBlacklistEntryPda(mintA, walletA);
      const result2 = findBlacklistEntryPda(mintA, walletA);
      expect(result1[0].equals(result2[0])).to.be.true;
      expect(result1[1]).to.equal(result2[1]);
    });

    it("should use both mint and wallet in derivation", () => {
      const [pdaA] = findBlacklistEntryPda(mintA, walletA);
      const [pdaB] = findBlacklistEntryPda(mintA, walletB);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should produce different PDAs for different mints (same wallet)", () => {
      const [pdaA] = findBlacklistEntryPda(mintA, walletA);
      const [pdaB] = findBlacklistEntryPda(mintB, walletA);
      expect(pdaA.equals(pdaB)).to.be.false;
    });

    it("should default to SSS_HOOK_PROGRAM_ID", () => {
      const resultDefault = findBlacklistEntryPda(mintA, walletA);
      const resultExplicit = findBlacklistEntryPda(
        mintA,
        walletA,
        SSS_HOOK_PROGRAM_ID
      );
      expect(resultDefault[0].equals(resultExplicit[0])).to.be.true;
    });

    it("should derive using the correct seeds ['blacklist', mint, wallet]", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(BLACKLIST_SEED),
          mintA.toBuffer(),
          walletA.toBuffer(),
        ],
        SSS_HOOK_PROGRAM_ID
      );
      const [actual] = findBlacklistEntryPda(mintA, walletA);
      expect(actual.equals(expected)).to.be.true;
    });
  });

  // ---------- Cross-function uniqueness ----------

  describe("cross-function uniqueness", () => {
    it("should produce unique PDAs from different derivation functions for the same mint", () => {
      const [configPda] = findConfigPda(mintA);
      const [mintAuthPda] = findMintAuthorityPda(mintA);
      const [hookConfigPda] = findHookConfigPda(mintA);
      const [extraMetaPda] = findExtraAccountMetaListPda(mintA);
      const [blacklistPda] = findBlacklistEntryPda(mintA, walletA);

      const allPdas = [configPda, mintAuthPda, hookConfigPda, extraMetaPda, blacklistPda];
      const uniqueSet = new Set(allPdas.map((pk) => pk.toBase58()));
      expect(uniqueSet.size).to.equal(allPdas.length);
    });
  });
});
