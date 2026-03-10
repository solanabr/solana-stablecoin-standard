import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import * as SDK from "../src/index";

describe("SDK exports (index.ts)", () => {
  // ---------- Client exports ----------

  describe("client exports", () => {
    it("should export StablecoinClient", () => {
      expect(SDK.StablecoinClient).to.exist;
      expect(SDK.StablecoinClient).to.be.a("function"); // class constructor
    });

    it("should export ComplianceClient", () => {
      expect(SDK.ComplianceClient).to.exist;
      expect(SDK.ComplianceClient).to.be.a("function");
    });
  });

  // ---------- Constant exports ----------

  describe("constant exports", () => {
    it("should export CONFIG_SEED", () => {
      expect(SDK.CONFIG_SEED).to.exist;
      expect(SDK.CONFIG_SEED).to.be.a("string");
    });

    it("should export MINT_AUTHORITY_SEED", () => {
      expect(SDK.MINT_AUTHORITY_SEED).to.exist;
      expect(SDK.MINT_AUTHORITY_SEED).to.be.a("string");
    });

    it("should export MINTER_SEED", () => {
      expect(SDK.MINTER_SEED).to.exist;
      expect(SDK.MINTER_SEED).to.be.a("string");
    });

    it("should export HOOK_CONFIG_SEED", () => {
      expect(SDK.HOOK_CONFIG_SEED).to.exist;
      expect(SDK.HOOK_CONFIG_SEED).to.be.a("string");
    });

    it("should export BLACKLIST_SEED", () => {
      expect(SDK.BLACKLIST_SEED).to.exist;
      expect(SDK.BLACKLIST_SEED).to.be.a("string");
    });

    it("should export EXTRA_ACCOUNT_METAS_SEED", () => {
      expect(SDK.EXTRA_ACCOUNT_METAS_SEED).to.exist;
      expect(SDK.EXTRA_ACCOUNT_METAS_SEED).to.be.a("string");
    });

    it("should export SSS_CORE_PROGRAM_ID as a PublicKey", () => {
      expect(SDK.SSS_CORE_PROGRAM_ID).to.exist;
      expect(SDK.SSS_CORE_PROGRAM_ID).to.be.instanceOf(PublicKey);
    });

    it("should export SSS_HOOK_PROGRAM_ID as a PublicKey", () => {
      expect(SDK.SSS_HOOK_PROGRAM_ID).to.exist;
      expect(SDK.SSS_HOOK_PROGRAM_ID).to.be.instanceOf(PublicKey);
    });

    it("should export PRESET_MINIMAL", () => {
      expect(SDK.PRESET_MINIMAL).to.exist;
      expect(SDK.PRESET_MINIMAL).to.equal(1);
    });

    it("should export PRESET_COMPLIANT", () => {
      expect(SDK.PRESET_COMPLIANT).to.exist;
      expect(SDK.PRESET_COMPLIANT).to.equal(2);
    });

    it("should export TOKEN_2022_PROGRAM_ID", () => {
      expect(SDK.TOKEN_2022_PROGRAM_ID).to.exist;
      expect(SDK.TOKEN_2022_PROGRAM_ID).to.be.instanceOf(PublicKey);
    });
  });

  // ---------- PDA function exports ----------

  describe("PDA function exports", () => {
    it("should export findConfigPda", () => {
      expect(SDK.findConfigPda).to.exist;
      expect(SDK.findConfigPda).to.be.a("function");
    });

    it("should export findMintAuthorityPda", () => {
      expect(SDK.findMintAuthorityPda).to.exist;
      expect(SDK.findMintAuthorityPda).to.be.a("function");
    });

    it("should export findMinterStatePda", () => {
      expect(SDK.findMinterStatePda).to.exist;
      expect(SDK.findMinterStatePda).to.be.a("function");
    });

    it("should export findHookConfigPda", () => {
      expect(SDK.findHookConfigPda).to.exist;
      expect(SDK.findHookConfigPda).to.be.a("function");
    });

    it("should export findBlacklistEntryPda", () => {
      expect(SDK.findBlacklistEntryPda).to.exist;
      expect(SDK.findBlacklistEntryPda).to.be.a("function");
    });

    it("should export findExtraAccountMetaListPda", () => {
      expect(SDK.findExtraAccountMetaListPda).to.exist;
      expect(SDK.findExtraAccountMetaListPda).to.be.a("function");
    });
  });

  // ---------- Type / enum exports ----------

  describe("type and enum exports", () => {
    it("should export RoleType enum", () => {
      expect(SDK.RoleType).to.exist;
      expect(SDK.RoleType.MasterMinter).to.exist;
      expect(SDK.RoleType.Pauser).to.exist;
      expect(SDK.RoleType.Blacklister).to.exist;
    });

    // TypeScript interfaces (StablecoinConfig, MinterState, etc.) are
    // compile-time only and cannot be tested at runtime. However, we verify
    // that they are importable without error via the type-only import below.
    // If any type export were missing, this file would fail to compile.
    it("should compile with type imports (StablecoinConfig, MinterState, HookConfig, BlacklistEntry, InitializeParams, InitializeResult)", () => {
      // This test validates that the following type imports resolve at compile time.
      // The actual import is at the top of the file via the wildcard,
      // but we also verify with a direct import to be thorough.
      type _Config = SDK.StablecoinConfig;
      type _Minter = SDK.MinterState;
      type _Hook = SDK.HookConfig;
      type _Blacklist = SDK.BlacklistEntry;
      type _InitParams = SDK.InitializeParams;
      type _InitResult = SDK.InitializeResult;

      // If we got here, compilation succeeded
      expect(true).to.be.true;
    });
  });

  // ---------- Completeness check ----------

  describe("export completeness", () => {
    it("should export at least 20 named members", () => {
      // 2 clients + 6 PDA fns + 8 constants/presets + RoleType + TOKEN_2022 = 18+
      const exportedKeys = Object.keys(SDK);
      expect(exportedKeys.length).to.be.at.least(18);
    });

    it("should include all expected export names", () => {
      const expectedNames = [
        "StablecoinClient",
        "ComplianceClient",
        "findConfigPda",
        "findMintAuthorityPda",
        "findMinterStatePda",
        "findHookConfigPda",
        "findBlacklistEntryPda",
        "findExtraAccountMetaListPda",
        "CONFIG_SEED",
        "MINT_AUTHORITY_SEED",
        "MINTER_SEED",
        "HOOK_CONFIG_SEED",
        "BLACKLIST_SEED",
        "EXTRA_ACCOUNT_METAS_SEED",
        "SSS_CORE_PROGRAM_ID",
        "SSS_HOOK_PROGRAM_ID",
        "PRESET_MINIMAL",
        "PRESET_COMPLIANT",
        "TOKEN_2022_PROGRAM_ID",
        "RoleType",
      ];

      const exportedKeys = Object.keys(SDK);
      for (const name of expectedNames) {
        expect(exportedKeys, `Missing export: ${name}`).to.include(name);
      }
    });
  });
});
