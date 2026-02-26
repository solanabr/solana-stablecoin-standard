import { describe, it, expect } from "vitest";
import * as SDK from "../src/index";

describe("SDK barrel exports", () => {
  it("SSS and SolanaStablecoin are the same class", () => {
    expect(SDK.SSS).toBe(SDK.SolanaStablecoin);
    expect(typeof SDK.SSS).toBe("function");
  });

  it("Presets constant has all three presets", () => {
    expect(SDK.Presets).toEqual({
      SSS_1: "sss-1",
      SSS_2: "sss-2",
      SSS_3: "sss-3",
    });
  });

  describe("instruction builders", () => {
    const builders = [
      "buildInitializeIx",
      "buildMintTokensIx",
      "buildBurnTokensIx",
      "buildFreezeAccountIx",
      "buildThawAccountIx",
      "buildPauseIx",
      "buildUnpauseIx",
      "buildSeizeIx",
      "buildGrantRoleIx",
      "buildRevokeRoleIx",
      "buildTransferAuthorityIx",
      "buildUpdateMinterIx",
      "buildUpdateSupplyCapIx",
      "buildInitializeExtraAccountMetasIx",
      "buildAddToBlacklistIx",
      "buildRemoveFromBlacklistIx",
    ];

    it.each(builders)("exports %s as a function", (name) => {
      expect(typeof (SDK as Record<string, unknown>)[name]).toBe("function");
    });

    it("exports exactly 16 instruction builders", () => {
      expect(builders).toHaveLength(16);
    });
  });

  describe("PDA derivers", () => {
    it("exports deriveConfigPda", () => {
      expect(typeof SDK.deriveConfigPda).toBe("function");
    });
    it("exports deriveRolePda", () => {
      expect(typeof SDK.deriveRolePda).toBe("function");
    });
    it("exports deriveBlacklistPda", () => {
      expect(typeof SDK.deriveBlacklistPda).toBe("function");
    });
  });

  describe("preset creators", () => {
    it("exports createSss1MintTransaction", () => {
      expect(typeof SDK.createSss1MintTransaction).toBe("function");
    });
    it("exports createSss2MintTransaction", () => {
      expect(typeof SDK.createSss2MintTransaction).toBe("function");
    });
    it("exports createSss3MintTransaction", () => {
      expect(typeof SDK.createSss3MintTransaction).toBe("function");
    });
  });

  describe("oracle functions", () => {
    it("exports parsePythPrice", () => {
      expect(typeof SDK.parsePythPrice).toBe("function");
    });
    it("exports fetchPythPrice", () => {
      expect(typeof SDK.fetchPythPrice).toBe("function");
    });
    it("exports usdToTokenAmount", () => {
      expect(typeof SDK.usdToTokenAmount).toBe("function");
    });
    it("exports tokenAmountToUsd", () => {
      expect(typeof SDK.tokenAmountToUsd).toBe("function");
    });
    it("exports buildOracleRemainingAccount", () => {
      expect(typeof SDK.buildOracleRemainingAccount).toBe("function");
    });
    it("exports PYTH_FEEDS", () => {
      expect(SDK.PYTH_FEEDS).toBeDefined();
    });
  });

  describe("confidential", () => {
    it("exports ConfidentialOps", () => {
      expect(typeof SDK.ConfidentialOps).toBe("function");
    });
    it("exports generateTestElGamalKeypair", () => {
      expect(typeof SDK.generateTestElGamalKeypair).toBe("function");
    });
    it("exports generateTestAesKey", () => {
      expect(typeof SDK.generateTestAesKey).toBe("function");
    });
  });

  describe("error classes", () => {
    it("exports SssError", () => {
      expect(typeof SDK.SssError).toBe("function");
    });
    it("exports mapAnchorError", () => {
      expect(typeof SDK.mapAnchorError).toBe("function");
    });
  });

  describe("type maps", () => {
    it("exports ROLE_MAP with 7 roles", () => {
      expect(Object.keys(SDK.ROLE_MAP)).toHaveLength(7);
    });
    it("exports PRESET_MAP with 3 presets", () => {
      expect(Object.keys(SDK.PRESET_MAP)).toHaveLength(3);
    });
    it("exports REVERSE_PRESET_MAP", () => {
      expect(SDK.REVERSE_PRESET_MAP).toBeDefined();
    });
  });
});
