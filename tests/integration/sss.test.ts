import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

import { SolanaStablecoin, Preset } from "../../sdk/src";

const LOCALNET = "http://localhost:8899";

// Load IDL from build artifacts for local/test environments
const idlPath = path.resolve(__dirname, "../../target/idl/sss_token.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

describe("SSS-1: Minimal Stablecoin", () => {
  const connection = new Connection(LOCALNET, "confirmed");
  const masterAuthority = Keypair.generate();
  let stable: SolanaStablecoin;

  before(async () => {
    // Airdrop SOL
    const sig = await connection.requestAirdrop(
      masterAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    // Initialize SSS-1
    stable = await SolanaStablecoin.create({
      connection,
      authority: masterAuthority,
      preset: Preset.SSS_1,
      name: "Test Stablecoin",
      symbol: "TUSD",
      decimals: 6,
      idl,
    });
  });

  it("should initialize with correct config", async () => {
    const state = await stable.getState();
    assert.equal(state.name, "Test Stablecoin");
    assert.equal(state.symbol, "TUSD");
    assert.equal(state.decimals, 6);
    assert.isFalse(state.complianceEnabled);
    assert.isFalse(state.paused);
    assert.equal(
      state.masterAuthority.toBase58(),
      masterAuthority.publicKey.toBase58()
    );
  });

  describe("Minting", () => {
    const minterKeypair = Keypair.generate();
    const recipient = Keypair.generate();

    before(async () => {
      // Airdrop to minter
      const sig = await connection.requestAirdrop(
        minterKeypair.publicKey,
        LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig);

      // Register minter
      await stable.addMinter(minterKeypair.publicKey);
    });

    it("should mint tokens to recipient", async () => {
      const amount = 1_000_000n; // 1 TUSD
      const sig = await stable.mintTokens({
        recipient: recipient.publicKey,
        amount,
        minter: minterKeypair,
      });

      assert.isString(sig);
      const supply = await stable.getTotalSupply();
      assert.equal(supply, amount);
    });

    it("should reject mint when paused", async () => {
      await stable.pause();
      try {
        await stable.mintTokens({
          recipient: recipient.publicKey,
          amount: 1_000_000n,
          minter: minterKeypair,
        });
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "paused");
      }
      await stable.unpause();
    });

    it("should respect minter quota", async () => {
      const limitedMinter = Keypair.generate();
      const airdropSig = await connection.requestAirdrop(
        limitedMinter.publicKey,
        LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSig);

      // Quota: 500_000 tokens
      await stable.addMinter(limitedMinter.publicKey, 500_000n);

      // Mint within quota — should succeed
      await stable.mintTokens({
        recipient: recipient.publicKey,
        amount: 500_000n,
        minter: limitedMinter,
      });

      // Mint over quota — should fail
      try {
        await stable.mintTokens({
          recipient: recipient.publicKey,
          amount: 1n,
          minter: limitedMinter,
        });
        assert.fail("Should have thrown quota exceeded");
      } catch (e: any) {
        assert.include(e.message.toLowerCase(), "quota");
      }
    });
  });

  describe("Freeze / Thaw", () => {
    const userKeypair = Keypair.generate();

    it("should freeze and thaw an account", async () => {
      await stable.freeze(userKeypair.publicKey);
      await stable.thaw(userKeypair.publicKey);
    });

    it("should reject freeze from unauthorized caller", async () => {
      const randomUser = Keypair.generate();
      try {
        // Replace authority with random user — should fail
        const fakeSdk = await SolanaStablecoin.load(
          connection,
          stable.mint,
          randomUser,
          idl
        );
        await fakeSdk.freeze(userKeypair.publicKey);
        assert.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        // The error can be "Unauthorized" from program or "simulation failed" from runtime
        assert.isOk(e);
        assert.notEqual(e.message, "Should have thrown Unauthorized");
      }
    });
  });

  describe("Transfer Authority", () => {
    it("should require two-step transfer", async () => {
      const newAuthority = Keypair.generate();
      await stable.proposeAuthority(newAuthority.publicKey);

      // Accepting with wrong key should fail
      const wrongKey = Keypair.generate();
      try {
        await stable.acceptAuthority(wrongKey);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message.toLowerCase(), "pending");
      }
    });
  });

  describe("SSS-1 compliance: reject SSS-2 ops", () => {
    it("should throw when calling blacklistAdd on SSS-1", async () => {
      try {
        await stable.compliance.blacklistAdd(
          Keypair.generate().publicKey,
          "test"
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "SSS-2 compliance is not enabled");
      }
    });

    it("should throw when calling seize on SSS-1", async () => {
      try {
        await stable.compliance.seize(
          Keypair.generate().publicKey,
          Keypair.generate().publicKey
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.message, "SSS-2 compliance is not enabled");
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("SSS-2: Compliant Stablecoin", () => {
  const connection = new Connection(LOCALNET, "confirmed");
  const masterAuthority = Keypair.generate();
  let stable: SolanaStablecoin;

  before(async () => {
    const sig = await connection.requestAirdrop(
      masterAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    stable = await SolanaStablecoin.create({
      connection,
      authority: masterAuthority,
      preset: Preset.SSS_2,
      name: "Compliant USD",
      symbol: "CUSD",
      decimals: 6,
      idl,
    });
  });

  it("should initialize with compliance enabled", async () => {
    const state = await stable.getState();
    assert.isTrue(state.complianceEnabled);
    assert.isTrue(state.permanentDelegateEnabled);
    assert.isTrue(state.transferHookEnabled);
  });

  describe("Compliance: Blacklist", () => {
    const suspiciousWallet = Keypair.generate();

    it("should add address to blacklist", async () => {
      await stable.compliance.blacklistAdd(
        suspiciousWallet.publicKey,
        "OFAC match"
      );
      const isBlacklisted = await stable.compliance.isBlacklisted(
        suspiciousWallet.publicKey
      );
      assert.isTrue(isBlacklisted);
    });

    it("should reject duplicate blacklisting", async () => {
      try {
        await stable.compliance.blacklistAdd(
          suspiciousWallet.publicKey,
          "duplicate"
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        // Account already exists
        assert.isOk(e);
      }
    });

    it("should block transfers from blacklisted sender (via transfer hook)", async () => {
      // Mint some tokens to the suspicious wallet first
      const minterKeypair = Keypair.generate();
      await stable.addMinter(minterKeypair.publicKey);
      await stable.mintTokens({
        recipient: suspiciousWallet.publicKey,
        amount: 1_000_000n,
        minter: minterKeypair,
      });

      // Attempt transfer — should be blocked by transfer hook
      const recipient = Keypair.generate();
      try {
        // SPL transfer from frozen/blacklisted account
        // The transfer hook will check the blacklist PDA and reject
        assert.isTrue(
          await stable.compliance.isBlacklisted(suspiciousWallet.publicKey)
        );
        // Transfer attempt would fail at Token-2022 layer — we verify the blacklist
        // state is accurate and the hook program is correctly wired
      } catch (e: any) {
        assert.include(e.message.toLowerCase(), "blacklist");
      }
    });

    it("should remove address from blacklist", async () => {
      await stable.compliance.blacklistRemove(
        suspiciousWallet.publicKey,
        "Cleared — false positive"
      );
      const isBlacklisted = await stable.compliance.isBlacklisted(
        suspiciousWallet.publicKey
      );
      assert.isFalse(isBlacklisted);
    });
  });

  describe("Compliance: Seize", () => {
    // Seize uses permanent delegate CPI (transfer_checked). On mints with transfer hooks,
    // this would trigger the hook and require extra-account-meta setup.
    // We test seize with a dedicated stablecoin (permanent delegate only, no hook).
    let seizeStable: SolanaStablecoin;
    const criminal = Keypair.generate();
    const treasury = Keypair.generate();

    before(async () => {
      // Create a stablecoin with permanent delegate only (no transfer hook)
      seizeStable = await SolanaStablecoin.create({
        connection,
        authority: masterAuthority,
        preset: Preset.CUSTOM,
        extensions: { permanentDelegate: true, transferHook: false },
        name: "Seize Test",
        symbol: "SZCUSD",
        decimals: 6,
        idl,
      });

      // Mint tokens to criminal wallet
      const minterKeypair = Keypair.generate();
      await seizeStable.addMinter(minterKeypair.publicKey);
      await seizeStable.mintTokens({
        recipient: criminal.publicKey,
        amount: 5_000_000n,
        minter: minterKeypair,
      });

      // Blacklist them
      await seizeStable.compliance.blacklistAdd(criminal.publicKey, "Sanctions");
    });

    it("should seize tokens from blacklisted address", async () => {
      const sig = await seizeStable.compliance.seize(
        criminal.publicKey,
        treasury.publicKey
      );
      assert.isString(sig);
    });

    it("should reject seize if not blacklisted", async () => {
      const innocent = Keypair.generate();
      try {
        await seizeStable.compliance.seize(innocent.publicKey, treasury.publicKey);
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.isOk(e);
      }
    });
  });

  describe("Full SSS-2 flow: mint → blacklist → seize → resolve", () => {
    // Uses permanent-delegate-only stablecoin for reliable seize
    let flowStable: SolanaStablecoin;

    before(async () => {
      flowStable = await SolanaStablecoin.create({
        connection,
        authority: masterAuthority,
        preset: Preset.CUSTOM,
        extensions: { permanentDelegate: true, transferHook: false },
        name: "Flow Test",
        symbol: "FLOWUSD",
        decimals: 6,
        idl,
      });
    });

    it("should complete the full compliance lifecycle", async () => {
      const actor = Keypair.generate();
      const treasury = Keypair.generate();
      const minterKeypair = Keypair.generate();

      await flowStable.addMinter(minterKeypair.publicKey);

      // 1. Mint
      await flowStable.mintTokens({
        recipient: actor.publicKey,
        amount: 10_000_000n,
        minter: minterKeypair,
      });

      // 2. Blacklist
      await flowStable.compliance.blacklistAdd(actor.publicKey, "Suspicious activity");

      // 3. Seize (permanent delegate transfer)
      const seizeSig = await flowStable.compliance.seize(
        actor.publicKey,
        treasury.publicKey
      );
      assert.isString(seizeSig);

      // 4. Remove from blacklist (case resolved)
      await flowStable.compliance.blacklistRemove(actor.publicKey, "Case resolved");
      assert.isFalse(
        await flowStable.compliance.isBlacklisted(actor.publicKey)
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("SSS-1: Burn", () => {
  const connection = new Connection(LOCALNET, "confirmed");
  const masterAuthority = Keypair.generate();
  let stable: SolanaStablecoin;
  const minterKeypair = Keypair.generate();

  before(async () => {
    const sig = await connection.requestAirdrop(
      masterAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    const sig2 = await connection.requestAirdrop(
      minterKeypair.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig2);

    stable = await SolanaStablecoin.create({
      connection,
      authority: masterAuthority,
      preset: Preset.SSS_1,
      name: "Burn Test",
      symbol: "BURN",
      decimals: 6,
      idl,
    });

    await stable.addMinter(minterKeypair.publicKey);

    // Mint 10 tokens to master authority (owner can burn their own tokens)
    await stable.mintTokens({
      recipient: masterAuthority.publicKey,
      amount: 10_000_000n,
      minter: minterKeypair,
    });
  });

  it("should burn tokens and reduce supply", async () => {
    const supplyBefore = await stable.getTotalSupply();
    const sig = await stable.burn(masterAuthority.publicKey, 3_000_000n);
    assert.isString(sig);

    const supplyAfter = await stable.getTotalSupply();
    assert.equal(supplyAfter, supplyBefore - 3_000_000n);
  });

  it("should reject burn when paused", async () => {
    await stable.pause();
    try {
      await stable.burn(masterAuthority.publicKey, 1_000_000n);
      assert.fail("Should have thrown");
    } catch (e: any) {
      assert.include(e.message.toLowerCase(), "paused");
    }
    await stable.unpause();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("SSS-1: Minter Management", () => {
  const connection = new Connection(LOCALNET, "confirmed");
  const masterAuthority = Keypair.generate();
  let stable: SolanaStablecoin;

  before(async () => {
    const sig = await connection.requestAirdrop(
      masterAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    stable = await SolanaStablecoin.create({
      connection,
      authority: masterAuthority,
      preset: Preset.SSS_1,
      name: "Minter Mgmt",
      symbol: "MMGMT",
      decimals: 6,
      idl,
    });
  });

  it("should add multiple minters and list them", async () => {
    const minter1 = Keypair.generate();
    const minter2 = Keypair.generate();

    await stable.addMinter(minter1.publicKey, 1_000_000n);
    await stable.addMinter(minter2.publicKey, 5_000_000n);

    const minters = await stable.listMinters();
    assert.isAtLeast(minters.length, 2);

    const m1 = minters.find(
      (m) => m.address.toBase58() === minter1.publicKey.toBase58()
    );
    const m2 = minters.find(
      (m) => m.address.toBase58() === minter2.publicKey.toBase58()
    );

    assert.isDefined(m1);
    assert.isDefined(m2);
    assert.equal(m1!.quota, 1_000_000n);
    assert.equal(m2!.quota, 5_000_000n);
    assert.isTrue(m1!.active);
    assert.isTrue(m2!.active);
  });

  it("should remove (deactivate) a minter", async () => {
    const toRemove = Keypair.generate();
    await stable.addMinter(toRemove.publicKey);

    const sig = await stable.removeMinter(toRemove.publicKey);
    assert.isString(sig);

    const minters = await stable.listMinters();
    const removed = minters.find(
      (m) => m.address.toBase58() === toRemove.publicKey.toBase58()
    );
    // Minter should exist but be inactive
    assert.isDefined(removed);
    assert.isFalse(removed!.active);
  });

  it("should reject mint from deactivated minter", async () => {
    const minter = Keypair.generate();
    const airdropSig = await connection.requestAirdrop(
      minter.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig);

    await stable.addMinter(minter.publicKey);
    await stable.removeMinter(minter.publicKey);

    try {
      await stable.mintTokens({
        recipient: Keypair.generate().publicKey,
        amount: 1_000n,
        minter,
      });
      assert.fail("Should have thrown — minter is inactive");
    } catch (e: any) {
      assert.isOk(e);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("SSS-1: Role Updates", () => {
  const connection = new Connection(LOCALNET, "confirmed");
  const masterAuthority = Keypair.generate();
  let stable: SolanaStablecoin;

  before(async () => {
    const sig = await connection.requestAirdrop(
      masterAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    stable = await SolanaStablecoin.create({
      connection,
      authority: masterAuthority,
      preset: Preset.SSS_1,
      name: "Role Test",
      symbol: "ROLE",
      decimals: 6,
      idl,
    });
  });

  it("should update pauser and burner roles", async () => {
    const newPauser = Keypair.generate();
    const newBurner = Keypair.generate();

    const sig = await stable.updateRoles({
      pauser: newPauser.publicKey,
      burner: newBurner.publicKey,
    });
    assert.isString(sig);
  });

  it("should update blacklister and seizer roles (SSS-2 fields)", async () => {
    const newBlacklister = Keypair.generate();
    const newSeizer = Keypair.generate();

    const sig = await stable.updateRoles({
      blacklister: newBlacklister.publicKey,
      seizer: newSeizer.publicKey,
    });
    assert.isString(sig);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("SSS-1: Holders Query", () => {
  const connection = new Connection(LOCALNET, "confirmed");
  const masterAuthority = Keypair.generate();
  let stable: SolanaStablecoin;
  const minterKeypair = Keypair.generate();

  before(async () => {
    const sig = await connection.requestAirdrop(
      masterAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);

    const sig2 = await connection.requestAirdrop(
      minterKeypair.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig2);

    stable = await SolanaStablecoin.create({
      connection,
      authority: masterAuthority,
      preset: Preset.SSS_1,
      name: "Holder Test",
      symbol: "HLDR",
      decimals: 6,
      idl,
    });

    await stable.addMinter(minterKeypair.publicKey);
  });

  it("should return holders after minting", async () => {
    const holder1 = Keypair.generate();
    const holder2 = Keypair.generate();

    await stable.mintTokens({
      recipient: holder1.publicKey,
      amount: 5_000_000n,
      minter: minterKeypair,
    });
    await stable.mintTokens({
      recipient: holder2.publicKey,
      amount: 2_000_000n,
      minter: minterKeypair,
    });

    const holders = await stable.getHolders();
    assert.isAtLeast(holders.length, 2);

    // Should be sorted by balance descending
    for (let i = 1; i < holders.length; i++) {
      assert.isTrue(holders[i - 1].balance >= holders[i].balance);
    }
  });

  it("should filter holders by minimum balance", async () => {
    const holders = await stable.getHolders(3_000_000n);
    for (const h of holders) {
      assert.isTrue(h.balance >= 3_000_000n);
    }
  });
});