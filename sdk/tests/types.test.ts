import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  RoleType,
} from "../src/types";
import type {
  StablecoinConfig,
  MinterState,
  HookConfig,
  BlacklistEntry,
  InitializeParams,
  InitializeResult,
} from "../src/types";

describe("Type definitions", () => {
  // ---------- StablecoinConfig ----------

  describe("StablecoinConfig", () => {
    it("should be instantiable with all required fields", () => {
      const config: StablecoinConfig = {
        mint: Keypair.generate().publicKey,
        preset: 1,
        authority: Keypair.generate().publicKey,
        pendingAuthority: PublicKey.default,
        masterMinter: Keypair.generate().publicKey,
        pauser: Keypair.generate().publicKey,
        blacklister: Keypair.generate().publicKey,
        paused: false,
        totalMinted: new BN(0),
        totalBurned: new BN(0),
        bump: 255,
        mintAuthorityBump: 254,
      };

      expect(config.mint).to.be.instanceOf(PublicKey);
      expect(config.preset).to.be.a("number");
      expect(config.authority).to.be.instanceOf(PublicKey);
      expect(config.pendingAuthority).to.be.instanceOf(PublicKey);
      expect(config.masterMinter).to.be.instanceOf(PublicKey);
      expect(config.pauser).to.be.instanceOf(PublicKey);
      expect(config.blacklister).to.be.instanceOf(PublicKey);
      expect(config.paused).to.be.a("boolean");
      expect(config.totalMinted).to.be.instanceOf(BN);
      expect(config.totalBurned).to.be.instanceOf(BN);
      expect(config.bump).to.be.a("number");
      expect(config.mintAuthorityBump).to.be.a("number");
    });

    it("should support preset value 1 (SSS-1 Minimal)", () => {
      const config: StablecoinConfig = {
        mint: Keypair.generate().publicKey,
        preset: 1,
        authority: Keypair.generate().publicKey,
        pendingAuthority: PublicKey.default,
        masterMinter: Keypair.generate().publicKey,
        pauser: Keypair.generate().publicKey,
        blacklister: Keypair.generate().publicKey,
        paused: false,
        totalMinted: new BN(0),
        totalBurned: new BN(0),
        bump: 255,
        mintAuthorityBump: 254,
      };
      expect(config.preset).to.equal(1);
    });

    it("should support preset value 2 (SSS-2 Compliant)", () => {
      const config: StablecoinConfig = {
        mint: Keypair.generate().publicKey,
        preset: 2,
        authority: Keypair.generate().publicKey,
        pendingAuthority: PublicKey.default,
        masterMinter: Keypair.generate().publicKey,
        pauser: Keypair.generate().publicKey,
        blacklister: Keypair.generate().publicKey,
        paused: false,
        totalMinted: new BN(1_000_000),
        totalBurned: new BN(500_000),
        bump: 253,
        mintAuthorityBump: 252,
      };
      expect(config.preset).to.equal(2);
      expect(config.totalMinted.toNumber()).to.equal(1_000_000);
      expect(config.totalBurned.toNumber()).to.equal(500_000);
    });
  });

  // ---------- MinterState ----------

  describe("MinterState", () => {
    it("should be instantiable with all required fields", () => {
      const state: MinterState = {
        config: Keypair.generate().publicKey,
        minter: Keypair.generate().publicKey,
        quota: new BN(100_000),
        mintedAmount: new BN(50_000),
        enabled: true,
        bump: 250,
      };

      expect(state.config).to.be.instanceOf(PublicKey);
      expect(state.minter).to.be.instanceOf(PublicKey);
      expect(state.quota).to.be.instanceOf(BN);
      expect(state.mintedAmount).to.be.instanceOf(BN);
      expect(state.enabled).to.be.a("boolean");
      expect(state.bump).to.be.a("number");
    });

    it("should track enabled/disabled status", () => {
      const enabled: MinterState = {
        config: Keypair.generate().publicKey,
        minter: Keypair.generate().publicKey,
        quota: new BN(100_000),
        mintedAmount: new BN(0),
        enabled: true,
        bump: 250,
      };
      expect(enabled.enabled).to.be.true;

      const disabled: MinterState = {
        config: Keypair.generate().publicKey,
        minter: Keypair.generate().publicKey,
        quota: new BN(100_000),
        mintedAmount: new BN(0),
        enabled: false,
        bump: 250,
      };
      expect(disabled.enabled).to.be.false;
    });

    it("should support BN values for quota and mintedAmount", () => {
      const state: MinterState = {
        config: Keypair.generate().publicKey,
        minter: Keypair.generate().publicKey,
        quota: new BN("18446744073709551615"), // u64 max
        mintedAmount: new BN("9223372036854775807"), // large value
        enabled: true,
        bump: 248,
      };
      expect(state.quota.toString()).to.equal("18446744073709551615");
      expect(state.mintedAmount.toString()).to.equal("9223372036854775807");
    });
  });

  // ---------- HookConfig ----------

  describe("HookConfig", () => {
    it("should be instantiable with all required fields", () => {
      const hookConfig: HookConfig = {
        mint: Keypair.generate().publicKey,
        stablecoinConfig: Keypair.generate().publicKey,
        coreProgram: Keypair.generate().publicKey,
        bump: 245,
      };

      expect(hookConfig.mint).to.be.instanceOf(PublicKey);
      expect(hookConfig.stablecoinConfig).to.be.instanceOf(PublicKey);
      expect(hookConfig.coreProgram).to.be.instanceOf(PublicKey);
      expect(hookConfig.bump).to.be.a("number");
    });

    it("should reference the correct relationship between mint, config, and program", () => {
      const mint = Keypair.generate().publicKey;
      const stablecoinConfig = Keypair.generate().publicKey;
      const coreProgram = Keypair.generate().publicKey;

      const hookConfig: HookConfig = {
        mint,
        stablecoinConfig,
        coreProgram,
        bump: 244,
      };

      expect(hookConfig.mint.equals(mint)).to.be.true;
      expect(hookConfig.stablecoinConfig.equals(stablecoinConfig)).to.be.true;
      expect(hookConfig.coreProgram.equals(coreProgram)).to.be.true;
    });
  });

  // ---------- BlacklistEntry ----------

  describe("BlacklistEntry", () => {
    it("should be instantiable with all required fields", () => {
      const entry: BlacklistEntry = {
        mint: Keypair.generate().publicKey,
        wallet: Keypair.generate().publicKey,
        blacklisted: true,
        reason: "Sanctions compliance",
        blacklistedAt: new BN(1700000000),
        blacklistedBy: Keypair.generate().publicKey,
        bump: 240,
      };

      expect(entry.mint).to.be.instanceOf(PublicKey);
      expect(entry.wallet).to.be.instanceOf(PublicKey);
      expect(entry.blacklisted).to.be.a("boolean");
      expect(entry.reason).to.be.a("string");
      expect(entry.blacklistedAt).to.be.instanceOf(BN);
      expect(entry.blacklistedBy).to.be.instanceOf(PublicKey);
      expect(entry.bump).to.be.a("number");
    });

    it("should support blacklisted true/false states", () => {
      const active: BlacklistEntry = {
        mint: Keypair.generate().publicKey,
        wallet: Keypair.generate().publicKey,
        blacklisted: true,
        reason: "Fraud detected",
        blacklistedAt: new BN(1700000000),
        blacklistedBy: Keypair.generate().publicKey,
        bump: 239,
      };
      expect(active.blacklisted).to.be.true;

      const removed: BlacklistEntry = {
        mint: Keypair.generate().publicKey,
        wallet: Keypair.generate().publicKey,
        blacklisted: false,
        reason: "Cleared",
        blacklistedAt: new BN(1700000000),
        blacklistedBy: Keypair.generate().publicKey,
        bump: 238,
      };
      expect(removed.blacklisted).to.be.false;
    });

    it("should store a reason string", () => {
      const entry: BlacklistEntry = {
        mint: Keypair.generate().publicKey,
        wallet: Keypair.generate().publicKey,
        blacklisted: true,
        reason: "OFAC sanctions list match",
        blacklistedAt: new BN(1700000000),
        blacklistedBy: Keypair.generate().publicKey,
        bump: 237,
      };
      expect(entry.reason).to.equal("OFAC sanctions list match");
    });
  });

  // ---------- InitializeParams ----------

  describe("InitializeParams", () => {
    it("should be instantiable with all required fields", () => {
      const params: InitializeParams = {
        preset: 1,
        name: "USD Coin",
        symbol: "USDC",
        uri: "https://example.com/metadata.json",
        decimals: 6,
      };

      expect(params.preset).to.be.a("number");
      expect(params.name).to.be.a("string");
      expect(params.symbol).to.be.a("string");
      expect(params.uri).to.be.a("string");
      expect(params.decimals).to.be.a("number");
    });

    it("should accept various valid decimal values (0-9)", () => {
      for (const decimals of [0, 2, 6, 9]) {
        const params: InitializeParams = {
          preset: 1,
          name: "Test Coin",
          symbol: "TST",
          uri: "https://example.com/meta.json",
          decimals,
        };
        expect(params.decimals).to.equal(decimals);
      }
    });

    it("should accept both preset values", () => {
      const minimal: InitializeParams = {
        preset: 1,
        name: "Minimal Coin",
        symbol: "MIN",
        uri: "",
        decimals: 6,
      };
      expect(minimal.preset).to.equal(1);

      const compliant: InitializeParams = {
        preset: 2,
        name: "Compliant Coin",
        symbol: "CMP",
        uri: "https://example.com/meta.json",
        decimals: 6,
      };
      expect(compliant.preset).to.equal(2);
    });
  });

  // ---------- InitializeResult ----------

  describe("InitializeResult", () => {
    it("should be instantiable with all required fields", () => {
      const result: InitializeResult = {
        mint: Keypair.generate().publicKey,
        config: Keypair.generate().publicKey,
        txSig: "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW",
      };

      expect(result.mint).to.be.instanceOf(PublicKey);
      expect(result.config).to.be.instanceOf(PublicKey);
      expect(result.txSig).to.be.a("string");
      expect(result.txSig.length).to.be.greaterThan(0);
    });
  });

  // ---------- RoleType enum ----------

  describe("RoleType enum", () => {
    it("should have a MasterMinter value", () => {
      expect(RoleType.MasterMinter).to.equal("MasterMinter");
    });

    it("should have a Pauser value", () => {
      expect(RoleType.Pauser).to.equal("Pauser");
    });

    it("should have a Blacklister value", () => {
      expect(RoleType.Blacklister).to.equal("Blacklister");
    });

    it("should have exactly 3 values", () => {
      // String enums in TS do not produce reverse mappings,
      // so Object.keys gives exactly the member names.
      const keys = Object.keys(RoleType);
      expect(keys).to.have.lengthOf(3);
    });

    it("should contain all expected keys", () => {
      const keys = Object.keys(RoleType);
      expect(keys).to.include("MasterMinter");
      expect(keys).to.include("Pauser");
      expect(keys).to.include("Blacklister");
    });

    it("each value should be a unique string", () => {
      const values = Object.values(RoleType);
      const uniqueSet = new Set(values);
      expect(uniqueSet.size).to.equal(values.length);
    });
  });
});
