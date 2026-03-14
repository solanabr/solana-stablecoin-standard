import { expect } from "chai";

import { SolanaStablecoin } from "../src/client";
import { ComplianceApi } from "../src/compliance";
import { RolesApi } from "../src/roles";
import { buildPresetConfig } from "../src/presets";
import { Presets } from "../src/types";

describe("SolanaStablecoin client", () => {
  describe("buildPresetConfig", () => {
    it("SSS-1 has compliance disabled", () => {
      const config = buildPresetConfig({ preset: Presets.SSS_1 });
      expect(config.extensions.permanentDelegate).to.equal(false);
      expect(config.extensions.transferHook).to.equal(false);
      expect(config.extensions.defaultAccountFrozen).to.equal(false);
      expect(config.extensions.confidentialTransfers).to.equal(false);
    });

    it("SSS-2 has compliance enabled", () => {
      const config = buildPresetConfig({ preset: Presets.SSS_2 });
      expect(config.extensions.permanentDelegate).to.equal(true);
      expect(config.extensions.transferHook).to.equal(true);
      expect(config.extensions.defaultAccountFrozen).to.equal(true);
      expect(config.extensions.confidentialTransfers).to.equal(false);
    });

    it("SSS-3 has confidential transfers", () => {
      const config = buildPresetConfig({ preset: Presets.SSS_3 });
      expect(config.extensions.confidentialTransfers).to.equal(true);
      expect(config.extensions.permanentDelegate).to.equal(false);
    });

    it("uses default values when not specified", () => {
      const config = buildPresetConfig({});
      expect(config.name).to.equal("My Stablecoin");
      expect(config.symbol).to.equal("MYST");
      expect(config.decimals).to.equal(6);
      expect(config.preset).to.equal(Presets.SSS_1);
    });

    it("allows custom overrides", () => {
      const config = buildPresetConfig({
        preset: Presets.SSS_1,
        name: "Test USD",
        symbol: "TUSD",
        decimals: 9,
        extensions: { permanentDelegate: true },
      });
      expect(config.name).to.equal("Test USD");
      expect(config.symbol).to.equal("TUSD");
      expect(config.decimals).to.equal(9);
      expect(config.extensions.permanentDelegate).to.equal(true);
    });
  });

  describe("exports", () => {
    it("SolanaStablecoin class is exported", () => {
      expect(SolanaStablecoin).to.be.a("function");
    });

    it("ComplianceApi class is exported", () => {
      expect(ComplianceApi).to.be.a("function");
    });

    it("RolesApi class is exported", () => {
      expect(RolesApi).to.be.a("function");
    });
  });
});
