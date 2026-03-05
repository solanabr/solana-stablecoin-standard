import { assert } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { Preset, resolvePreset, SSS1_CONFIG, SSS2_CONFIG } from "../../sdk/src/presets";
import {
  findStatePDA,
  findMintAuthorityPDA,
  findFreezeAuthorityPDA,
  findPermanentDelegatePDA,
  findMinterInfoPDA,
  findBlacklistEntryPDA,
  findExtraAccountMetaListPDA,
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "../../sdk/src/utils";

describe("Preset Resolution", () => {
  it("SSS-1 should have compliance disabled", () => {
    const cfg = resolvePreset(Preset.SSS_1);
    assert.isFalse(cfg.enablePermanentDelegate);
    assert.isFalse(cfg.enableTransferHook);
  });

  it("SSS-2 should have compliance enabled", () => {
    const cfg = resolvePreset(Preset.SSS_2);
    assert.isTrue(cfg.enablePermanentDelegate);
    assert.isTrue(cfg.enableTransferHook);
  });

  it("Custom preset should apply overrides", () => {
    const cfg = resolvePreset(Preset.SSS_1, {
      enableTransferHook: true,
    });
    // SSS-1 base has transferHook=false, override sets it true
    assert.isTrue(cfg.enableTransferHook);
    assert.isFalse(cfg.enablePermanentDelegate);
  });

  it("CUSTOM mode returns overrides only", () => {
    const cfg = resolvePreset(Preset.CUSTOM, {
      enablePermanentDelegate: true,
    });
    assert.isTrue(cfg.enablePermanentDelegate);
    assert.isUndefined(cfg.enableTransferHook);
  });
});

describe("PDA Derivation", () => {
  const mintKey = Keypair.generate().publicKey;

  it("findStatePDA should derive deterministically", () => {
    const [pda1] = findStatePDA(mintKey);
    const [pda2] = findStatePDA(mintKey);
    assert.equal(pda1.toBase58(), pda2.toBase58());
  });

  it("findStatePDA for different mints should differ", () => {
    const mint2 = Keypair.generate().publicKey;
    const [pda1] = findStatePDA(mintKey);
    const [pda2] = findStatePDA(mint2);
    assert.notEqual(pda1.toBase58(), pda2.toBase58());
  });

  it("findMintAuthorityPDA is a valid public key", () => {
    const [statePDA] = findStatePDA(mintKey);
    const [mintAuth] = findMintAuthorityPDA(statePDA);
    assert.doesNotThrow(() => new PublicKey(mintAuth.toBytes()));
  });

  it("findBlacklistEntryPDA differs by address", () => {
    const [statePDA] = findStatePDA(mintKey);
    const addr1 = Keypair.generate().publicKey;
    const addr2 = Keypair.generate().publicKey;
    const [pda1] = findBlacklistEntryPDA(statePDA, addr1);
    const [pda2] = findBlacklistEntryPDA(statePDA, addr2);
    assert.notEqual(pda1.toBase58(), pda2.toBase58());
  });

  it("All PDA seeds produce valid off-curve addresses", () => {
    const [statePDA] = findStatePDA(mintKey);
    const minterKey = Keypair.generate().publicKey;
    const [minterInfo] = findMinterInfoPDA(statePDA, minterKey);
    // Off-curve check — PublicKey.isOnCurve should return false
    assert.isFalse(PublicKey.isOnCurve(minterInfo.toBytes()));
  });
});

describe("SSS-2 feature gating (SDK layer)", () => {
  // These tests verify SDK throws BEFORE hitting the network
  // for SSS-1 instances calling SSS-2 methods

  it("ComplianceModule.blacklistAdd should throw if not SSS-2", async () => {
    // We mock a StablecoinConfig with compliance disabled
    const mockConfig = {
      name: "Test",
      symbol: "TEST",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: false, // SSS-1
      enableTransferHook: false,
      defaultAccountFrozen: false,
    };

    // Import ComplianceModule directly for unit testing
    const { ComplianceModule } = await import("../../sdk/src/index");
    const mockSDK = { config: mockConfig } as any;
    const compliance = new ComplianceModule(mockSDK, {} as any);

    try {
      await compliance.blacklistAdd(Keypair.generate().publicKey, "test");
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message, "SSS-2 compliance is not enabled");
    }
  });

  it("ComplianceModule.seize should throw if not SSS-2", async () => {
    const mockConfig = {
      name: "Test",
      symbol: "TEST",
      uri: "",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
    };

    const { ComplianceModule } = await import("../../sdk/src/index");
    const mockSDK = { config: mockConfig } as any;
    const compliance = new ComplianceModule(mockSDK, {} as any);

    try {
      await compliance.seize(
        Keypair.generate().publicKey,
        Keypair.generate().publicKey
      );
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message, "SSS-2 compliance is not enabled");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Program ID Constants", () => {
  it("SSS_TOKEN_PROGRAM_ID should be a valid public key", () => {
    assert.doesNotThrow(() => new PublicKey(SSS_TOKEN_PROGRAM_ID));
  });

  it("TRANSFER_HOOK_PROGRAM_ID should differ from SSS_TOKEN_PROGRAM_ID", () => {
    assert.notEqual(
      SSS_TOKEN_PROGRAM_ID.toBase58(),
      TRANSFER_HOOK_PROGRAM_ID.toBase58()
    );
  });

  it("TRANSFER_HOOK_PROGRAM_ID should be a valid public key", () => {
    assert.doesNotThrow(() => new PublicKey(TRANSFER_HOOK_PROGRAM_ID));
  });
});

describe("PDA Derivation — Extended", () => {
  const mintKey = Keypair.generate().publicKey;
  const [statePDA] = findStatePDA(mintKey);

  it("findFreezeAuthorityPDA returns off-curve address", () => {
    const [freezeAuth] = findFreezeAuthorityPDA(statePDA);
    assert.isFalse(PublicKey.isOnCurve(freezeAuth.toBytes()));
  });

  it("findPermanentDelegatePDA returns off-curve address", () => {
    const [permDelegate] = findPermanentDelegatePDA(statePDA);
    assert.isFalse(PublicKey.isOnCurve(permDelegate.toBytes()));
  });

  it("findExtraAccountMetaListPDA returns off-curve address", () => {
    const [extraMeta] = findExtraAccountMetaListPDA(mintKey);
    assert.isFalse(PublicKey.isOnCurve(extraMeta.toBytes()));
  });

  it("findMinterInfoPDA is unique per minter + state", () => {
    const m1 = Keypair.generate().publicKey;
    const m2 = Keypair.generate().publicKey;
    const [pda1] = findMinterInfoPDA(statePDA, m1);
    const [pda2] = findMinterInfoPDA(statePDA, m2);
    assert.notEqual(pda1.toBase58(), pda2.toBase58());
  });

  it("findBlacklistEntryPDA same address + different state yields different PDA", () => {
    const mint2 = Keypair.generate().publicKey;
    const [state2] = findStatePDA(mint2);
    const addr = Keypair.generate().publicKey;
    const [pda1] = findBlacklistEntryPDA(statePDA, addr);
    const [pda2] = findBlacklistEntryPDA(state2, addr);
    assert.notEqual(pda1.toBase58(), pda2.toBase58());
  });
});

describe("Preset Configs", () => {
  it("SSS1_CONFIG should have expected defaults", () => {
    assert.equal(SSS1_CONFIG.decimals, 6);
    assert.isFalse(SSS1_CONFIG.enablePermanentDelegate);
    assert.isFalse(SSS1_CONFIG.enableTransferHook);
    assert.isFalse(SSS1_CONFIG.defaultAccountFrozen ?? false);
  });

  it("SSS2_CONFIG should enable compliance features", () => {
    assert.equal(SSS2_CONFIG.decimals, 6);
    assert.isTrue(SSS2_CONFIG.enablePermanentDelegate);
    assert.isTrue(SSS2_CONFIG.enableTransferHook);
  });

  it("resolvePreset should not mutate the base config", () => {
    const before = { ...SSS1_CONFIG };
    resolvePreset(Preset.SSS_1, { enableTransferHook: true });
    assert.deepEqual(SSS1_CONFIG, before);
  });
});