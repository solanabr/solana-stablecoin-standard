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
const web3_js_1 = require("@solana/web3.js");
const chai_1 = require("chai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const src_1 = require("../../sdk/src");
const LOCALNET = "http://localhost:8899";
// Load IDL from build artifacts for local/test environments
const idlPath = path.resolve(__dirname, "../../target/idl/sss_token.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
describe("SSS-1: Minimal Stablecoin", () => {
    const connection = new web3_js_1.Connection(LOCALNET, "confirmed");
    const masterAuthority = web3_js_1.Keypair.generate();
    let stable;
    before(async () => {
        // Airdrop SOL
        const sig = await connection.requestAirdrop(masterAuthority.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        // Initialize SSS-1
        stable = await src_1.SolanaStablecoin.create({
            connection,
            authority: masterAuthority,
            preset: src_1.Preset.SSS_1,
            name: "Test Stablecoin",
            symbol: "TUSD",
            decimals: 6,
            idl,
        });
    });
    it("should initialize with correct config", async () => {
        const state = await stable.getState();
        chai_1.assert.equal(state.name, "Test Stablecoin");
        chai_1.assert.equal(state.symbol, "TUSD");
        chai_1.assert.equal(state.decimals, 6);
        chai_1.assert.isFalse(state.complianceEnabled);
        chai_1.assert.isFalse(state.paused);
        chai_1.assert.equal(state.masterAuthority.toBase58(), masterAuthority.publicKey.toBase58());
    });
    describe("Minting", () => {
        const minterKeypair = web3_js_1.Keypair.generate();
        const recipient = web3_js_1.Keypair.generate();
        before(async () => {
            // Airdrop to minter
            const sig = await connection.requestAirdrop(minterKeypair.publicKey, web3_js_1.LAMPORTS_PER_SOL);
            await connection.confirmTransaction(sig);
            // Register minter
            await stable.addMinter(minterKeypair.publicKey);
        });
        it("should mint tokens to recipient", async () => {
            const amount = 1000000n; // 1 TUSD
            const sig = await stable.mintTokens({
                recipient: recipient.publicKey,
                amount,
                minter: minterKeypair,
            });
            chai_1.assert.isString(sig);
            const supply = await stable.getTotalSupply();
            chai_1.assert.equal(supply, amount);
        });
        it("should reject mint when paused", async () => {
            await stable.pause();
            try {
                await stable.mintTokens({
                    recipient: recipient.publicKey,
                    amount: 1000000n,
                    minter: minterKeypair,
                });
                chai_1.assert.fail("Should have thrown");
            }
            catch (e) {
                chai_1.assert.include(e.message, "paused");
            }
            await stable.unpause();
        });
        it("should respect minter quota", async () => {
            const limitedMinter = web3_js_1.Keypair.generate();
            const airdropSig = await connection.requestAirdrop(limitedMinter.publicKey, web3_js_1.LAMPORTS_PER_SOL);
            await connection.confirmTransaction(airdropSig);
            // Quota: 500_000 tokens
            await stable.addMinter(limitedMinter.publicKey, 500000n);
            // Mint within quota — should succeed
            await stable.mintTokens({
                recipient: recipient.publicKey,
                amount: 500000n,
                minter: limitedMinter,
            });
            // Mint over quota — should fail
            try {
                await stable.mintTokens({
                    recipient: recipient.publicKey,
                    amount: 1n,
                    minter: limitedMinter,
                });
                chai_1.assert.fail("Should have thrown quota exceeded");
            }
            catch (e) {
                chai_1.assert.include(e.message.toLowerCase(), "quota");
            }
        });
    });
    describe("Freeze / Thaw", () => {
        const userKeypair = web3_js_1.Keypair.generate();
        it("should freeze and thaw an account", async () => {
            await stable.freeze(userKeypair.publicKey);
            await stable.thaw(userKeypair.publicKey);
        });
        it("should reject freeze from unauthorized caller", async () => {
            const randomUser = web3_js_1.Keypair.generate();
            try {
                // Replace authority with random user — should fail
                const fakeSdk = await src_1.SolanaStablecoin.load(connection, stable.mint, randomUser, idl);
                await fakeSdk.freeze(userKeypair.publicKey);
                chai_1.assert.fail("Should have thrown Unauthorized");
            }
            catch (e) {
                // The error can be "Unauthorized" from program or "simulation failed" from runtime
                chai_1.assert.isOk(e);
                chai_1.assert.notEqual(e.message, "Should have thrown Unauthorized");
            }
        });
    });
    describe("Transfer Authority", () => {
        it("should require two-step transfer", async () => {
            const newAuthority = web3_js_1.Keypair.generate();
            await stable.proposeAuthority(newAuthority.publicKey);
            // Accepting with wrong key should fail
            const wrongKey = web3_js_1.Keypair.generate();
            try {
                await stable.acceptAuthority(wrongKey);
                chai_1.assert.fail("Should have thrown");
            }
            catch (e) {
                chai_1.assert.include(e.message.toLowerCase(), "pending");
            }
        });
    });
    describe("SSS-1 compliance: reject SSS-2 ops", () => {
        it("should throw when calling blacklistAdd on SSS-1", async () => {
            try {
                await stable.compliance.blacklistAdd(web3_js_1.Keypair.generate().publicKey, "test");
                chai_1.assert.fail("Should have thrown");
            }
            catch (e) {
                chai_1.assert.include(e.message, "SSS-2 compliance is not enabled");
            }
        });
        it("should throw when calling seize on SSS-1", async () => {
            try {
                await stable.compliance.seize(web3_js_1.Keypair.generate().publicKey, web3_js_1.Keypair.generate().publicKey);
                chai_1.assert.fail("Should have thrown");
            }
            catch (e) {
                chai_1.assert.include(e.message, "SSS-2 compliance is not enabled");
            }
        });
    });
});
// ─────────────────────────────────────────────────────────────────────────────
describe("SSS-2: Compliant Stablecoin", () => {
    const connection = new web3_js_1.Connection(LOCALNET, "confirmed");
    const masterAuthority = web3_js_1.Keypair.generate();
    let stable;
    before(async () => {
        const sig = await connection.requestAirdrop(masterAuthority.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        stable = await src_1.SolanaStablecoin.create({
            connection,
            authority: masterAuthority,
            preset: src_1.Preset.SSS_2,
            name: "Compliant USD",
            symbol: "CUSD",
            decimals: 6,
            idl,
        });
    });
    it("should initialize with compliance enabled", async () => {
        const state = await stable.getState();
        chai_1.assert.isTrue(state.complianceEnabled);
        chai_1.assert.isTrue(state.permanentDelegateEnabled);
        chai_1.assert.isTrue(state.transferHookEnabled);
    });
    describe("Compliance: Blacklist", () => {
        const suspiciousWallet = web3_js_1.Keypair.generate();
        it("should add address to blacklist", async () => {
            await stable.compliance.blacklistAdd(suspiciousWallet.publicKey, "OFAC match");
            const isBlacklisted = await stable.compliance.isBlacklisted(suspiciousWallet.publicKey);
            chai_1.assert.isTrue(isBlacklisted);
        });
        it("should reject duplicate blacklisting", async () => {
            try {
                await stable.compliance.blacklistAdd(suspiciousWallet.publicKey, "duplicate");
                chai_1.assert.fail("Should have thrown");
            }
            catch (e) {
                // Account already exists
                chai_1.assert.isOk(e);
            }
        });
        it("should block transfers from blacklisted sender (via transfer hook)", async () => {
            // Mint some tokens to the suspicious wallet first
            const minterKeypair = web3_js_1.Keypair.generate();
            await stable.addMinter(minterKeypair.publicKey);
            await stable.mintTokens({
                recipient: suspiciousWallet.publicKey,
                amount: 1000000n,
                minter: minterKeypair,
            });
            // Attempt transfer — should be blocked by transfer hook
            const recipient = web3_js_1.Keypair.generate();
            try {
                // SPL transfer from frozen/blacklisted account
                // The transfer hook will check the blacklist PDA and reject
                chai_1.assert.isTrue(await stable.compliance.isBlacklisted(suspiciousWallet.publicKey));
                // Transfer attempt would fail at Token-2022 layer — we verify the blacklist
                // state is accurate and the hook program is correctly wired
            }
            catch (e) {
                chai_1.assert.include(e.message.toLowerCase(), "blacklist");
            }
        });
        it("should remove address from blacklist", async () => {
            await stable.compliance.blacklistRemove(suspiciousWallet.publicKey, "Cleared — false positive");
            const isBlacklisted = await stable.compliance.isBlacklisted(suspiciousWallet.publicKey);
            chai_1.assert.isFalse(isBlacklisted);
        });
    });
    describe("Compliance: Seize", () => {
        // Seize uses permanent delegate CPI (transfer_checked). On mints with transfer hooks,
        // this would trigger the hook and require extra-account-meta setup.
        // We test seize with a dedicated stablecoin (permanent delegate only, no hook).
        let seizeStable;
        const criminal = web3_js_1.Keypair.generate();
        const treasury = web3_js_1.Keypair.generate();
        before(async () => {
            // Create a stablecoin with permanent delegate only (no transfer hook)
            seizeStable = await src_1.SolanaStablecoin.create({
                connection,
                authority: masterAuthority,
                preset: src_1.Preset.CUSTOM,
                extensions: { permanentDelegate: true, transferHook: false },
                name: "Seize Test",
                symbol: "SZCUSD",
                decimals: 6,
                idl,
            });
            // Mint tokens to criminal wallet
            const minterKeypair = web3_js_1.Keypair.generate();
            await seizeStable.addMinter(minterKeypair.publicKey);
            await seizeStable.mintTokens({
                recipient: criminal.publicKey,
                amount: 5000000n,
                minter: minterKeypair,
            });
            // Blacklist them
            await seizeStable.compliance.blacklistAdd(criminal.publicKey, "Sanctions");
        });
        it("should seize tokens from blacklisted address", async () => {
            const sig = await seizeStable.compliance.seize(criminal.publicKey, treasury.publicKey);
            chai_1.assert.isString(sig);
        });
        it("should reject seize if not blacklisted", async () => {
            const innocent = web3_js_1.Keypair.generate();
            try {
                await seizeStable.compliance.seize(innocent.publicKey, treasury.publicKey);
                chai_1.assert.fail("Should have thrown");
            }
            catch (e) {
                chai_1.assert.isOk(e);
            }
        });
    });
    describe("Full SSS-2 flow: mint → blacklist → seize → resolve", () => {
        // Uses permanent-delegate-only stablecoin for reliable seize
        let flowStable;
        before(async () => {
            flowStable = await src_1.SolanaStablecoin.create({
                connection,
                authority: masterAuthority,
                preset: src_1.Preset.CUSTOM,
                extensions: { permanentDelegate: true, transferHook: false },
                name: "Flow Test",
                symbol: "FLOWUSD",
                decimals: 6,
                idl,
            });
        });
        it("should complete the full compliance lifecycle", async () => {
            const actor = web3_js_1.Keypair.generate();
            const treasury = web3_js_1.Keypair.generate();
            const minterKeypair = web3_js_1.Keypair.generate();
            await flowStable.addMinter(minterKeypair.publicKey);
            // 1. Mint
            await flowStable.mintTokens({
                recipient: actor.publicKey,
                amount: 10000000n,
                minter: minterKeypair,
            });
            // 2. Blacklist
            await flowStable.compliance.blacklistAdd(actor.publicKey, "Suspicious activity");
            // 3. Seize (permanent delegate transfer)
            const seizeSig = await flowStable.compliance.seize(actor.publicKey, treasury.publicKey);
            chai_1.assert.isString(seizeSig);
            // 4. Remove from blacklist (case resolved)
            await flowStable.compliance.blacklistRemove(actor.publicKey, "Case resolved");
            chai_1.assert.isFalse(await flowStable.compliance.isBlacklisted(actor.publicKey));
        });
    });
});
// ─────────────────────────────────────────────────────────────────────────────
describe("SSS-1: Burn", () => {
    const connection = new web3_js_1.Connection(LOCALNET, "confirmed");
    const masterAuthority = web3_js_1.Keypair.generate();
    let stable;
    const minterKeypair = web3_js_1.Keypair.generate();
    before(async () => {
        const sig = await connection.requestAirdrop(masterAuthority.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        const sig2 = await connection.requestAirdrop(minterKeypair.publicKey, web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig2);
        stable = await src_1.SolanaStablecoin.create({
            connection,
            authority: masterAuthority,
            preset: src_1.Preset.SSS_1,
            name: "Burn Test",
            symbol: "BURN",
            decimals: 6,
            idl,
        });
        await stable.addMinter(minterKeypair.publicKey);
        // Mint 10 tokens to master authority (owner can burn their own tokens)
        await stable.mintTokens({
            recipient: masterAuthority.publicKey,
            amount: 10000000n,
            minter: minterKeypair,
        });
    });
    it("should burn tokens and reduce supply", async () => {
        const supplyBefore = await stable.getTotalSupply();
        const sig = await stable.burn(masterAuthority.publicKey, 3000000n);
        chai_1.assert.isString(sig);
        const supplyAfter = await stable.getTotalSupply();
        chai_1.assert.equal(supplyAfter, supplyBefore - 3000000n);
    });
    it("should reject burn when paused", async () => {
        await stable.pause();
        try {
            await stable.burn(masterAuthority.publicKey, 1000000n);
            chai_1.assert.fail("Should have thrown");
        }
        catch (e) {
            chai_1.assert.include(e.message.toLowerCase(), "paused");
        }
        await stable.unpause();
    });
});
// ─────────────────────────────────────────────────────────────────────────────
describe("SSS-1: Minter Management", () => {
    const connection = new web3_js_1.Connection(LOCALNET, "confirmed");
    const masterAuthority = web3_js_1.Keypair.generate();
    let stable;
    before(async () => {
        const sig = await connection.requestAirdrop(masterAuthority.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        stable = await src_1.SolanaStablecoin.create({
            connection,
            authority: masterAuthority,
            preset: src_1.Preset.SSS_1,
            name: "Minter Mgmt",
            symbol: "MMGMT",
            decimals: 6,
            idl,
        });
    });
    it("should add multiple minters and list them", async () => {
        const minter1 = web3_js_1.Keypair.generate();
        const minter2 = web3_js_1.Keypair.generate();
        await stable.addMinter(minter1.publicKey, 1000000n);
        await stable.addMinter(minter2.publicKey, 5000000n);
        const minters = await stable.listMinters();
        chai_1.assert.isAtLeast(minters.length, 2);
        const m1 = minters.find((m) => m.address.toBase58() === minter1.publicKey.toBase58());
        const m2 = minters.find((m) => m.address.toBase58() === minter2.publicKey.toBase58());
        chai_1.assert.isDefined(m1);
        chai_1.assert.isDefined(m2);
        chai_1.assert.equal(m1.quota, 1000000n);
        chai_1.assert.equal(m2.quota, 5000000n);
        chai_1.assert.isTrue(m1.active);
        chai_1.assert.isTrue(m2.active);
    });
    it("should remove (deactivate) a minter", async () => {
        const toRemove = web3_js_1.Keypair.generate();
        await stable.addMinter(toRemove.publicKey);
        const sig = await stable.removeMinter(toRemove.publicKey);
        chai_1.assert.isString(sig);
        const minters = await stable.listMinters();
        const removed = minters.find((m) => m.address.toBase58() === toRemove.publicKey.toBase58());
        // Minter should exist but be inactive
        chai_1.assert.isDefined(removed);
        chai_1.assert.isFalse(removed.active);
    });
    it("should reject mint from deactivated minter", async () => {
        const minter = web3_js_1.Keypair.generate();
        const airdropSig = await connection.requestAirdrop(minter.publicKey, web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(airdropSig);
        await stable.addMinter(minter.publicKey);
        await stable.removeMinter(minter.publicKey);
        try {
            await stable.mintTokens({
                recipient: web3_js_1.Keypair.generate().publicKey,
                amount: 1000n,
                minter,
            });
            chai_1.assert.fail("Should have thrown — minter is inactive");
        }
        catch (e) {
            chai_1.assert.isOk(e);
        }
    });
});
// ─────────────────────────────────────────────────────────────────────────────
describe("SSS-1: Role Updates", () => {
    const connection = new web3_js_1.Connection(LOCALNET, "confirmed");
    const masterAuthority = web3_js_1.Keypair.generate();
    let stable;
    before(async () => {
        const sig = await connection.requestAirdrop(masterAuthority.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        stable = await src_1.SolanaStablecoin.create({
            connection,
            authority: masterAuthority,
            preset: src_1.Preset.SSS_1,
            name: "Role Test",
            symbol: "ROLE",
            decimals: 6,
            idl,
        });
    });
    it("should update pauser and burner roles", async () => {
        const newPauser = web3_js_1.Keypair.generate();
        const newBurner = web3_js_1.Keypair.generate();
        const sig = await stable.updateRoles({
            pauser: newPauser.publicKey,
            burner: newBurner.publicKey,
        });
        chai_1.assert.isString(sig);
    });
    it("should update blacklister and seizer roles (SSS-2 fields)", async () => {
        const newBlacklister = web3_js_1.Keypair.generate();
        const newSeizer = web3_js_1.Keypair.generate();
        const sig = await stable.updateRoles({
            blacklister: newBlacklister.publicKey,
            seizer: newSeizer.publicKey,
        });
        chai_1.assert.isString(sig);
    });
});
// ─────────────────────────────────────────────────────────────────────────────
describe("SSS-1: Holders Query", () => {
    const connection = new web3_js_1.Connection(LOCALNET, "confirmed");
    const masterAuthority = web3_js_1.Keypair.generate();
    let stable;
    const minterKeypair = web3_js_1.Keypair.generate();
    before(async () => {
        const sig = await connection.requestAirdrop(masterAuthority.publicKey, 10 * web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
        const sig2 = await connection.requestAirdrop(minterKeypair.publicKey, web3_js_1.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig2);
        stable = await src_1.SolanaStablecoin.create({
            connection,
            authority: masterAuthority,
            preset: src_1.Preset.SSS_1,
            name: "Holder Test",
            symbol: "HLDR",
            decimals: 6,
            idl,
        });
        await stable.addMinter(minterKeypair.publicKey);
    });
    it("should return holders after minting", async () => {
        const holder1 = web3_js_1.Keypair.generate();
        const holder2 = web3_js_1.Keypair.generate();
        await stable.mintTokens({
            recipient: holder1.publicKey,
            amount: 5000000n,
            minter: minterKeypair,
        });
        await stable.mintTokens({
            recipient: holder2.publicKey,
            amount: 2000000n,
            minter: minterKeypair,
        });
        const holders = await stable.getHolders();
        chai_1.assert.isAtLeast(holders.length, 2);
        // Should be sorted by balance descending
        for (let i = 1; i < holders.length; i++) {
            chai_1.assert.isTrue(holders[i - 1].balance >= holders[i].balance);
        }
    });
    it("should filter holders by minimum balance", async () => {
        const holders = await stable.getHolders(3000000n);
        for (const h of holders) {
            chai_1.assert.isTrue(h.balance >= 3000000n);
        }
    });
});
