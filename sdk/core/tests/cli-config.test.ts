import { expect } from "chai";

import {
  coerceCliConfigValue,
  isCliConfigKey,
  normalizeCliConfig
} from "../src/cli/config";

describe("cli config helpers", () => {
  it("recognizes supported config keys", () => {
    expect(isCliConfigKey("rpcUrl")).to.equal(true);
    expect(isCliConfigKey("wat")).to.equal(false);
  });

  it("coerces output format", () => {
    expect(coerceCliConfigValue("output", "json")).to.equal("json");
  });

  it("normalizes defaults and preserves validated overrides", () => {
    const normalized = normalizeCliConfig({
      cluster: "devnet",
      output: "json"
    });

    expect(normalized.cluster).to.equal("devnet");
    expect(normalized.output).to.equal("json");
    expect(normalized.rpcUrl).to.be.a("string");
  });
});

