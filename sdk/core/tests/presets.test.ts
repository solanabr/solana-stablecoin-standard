import { expect } from "chai";

import { buildPresetConfig } from "../src/presets";
import { Presets } from "../src/types";

describe("preset config", () => {
  it("builds SSS-1 defaults", () => {
    const config = buildPresetConfig({ preset: Presets.SSS_1 });

    expect(config.extensions.permanentDelegate).to.equal(false);
    expect(config.extensions.transferHook).to.equal(false);
    expect(config.decimals).to.equal(6);
  });

  it("builds SSS-2 compliance defaults", () => {
    const config = buildPresetConfig({ preset: Presets.SSS_2 });

    expect(config.extensions.permanentDelegate).to.equal(true);
    expect(config.extensions.transferHook).to.equal(true);
    expect(config.extensions.defaultAccountFrozen).to.equal(true);
  });
});

