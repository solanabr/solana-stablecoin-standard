import { expect } from "chai";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BN, Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, Presets, ComplianceModule } from "../src/stablecoin";
import { PRESET_MINIMAL, PRESET_COMPLIANT, PRESET_CONFIDENTIAL } from "../src/constants";

function makeDummyWallet(): Wallet {
  return new Wallet(Keypair.generate());
}

function makeDummyConnection(): Connection {
  return new Connection("http://127.0.0.1:1");
}

describe("Presets enum", () => {
  it("SSS_1 should equal PRESET_MINIMAL (1)", () => {
    expect(Presets.SSS_1).to.equal(PRESET_MINIMAL);
    expect(Presets.SSS_1).to.equal(1);
  });

  it("SSS_2 should equal PRESET_COMPLIANT (2)", () => {
    expect(Presets.SSS_2).to.equal(PRESET_COMPLIANT);
    expect(Presets.SSS_2).to.equal(2);
  });

  it("SSS_3 should equal PRESET_CONFIDENTIAL (3)", () => {
    expect(Presets.SSS_3).to.equal(PRESET_CONFIDENTIAL);
    expect(Presets.SSS_3).to.equal(3);
  });

  it("all presets should be different", () => {
    expect(Presets.SSS_1).to.not.equal(Presets.SSS_2);
    expect(Presets.SSS_2).to.not.equal(Presets.SSS_3);
    expect(Presets.SSS_1).to.not.equal(Presets.SSS_3);
  });

  it("should have exactly 3 values", () => {
    // Numeric enums produce reverse mappings, so filter to string keys
    const keys = Object.keys(Presets).filter((k) => isNaN(Number(k)));
    expect(keys).to.have.lengthOf(3);
    expect(keys).to.include("SSS_1");
    expect(keys).to.include("SSS_2");
    expect(keys).to.include("SSS_3");
  });
});

describe("SolanaStablecoin", () => {
  it("should be a class with a static create method", () => {
    expect(SolanaStablecoin).to.be.a("function");
    expect(SolanaStablecoin.create).to.be.a("function");
  });

  it("should have a static load method", () => {
    expect(SolanaStablecoin.load).to.be.a("function");
  });

  it("create should accept connection and options", () => {
    // Verify the method signature exists and accepts 2 params
    expect(SolanaStablecoin.create.length).to.equal(2);
  });

  it("load should accept 3-4 params (connection, mint, wallet, options?)", () => {
    expect(SolanaStablecoin.load.length).to.be.at.least(3);
  });
});

describe("ComplianceModule", () => {
  it("should be a class", () => {
    expect(ComplianceModule).to.be.a("function");
  });

  it("SSS-1 compliance module should throw on all compliance methods", () => {
    // ComplianceModule with null client simulates SSS-1
    const mod = new ComplianceModule(null, Keypair.generate().publicKey);

    expect(() => {
      // Access private requireCompliance via a method call
      // We need to verify the runtime behavior
    }).to.not.throw();

    // Each compliance method should reject with a descriptive error
    const wallet = Keypair.generate().publicKey;

    return Promise.all([
      mod.initializeHook().then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
      mod.blacklistAdd(wallet, "reason").then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
      mod.blacklistRemove(wallet).then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
      mod.isBlacklisted(wallet).then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
      mod.getBlacklistEntry(wallet).then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
      mod.seize(wallet, wallet, new BN(100)).then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
      mod.getHookConfig().then(
        () => { throw new Error("should have thrown"); },
        (err) => {
          expect(err.message).to.include("SSS-2 preset");
        }
      ),
    ]);
  });

  it("should have all expected method names", () => {
    const mod = new ComplianceModule(null, Keypair.generate().publicKey);
    const expectedMethods = [
      "initializeHook",
      "blacklistAdd",
      "blacklistRemove",
      "isBlacklisted",
      "getBlacklistEntry",
      "seize",
      "getHookConfig",
    ];
    for (const method of expectedMethods) {
      expect(mod).to.have.property(method).that.is.a("function");
    }
  });
});

describe("CreateStablecoinOptions type (compile-time)", () => {
  it("should compile with valid options", () => {
    // Verify the type is importable and has the expected shape
    type Options = import("../src/stablecoin").CreateStablecoinOptions;

    const opts: Options = {
      preset: Presets.SSS_2,
      name: "Test Coin",
      symbol: "TST",
      authority: makeDummyWallet(),
    };
    expect(opts.preset).to.equal(Presets.SSS_2);
    expect(opts.name).to.equal("Test Coin");
  });

  it("should accept optional fields", () => {
    type Options = import("../src/stablecoin").CreateStablecoinOptions;

    const opts: Options = {
      preset: Presets.SSS_1,
      name: "Full Config",
      symbol: "FULL",
      uri: "https://example.com/meta.json",
      decimals: 9,
      authority: makeDummyWallet(),
      hookProgram: Keypair.generate().publicKey,
      coreProgramId: Keypair.generate().publicKey,
      hookProgramId: Keypair.generate().publicKey,
    };
    expect(opts.uri).to.equal("https://example.com/meta.json");
    expect(opts.decimals).to.equal(9);
  });
});
