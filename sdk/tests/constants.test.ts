import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  PRESET_MINIMAL,
  PRESET_COMPLIANT,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  MINTER_SEED,
  HOOK_CONFIG_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  TOKEN_2022_PROGRAM_ID as REEXPORTED_TOKEN_2022,
} from "../src/constants";

describe("Constants", () => {
  // ---------- Preset values ----------

  describe("preset values", () => {
    it("PRESET_MINIMAL should equal 1", () => {
      expect(PRESET_MINIMAL).to.equal(1);
    });

    it("PRESET_COMPLIANT should equal 2", () => {
      expect(PRESET_COMPLIANT).to.equal(2);
    });

    it("PRESET_MINIMAL and PRESET_COMPLIANT should be different", () => {
      expect(PRESET_MINIMAL).to.not.equal(PRESET_COMPLIANT);
    });
  });

  // ---------- Program IDs ----------

  describe("program IDs", () => {
    it("SSS_CORE_PROGRAM_ID should be a valid PublicKey", () => {
      expect(SSS_CORE_PROGRAM_ID).to.be.instanceOf(PublicKey);
      // Should not throw when calling toBase58
      expect(() => SSS_CORE_PROGRAM_ID.toBase58()).to.not.throw();
    });

    it("SSS_CORE_PROGRAM_ID should have the expected base58 value", () => {
      expect(SSS_CORE_PROGRAM_ID.toBase58()).to.equal(
        "CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y"
      );
    });

    it("SSS_HOOK_PROGRAM_ID should be a valid PublicKey", () => {
      expect(SSS_HOOK_PROGRAM_ID).to.be.instanceOf(PublicKey);
      expect(() => SSS_HOOK_PROGRAM_ID.toBase58()).to.not.throw();
    });

    it("SSS_HOOK_PROGRAM_ID should have the expected base58 value", () => {
      expect(SSS_HOOK_PROGRAM_ID.toBase58()).to.equal(
        "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM"
      );
    });

    it("SSS_CORE_PROGRAM_ID and SSS_HOOK_PROGRAM_ID should be different", () => {
      expect(SSS_CORE_PROGRAM_ID.equals(SSS_HOOK_PROGRAM_ID)).to.be.false;
    });
  });

  // ---------- PDA seed strings ----------

  describe("PDA seed strings", () => {
    it('CONFIG_SEED should equal "config"', () => {
      expect(CONFIG_SEED).to.equal("config");
    });

    it('MINT_AUTHORITY_SEED should equal "mint-authority"', () => {
      expect(MINT_AUTHORITY_SEED).to.equal("mint-authority");
    });

    it('MINTER_SEED should equal "minter"', () => {
      expect(MINTER_SEED).to.equal("minter");
    });

    it('HOOK_CONFIG_SEED should equal "hook-config"', () => {
      expect(HOOK_CONFIG_SEED).to.equal("hook-config");
    });

    it('BLACKLIST_SEED should equal "blacklist"', () => {
      expect(BLACKLIST_SEED).to.equal("blacklist");
    });

    it('EXTRA_ACCOUNT_METAS_SEED should equal "extra-account-metas"', () => {
      expect(EXTRA_ACCOUNT_METAS_SEED).to.equal("extra-account-metas");
    });

    it("all seed strings should be non-empty", () => {
      const seeds = [
        CONFIG_SEED,
        MINT_AUTHORITY_SEED,
        MINTER_SEED,
        HOOK_CONFIG_SEED,
        BLACKLIST_SEED,
        EXTRA_ACCOUNT_METAS_SEED,
      ];
      for (const seed of seeds) {
        expect(seed).to.be.a("string").and.to.have.length.greaterThan(0);
      }
    });

    it("all seed strings should be unique", () => {
      const seeds = [
        CONFIG_SEED,
        MINT_AUTHORITY_SEED,
        MINTER_SEED,
        HOOK_CONFIG_SEED,
        BLACKLIST_SEED,
        EXTRA_ACCOUNT_METAS_SEED,
      ];
      const uniqueSet = new Set(seeds);
      expect(uniqueSet.size).to.equal(seeds.length);
    });
  });

  // ---------- Re-exported TOKEN_2022_PROGRAM_ID ----------

  describe("TOKEN_2022_PROGRAM_ID re-export", () => {
    it("should re-export TOKEN_2022_PROGRAM_ID from @solana/spl-token", () => {
      expect(REEXPORTED_TOKEN_2022).to.be.instanceOf(PublicKey);
      expect(REEXPORTED_TOKEN_2022.equals(TOKEN_2022_PROGRAM_ID)).to.be.true;
    });
  });
});
