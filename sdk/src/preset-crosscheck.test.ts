import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRESET_CONFIGS, Presets } from "./presets";

describe("preset crosschecks", () => {
  it("keeps SDK preset values aligned with CLI init defaults", () => {
    const cliInit = readFileSync(
      resolve(__dirname, "../../cli/src/commands/init.rs"),
      "utf8",
    );

    expect(cliInit).toContain(
      'Preset::Sss1 => (false, "SSS-1 Stablecoin", "SSS1", false, false, false)',
    );
    expect(cliInit).toContain(
      'Preset::Sss2 => (true, "SSS-2 Stablecoin", "SSS2", true, true, true)',
    );

    expect(PRESET_CONFIGS[Presets.SSS_1]).toMatchObject({
      name: "SSS-1 Stablecoin",
      symbol: "SSS1",
      decimals: 6,
      extensions: {
        permanentDelegate: false,
        transferHook: false,
        defaultAccountFrozen: false,
      },
    });
    expect(PRESET_CONFIGS[Presets.SSS_2]).toMatchObject({
      name: "SSS-2 Stablecoin",
      symbol: "SSS2",
      decimals: 6,
      extensions: {
        permanentDelegate: true,
        transferHook: true,
        defaultAccountFrozen: true,
      },
    });
  });
});
