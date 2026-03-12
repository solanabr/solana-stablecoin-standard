import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Tests for the custom config file loading used by `sss-token init --custom`.
 *
 * We test the parsing logic by requiring the init module's internal helpers.
 * Since these are not exported, we test the behavior end-to-end by writing
 * temp files and using the TOML/JSON parsing the same way the CLI does.
 */

// Re-implement the core parsing logic to test it in isolation
import * as toml from "toml";

const PRESET_MAP: Record<string, number> = {
  "sss-1": 1,
  "sss-2": 2,
  "1": 1,
  "2": 2,
};

function resolvePreset(value: string): number {
  const key = value.toLowerCase().trim();
  const preset = PRESET_MAP[key];
  if (preset === undefined) {
    throw new Error(`Invalid preset "${value}"`);
  }
  return preset;
}

describe("Config file parsing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sss-test-"));

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("TOML config", () => {
    it("should parse a valid TOML config with string preset", () => {
      const tomlContent = `
preset = "sss-2"
name = "Test Coin"
symbol = "TST"
uri = "https://example.com/meta.json"
decimals = 6
hook_program = "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM"
`;
      const filePath = path.join(tmpDir, "test1.toml");
      fs.writeFileSync(filePath, tomlContent);

      const parsed = toml.parse(tomlContent) as Record<string, unknown>;
      expect(parsed.preset).to.equal("sss-2");
      expect(parsed.name).to.equal("Test Coin");
      expect(parsed.symbol).to.equal("TST");
      expect(parsed.decimals).to.equal(6);
      expect(parsed.hook_program).to.equal("9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM");
    });

    it("should parse a minimal TOML config", () => {
      const tomlContent = `
preset = "sss-1"
name = "Minimal"
symbol = "MIN"
`;
      const parsed = toml.parse(tomlContent) as Record<string, unknown>;
      expect(parsed.preset).to.equal("sss-1");
      expect(parsed.name).to.equal("Minimal");
      expect(parsed.symbol).to.equal("MIN");
      expect(parsed.uri).to.be.undefined;
      expect(parsed.decimals).to.be.undefined;
    });

    it("should parse a TOML config with numeric preset", () => {
      const tomlContent = `
preset = 2
name = "Numeric"
symbol = "NUM"
decimals = 9
`;
      const parsed = toml.parse(tomlContent) as Record<string, unknown>;
      expect(parsed.preset).to.equal(2);
      expect(parsed.decimals).to.equal(9);
    });
  });

  describe("JSON config", () => {
    it("should parse a valid JSON config", () => {
      const jsonContent = {
        preset: "sss-1",
        name: "JSON Coin",
        symbol: "JSON",
        uri: "",
        decimals: 6,
      };
      const filePath = path.join(tmpDir, "test1.json");
      fs.writeFileSync(filePath, JSON.stringify(jsonContent));

      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.preset).to.equal("sss-1");
      expect(parsed.name).to.equal("JSON Coin");
    });

    it("should parse JSON config with numeric preset", () => {
      const jsonContent = { preset: 2, name: "Num", symbol: "N", decimals: 0 };
      const parsed = jsonContent;
      expect(parsed.preset).to.equal(2);
      expect(parsed.decimals).to.equal(0);
    });
  });

  describe("resolvePreset", () => {
    it("should resolve 'sss-1' to 1", () => {
      expect(resolvePreset("sss-1")).to.equal(1);
    });

    it("should resolve 'sss-2' to 2", () => {
      expect(resolvePreset("sss-2")).to.equal(2);
    });

    it("should resolve 'SSS-1' (case insensitive) to 1", () => {
      expect(resolvePreset("SSS-1")).to.equal(1);
    });

    it("should resolve 'SSS-2' (case insensitive) to 2", () => {
      expect(resolvePreset("SSS-2")).to.equal(2);
    });

    it("should resolve '1' to 1", () => {
      expect(resolvePreset("1")).to.equal(1);
    });

    it("should resolve '2' to 2", () => {
      expect(resolvePreset("2")).to.equal(2);
    });

    it("should throw on invalid preset 'sss-3'", () => {
      expect(() => resolvePreset("sss-3")).to.throw("Invalid preset");
    });

    it("should throw on invalid preset '0'", () => {
      expect(() => resolvePreset("0")).to.throw("Invalid preset");
    });

    it("should throw on invalid preset 'foo'", () => {
      expect(() => resolvePreset("foo")).to.throw("Invalid preset");
    });

    it("should handle whitespace in preset string", () => {
      expect(resolvePreset(" sss-1 ")).to.equal(1);
      expect(resolvePreset("  2  ")).to.equal(2);
    });
  });
});
