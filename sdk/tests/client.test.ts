import { describe, it, expect } from "vitest";
import { SSS, SolanaStablecoin } from "../src/client";

describe("SSS client class", () => {
  describe("static factories", () => {
    it("SSS.create is a static function", () => {
      expect(typeof SSS.create).toBe("function");
    });

    it("SSS.createCustom is a static function", () => {
      expect(typeof SSS.createCustom).toBe("function");
    });

    it("SSS.load is a static function", () => {
      expect(typeof SSS.load).toBe("function");
    });
  });

  describe("SolanaStablecoin alias", () => {
    it("is the same class as SSS", () => {
      expect(SolanaStablecoin).toBe(SSS);
    });

    it("has the same static methods", () => {
      expect(SolanaStablecoin.create).toBe(SSS.create);
      expect(SolanaStablecoin.createCustom).toBe(SSS.createCustom);
      expect(SolanaStablecoin.load).toBe(SSS.load);
    });
  });
});
