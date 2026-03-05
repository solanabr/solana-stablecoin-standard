"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const web3_js_1 = require("@solana/web3.js");
const presets_1 = require("../../sdk/src/presets");
const utils_1 = require("../../sdk/src/utils");
describe("Preset Resolution", () => {
    it("SSS-1 should have compliance disabled", () => {
        const cfg = (0, presets_1.resolvePreset)(presets_1.Preset.SSS_1);
        chai_1.assert.isFalse(cfg.enablePermanentDelegate);
        chai_1.assert.isFalse(cfg.enableTransferHook);
    });
    it("SSS-2 should have compliance enabled", () => {
        const cfg = (0, presets_1.resolvePreset)(presets_1.Preset.SSS_2);
        chai_1.assert.isTrue(cfg.enablePermanentDelegate);
        chai_1.assert.isTrue(cfg.enableTransferHook);
    });
    it("Custom preset should apply overrides", () => {
        const cfg = (0, presets_1.resolvePreset)(presets_1.Preset.SSS_1, {
            enableTransferHook: true,
        });
        // SSS-1 base has transferHook=false, override sets it true
        chai_1.assert.isTrue(cfg.enableTransferHook);
        chai_1.assert.isFalse(cfg.enablePermanentDelegate);
    });
    it("CUSTOM mode returns overrides only", () => {
        const cfg = (0, presets_1.resolvePreset)(presets_1.Preset.CUSTOM, {
            enablePermanentDelegate: true,
        });
        chai_1.assert.isTrue(cfg.enablePermanentDelegate);
        chai_1.assert.isUndefined(cfg.enableTransferHook);
    });
});
describe("PDA Derivation", () => {
    const mintKey = web3_js_1.Keypair.generate().publicKey;
    it("findStatePDA should derive deterministically", () => {
        const [pda1] = (0, utils_1.findStatePDA)(mintKey);
        const [pda2] = (0, utils_1.findStatePDA)(mintKey);
        chai_1.assert.equal(pda1.toBase58(), pda2.toBase58());
    });
    it("findStatePDA for different mints should differ", () => {
        const mint2 = web3_js_1.Keypair.generate().publicKey;
        const [pda1] = (0, utils_1.findStatePDA)(mintKey);
        const [pda2] = (0, utils_1.findStatePDA)(mint2);
        chai_1.assert.notEqual(pda1.toBase58(), pda2.toBase58());
    });
    it("findMintAuthorityPDA is a valid public key", () => {
        const [statePDA] = (0, utils_1.findStatePDA)(mintKey);
        const [mintAuth] = (0, utils_1.findMintAuthorityPDA)(statePDA);
        chai_1.assert.doesNotThrow(() => new web3_js_1.PublicKey(mintAuth.toBytes()));
    });
    it("findBlacklistEntryPDA differs by address", () => {
        const [statePDA] = (0, utils_1.findStatePDA)(mintKey);
        const addr1 = web3_js_1.Keypair.generate().publicKey;
        const addr2 = web3_js_1.Keypair.generate().publicKey;
        const [pda1] = (0, utils_1.findBlacklistEntryPDA)(statePDA, addr1);
        const [pda2] = (0, utils_1.findBlacklistEntryPDA)(statePDA, addr2);
        chai_1.assert.notEqual(pda1.toBase58(), pda2.toBase58());
    });
    it("All PDA seeds produce valid off-curve addresses", () => {
        const [statePDA] = (0, utils_1.findStatePDA)(mintKey);
        const minterKey = web3_js_1.Keypair.generate().publicKey;
        const [minterInfo] = (0, utils_1.findMinterInfoPDA)(statePDA, minterKey);
        // Off-curve check — PublicKey.isOnCurve should return false
        chai_1.assert.isFalse(web3_js_1.PublicKey.isOnCurve(minterInfo.toBytes()));
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
        const { ComplianceModule } = await Promise.resolve().then(() => __importStar(require("../../sdk/src/index")));
        const mockSDK = { config: mockConfig };
        const compliance = new ComplianceModule(mockSDK, {});
        try {
            await compliance.blacklistAdd(web3_js_1.Keypair.generate().publicKey, "test");
            chai_1.assert.fail("Should have thrown");
        }
        catch (e) {
            chai_1.assert.include(e.message, "SSS-2 compliance is not enabled");
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
        const { ComplianceModule } = await Promise.resolve().then(() => __importStar(require("../../sdk/src/index")));
        const mockSDK = { config: mockConfig };
        const compliance = new ComplianceModule(mockSDK, {});
        try {
            await compliance.seize(web3_js_1.Keypair.generate().publicKey, web3_js_1.Keypair.generate().publicKey);
            chai_1.assert.fail("Should have thrown");
        }
        catch (e) {
            chai_1.assert.include(e.message, "SSS-2 compliance is not enabled");
        }
    });
});
// ─────────────────────────────────────────────────────────────────────────────
describe("Program ID Constants", () => {
    it("SSS_TOKEN_PROGRAM_ID should be a valid public key", () => {
        chai_1.assert.doesNotThrow(() => new web3_js_1.PublicKey(utils_1.SSS_TOKEN_PROGRAM_ID));
    });
    it("TRANSFER_HOOK_PROGRAM_ID should differ from SSS_TOKEN_PROGRAM_ID", () => {
        chai_1.assert.notEqual(utils_1.SSS_TOKEN_PROGRAM_ID.toBase58(), utils_1.TRANSFER_HOOK_PROGRAM_ID.toBase58());
    });
    it("TRANSFER_HOOK_PROGRAM_ID should be a valid public key", () => {
        chai_1.assert.doesNotThrow(() => new web3_js_1.PublicKey(utils_1.TRANSFER_HOOK_PROGRAM_ID));
    });
});
describe("PDA Derivation — Extended", () => {
    const mintKey = web3_js_1.Keypair.generate().publicKey;
    const [statePDA] = (0, utils_1.findStatePDA)(mintKey);
    it("findFreezeAuthorityPDA returns off-curve address", () => {
        const [freezeAuth] = (0, utils_1.findFreezeAuthorityPDA)(statePDA);
        chai_1.assert.isFalse(web3_js_1.PublicKey.isOnCurve(freezeAuth.toBytes()));
    });
    it("findPermanentDelegatePDA returns off-curve address", () => {
        const [permDelegate] = (0, utils_1.findPermanentDelegatePDA)(statePDA);
        chai_1.assert.isFalse(web3_js_1.PublicKey.isOnCurve(permDelegate.toBytes()));
    });
    it("findExtraAccountMetaListPDA returns off-curve address", () => {
        const [extraMeta] = (0, utils_1.findExtraAccountMetaListPDA)(mintKey);
        chai_1.assert.isFalse(web3_js_1.PublicKey.isOnCurve(extraMeta.toBytes()));
    });
    it("findMinterInfoPDA is unique per minter + state", () => {
        const m1 = web3_js_1.Keypair.generate().publicKey;
        const m2 = web3_js_1.Keypair.generate().publicKey;
        const [pda1] = (0, utils_1.findMinterInfoPDA)(statePDA, m1);
        const [pda2] = (0, utils_1.findMinterInfoPDA)(statePDA, m2);
        chai_1.assert.notEqual(pda1.toBase58(), pda2.toBase58());
    });
    it("findBlacklistEntryPDA same address + different state yields different PDA", () => {
        const mint2 = web3_js_1.Keypair.generate().publicKey;
        const [state2] = (0, utils_1.findStatePDA)(mint2);
        const addr = web3_js_1.Keypair.generate().publicKey;
        const [pda1] = (0, utils_1.findBlacklistEntryPDA)(statePDA, addr);
        const [pda2] = (0, utils_1.findBlacklistEntryPDA)(state2, addr);
        chai_1.assert.notEqual(pda1.toBase58(), pda2.toBase58());
    });
});
describe("Preset Configs", () => {
    it("SSS1_CONFIG should have expected defaults", () => {
        chai_1.assert.equal(presets_1.SSS1_CONFIG.decimals, 6);
        chai_1.assert.isFalse(presets_1.SSS1_CONFIG.enablePermanentDelegate);
        chai_1.assert.isFalse(presets_1.SSS1_CONFIG.enableTransferHook);
        chai_1.assert.isFalse(presets_1.SSS1_CONFIG.defaultAccountFrozen ?? false);
    });
    it("SSS2_CONFIG should enable compliance features", () => {
        chai_1.assert.equal(presets_1.SSS2_CONFIG.decimals, 6);
        chai_1.assert.isTrue(presets_1.SSS2_CONFIG.enablePermanentDelegate);
        chai_1.assert.isTrue(presets_1.SSS2_CONFIG.enableTransferHook);
    });
    it("resolvePreset should not mutate the base config", () => {
        const before = { ...presets_1.SSS1_CONFIG };
        (0, presets_1.resolvePreset)(presets_1.Preset.SSS_1, { enableTransferHook: true });
        chai_1.assert.deepEqual(presets_1.SSS1_CONFIG, before);
    });
});
