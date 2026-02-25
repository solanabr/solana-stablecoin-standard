import { describe, it, expect } from "vitest";
import { ROLE_MAP, PRESET_MAP, REVERSE_PRESET_MAP, Presets } from "../src/types";

describe("Type mappings", () => {
  describe("ROLE_MAP", () => {
    it("has correct values matching on-chain Role enum discriminants", () => {
      expect(ROLE_MAP.admin).toBe(0);
      expect(ROLE_MAP.minter).toBe(1);
      expect(ROLE_MAP.freezer).toBe(2);
      expect(ROLE_MAP.pauser).toBe(3);
      expect(ROLE_MAP.burner).toBe(4);
      expect(ROLE_MAP.blacklister).toBe(5);
      expect(ROLE_MAP.seizer).toBe(6);
    });

    it("has exactly seven roles", () => {
      expect(Object.keys(ROLE_MAP)).toHaveLength(7);
    });
  });

  describe("PRESET_MAP", () => {
    it("has correct values matching on-chain preset u8", () => {
      expect(PRESET_MAP["sss-1"]).toBe(1);
      expect(PRESET_MAP["sss-2"]).toBe(2);
      expect(PRESET_MAP["sss-3"]).toBe(3);
    });

    it("has exactly three presets", () => {
      expect(Object.keys(PRESET_MAP)).toHaveLength(3);
    });
  });

  describe("REVERSE_PRESET_MAP", () => {
    it("maps u8 back to preset string", () => {
      expect(REVERSE_PRESET_MAP[1]).toBe("sss-1");
      expect(REVERSE_PRESET_MAP[2]).toBe("sss-2");
      expect(REVERSE_PRESET_MAP[3]).toBe("sss-3");
    });

    it("is consistent with PRESET_MAP", () => {
      for (const [key, value] of Object.entries(PRESET_MAP)) {
        expect(REVERSE_PRESET_MAP[value]).toBe(key);
      }
    });
  });

  describe("Presets", () => {
    it("has SSS_1, SSS_2, SSS_3 constants", () => {
      expect(Presets.SSS_1).toBe("sss-1");
      expect(Presets.SSS_2).toBe("sss-2");
      expect(Presets.SSS_3).toBe("sss-3");
    });
  });
});
