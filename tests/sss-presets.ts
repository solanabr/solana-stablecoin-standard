import { expect } from "chai";

import { buildPresetConfig } from "../sdk/core/src/presets";
import { Presets } from "../sdk/core/src/types";

describe("SSS preset configuration", () => {
  it("treats SSS-2 as compliance-enabled", () => {
    const config = buildPresetConfig({ preset: Presets.SSS_2 });
    expect(config.extensions.transferHook).to.equal(true);
  });
});

