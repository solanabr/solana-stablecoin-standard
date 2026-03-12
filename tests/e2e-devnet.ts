/**
 * E2E Devnet Test Script for the Solana Stablecoin Standard (SSS)
 *
 * Exercises ALL SDK operations against a live devnet deployment.
 * Creates a fresh SSS-2 mint (permanent delegate + transfer hook)
 * so every instruction path can be tested end-to-end.
 *
 * Run:
 *   npx ts-node tests/e2e-devnet.ts
 *
 * Prereqs:
 *   - Devnet SOL in ~/.config/solana/id.json
 *   - Programs deployed at the IDs below
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Wallet, BN } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import * as path from "path";
import * as os from "os";

import { SSSClient } from "../sdk/src/client";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../sdk/src/constants";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const DEVNET_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const CONFIRM_COMMITMENT = "confirmed" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; detail?: string }[] = [];

async function step(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  // Rate-limit protection: wait between tests
  await sleep(1500);
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`  [PASS] ${name}  (${ms}ms)`);
    passed++;
    results.push({ name, ok: true });
  } catch (err: any) {
    const ms = Date.now() - t0;
    const detail = err?.message ?? String(err);
    console.log(`  [FAIL] ${name}  (${ms}ms)`);
    console.log(`         ${detail}`);
    failed++;
    results.push({ name, ok: false, detail });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function confirmTx(
  connection: Connection,
  sig: string
): Promise<void> {
  await connection.confirmTransaction(sig, CONFIRM_COMMITMENT);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log("=== SSS Devnet E2E Test Suite ===\n");

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  const connection = new Connection(DEVNET_URL, {
    commitment: CONFIRM_COMMITMENT,
    confirmTransactionInitialTimeout: 60_000,
  });

  const keypairPath = process.env.KEYPAIR_PATH
    || path.join(os.homedir(), ".config/solana/id.json");
  const authority = loadKeypair(keypairPath);
  console.log(`Authority:      ${authority.publicKey.toBase58()}`);

  const wallet = new Wallet(authority);
  const client = new SSSClient(connection, wallet);

  // Generate a fresh mint keypair for this test run
  const mint = Keypair.generate();
  console.log(`New SSS-2 Mint: ${mint.publicKey.toBase58()}`);

  // Derive PDAs early so we can reference them
  const [configPda] = client.getConfigPda(mint.publicKey);
  const [roleRegistryPda] = client.getRoleRegistryPda(configPda);
  console.log(`Config PDA:     ${configPda.toBase58()}`);
  console.log(`Roles PDA:      ${roleRegistryPda.toBase58()}`);

  // Second keypair for blacklist / seize testing
  const victim = Keypair.generate();
  console.log(`Victim keypair: ${victim.publicKey.toBase58()}`);

  // ATAs (computed, not yet created)
  const authorityAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    authority.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  const victimAta = getAssociatedTokenAddressSync(
    mint.publicKey,
    victim.publicKey,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`Authority ATA:  ${authorityAta.toBase58()}`);
  console.log(`Victim ATA:     ${victimAta.toBase58()}`);

  // Check authority balance
  const balance = await connection.getBalance(authority.publicKey);
  console.log(
    `Authority SOL:  ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`
  );
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log(
      "WARNING: Authority has very low SOL. Tests may fail due to insufficient funds."
    );
    console.log(
      "Run: solana airdrop 2 --url devnet\n"
    );
  }

  // -------------------------------------------------------------------------
  // Test 1: Initialize a new SSS-2 mint
  // -------------------------------------------------------------------------
  await step("1. Initialize SSS-2 mint", async () => {
    const { signature } = await client.initialize(
      {
        name: "E2E-TestUSD",
        symbol: "eTUSD",
        uri: "https://example.com/metadata.json",
        decimals: 6,
        preset: { sss2: {} },
        enablePermanentDelegate: null,
        enableTransferHook: null,
        enableDefaultStateFrozen: null,
        enableConfidentialTransfers: null,
      },
      mint,
      SSS_TRANSFER_HOOK_PROGRAM_ID
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify
    const config = await client.fetchConfig(mint.publicKey);
    assert(config.name === "E2E-TestUSD", `Expected name 'E2E-TestUSD', got '${config.name}'`);
    assert(config.symbol === "eTUSD", `Expected symbol 'eTUSD', got '${config.symbol}'`);
    assert(config.decimals === 6, `Expected decimals 6, got ${config.decimals}`);
    assert(config.enablePermanentDelegate === true, "Expected permanent delegate enabled");
    assert(config.enableTransferHook === true, "Expected transfer hook enabled");
    assert(config.isPaused === false, "Expected not paused");
    assert(
      config.masterAuthority.toBase58() === authority.publicKey.toBase58(),
      "Master authority mismatch"
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: Initialize ExtraAccountMetaList for the transfer hook
  // -------------------------------------------------------------------------
  await step("2. Initialize ExtraAccountMetaList", async () => {
    const { signature } = await client.initializeExtraAccountMetaList(
      mint.publicKey
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify the account was created
    const [metaListPda] = client.getExtraAccountMetaListPda(mint.publicKey);
    const account = await connection.getAccountInfo(metaListPda);
    assert(account !== null, "ExtraAccountMetaList account should exist");
    assert(
      account!.owner.toBase58() === SSS_TRANSFER_HOOK_PROGRAM_ID.toBase58(),
      "ExtraAccountMetaList owner mismatch"
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Add a minter with quota (authority as minter)
  // -------------------------------------------------------------------------
  await step("3. Add minter with quota", async () => {
    const { signature } = await client.updateMinter(
      mint.publicKey,
      authority.publicKey,
      {
        isActive: true,
        mintQuota: new BN(10_000_000_000), // 10,000 tokens
      }
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify
    const minterInfo = await client.fetchMinterInfo(
      configPda,
      authority.publicKey
    );
    assert(minterInfo.isActive === true, "Minter should be active");
    assert(
      minterInfo.mintQuota.eq(new BN(10_000_000_000)),
      `Expected quota 10_000_000_000, got ${minterInfo.mintQuota.toString()}`
    );
    assert(
      minterInfo.minter.toBase58() === authority.publicKey.toBase58(),
      "Minter pubkey mismatch"
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Create ATA for the authority (minter)
  // -------------------------------------------------------------------------
  await step("4. Create authority ATA", async () => {
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      authorityAta,
      authority.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: CONFIRM_COMMITMENT,
    });
    console.log(`         tx: ${signature}`);

    // Verify
    const account = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(
      account.owner.toBase58() === authority.publicKey.toBase58(),
      "ATA owner mismatch"
    );
    assert(
      account.mint.toBase58() === mint.publicKey.toBase58(),
      "ATA mint mismatch"
    );
  });

  // -------------------------------------------------------------------------
  // Test 5: Mint tokens to authority ATA
  // -------------------------------------------------------------------------
  await step("5. Mint tokens (1000 eTUSD)", async () => {
    const amount = new BN(1_000_000_000); // 1000 tokens * 10^6
    const { signature } = await client.mintTokens(
      mint.publicKey,
      amount,
      authorityAta
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify on-chain balance
    const account = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(
      Number(account.amount) === 1_000_000_000,
      `Expected 1_000_000_000, got ${account.amount}`
    );

    // Verify config totals
    const config = await client.fetchConfig(mint.publicKey);
    assert(
      config.totalMinted.eq(new BN(1_000_000_000)),
      `Expected totalMinted 1_000_000_000, got ${config.totalMinted.toString()}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 6: Burn tokens
  // -------------------------------------------------------------------------
  await step("6. Burn tokens (100 eTUSD)", async () => {
    const amount = new BN(100_000_000); // 100 tokens
    const { signature } = await client.burnTokens(
      mint.publicKey,
      amount,
      authorityAta
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify balance decreased
    const account = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(
      Number(account.amount) === 900_000_000,
      `Expected 900_000_000 after burn, got ${account.amount}`
    );

    // Verify config totals
    const config = await client.fetchConfig(mint.publicKey);
    assert(
      config.totalBurned.eq(new BN(100_000_000)),
      `Expected totalBurned 100_000_000, got ${config.totalBurned.toString()}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: Freeze a token account
  // -------------------------------------------------------------------------
  await step("7. Freeze authority token account", async () => {
    const { signature } = await client.freezeAccount(
      mint.publicKey,
      authorityAta
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const account = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(account.isFrozen === true, "Account should be frozen");
  });

  // -------------------------------------------------------------------------
  // Test 8: Thaw a token account
  // -------------------------------------------------------------------------
  await step("8. Thaw authority token account", async () => {
    const { signature } = await client.thawAccount(
      mint.publicKey,
      authorityAta
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const account = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(account.isFrozen === false, "Account should be thawed");
  });

  // -------------------------------------------------------------------------
  // Test 9: Pause the program
  // -------------------------------------------------------------------------
  await step("9. Pause the program", async () => {
    const { signature } = await client.pause(mint.publicKey);
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const config = await client.fetchConfig(mint.publicKey);
    assert(config.isPaused === true, "Config should be paused");
  });

  // -------------------------------------------------------------------------
  // Test 10: Unpause the program
  // -------------------------------------------------------------------------
  await step("10. Unpause the program", async () => {
    const { signature } = await client.unpause(mint.publicKey);
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const config = await client.fetchConfig(mint.publicKey);
    assert(config.isPaused === false, "Config should be unpaused");
  });

  // -------------------------------------------------------------------------
  // Test 11: Update roles (set pauser, blacklister, seizer)
  // -------------------------------------------------------------------------
  await step("11a. Update role: pauser", async () => {
    const { signature } = await client.updateRoles(mint.publicKey, {
      role: { pauser: {} },
      newHolder: authority.publicKey,
    });
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const roles = await client.fetchRoleRegistry(configPda);
    assert(
      roles.pauser.toBase58() === authority.publicKey.toBase58(),
      "Pauser should be authority"
    );
  });

  await step("11b. Update role: blacklister", async () => {
    const { signature } = await client.updateRoles(mint.publicKey, {
      role: { blacklister: {} },
      newHolder: authority.publicKey,
    });
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const roles = await client.fetchRoleRegistry(configPda);
    assert(
      roles.blacklister.toBase58() === authority.publicKey.toBase58(),
      "Blacklister should be authority"
    );
  });

  await step("11c. Update role: seizer", async () => {
    const { signature } = await client.updateRoles(mint.publicKey, {
      role: { seizer: {} },
      newHolder: authority.publicKey,
    });
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const roles = await client.fetchRoleRegistry(configPda);
    assert(
      roles.seizer.toBase58() === authority.publicKey.toBase58(),
      "Seizer should be authority"
    );
  });

  // -------------------------------------------------------------------------
  // Test 12: Blacklist add (victim)
  // First, create victim ATA and mint tokens to them so we have something to seize
  // -------------------------------------------------------------------------
  await step("12a. Create victim ATA", async () => {
    const ix = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      victimAta,
      victim.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: CONFIRM_COMMITMENT,
    });
    console.log(`         tx: ${signature}`);
  });

  await step("12b. Mint tokens to victim (500 eTUSD)", async () => {
    const amount = new BN(500_000_000); // 500 tokens
    const { signature } = await client.mintTokens(
      mint.publicKey,
      amount,
      victimAta
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    const account = await getAccount(
      connection,
      victimAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(
      Number(account.amount) === 500_000_000,
      `Expected victim balance 500_000_000, got ${account.amount}`
    );
  });

  await step("12c. Blacklist add (victim)", async () => {
    const { signature } = await client.blacklistAdd(
      mint.publicKey,
      victim.publicKey,
      victimAta,
      { reason: "E2E test: sanctions compliance" }
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify blacklist entry exists
    const entry = await client.fetchBlacklistEntry(configPda, victim.publicKey);
    assert(entry !== null, "Blacklist entry should exist");
    assert(
      entry!.blockedAddress.toBase58() === victim.publicKey.toBase58(),
      "Blocked address mismatch"
    );
    assert(
      entry!.reason === "E2E test: sanctions compliance",
      `Reason mismatch: '${entry!.reason}'`
    );

    // Verify victim account is frozen
    const account = await getAccount(
      connection,
      victimAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(account.isFrozen === true, "Blacklisted account should be frozen");
  });

  // -------------------------------------------------------------------------
  // Test 13: Seize tokens from blacklisted address
  // -------------------------------------------------------------------------
  await step("13. Seize tokens from blacklisted victim (200 eTUSD)", async () => {
    const seizeAmount = new BN(200_000_000); // 200 tokens

    // Get balances before seize
    const victimBefore = await getAccount(
      connection,
      victimAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    const authorityBefore = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );

    const { signature } = await client.seize(
      mint.publicKey,
      victim.publicKey,
      victimAta,
      authorityAta,
      seizeAmount
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify victim balance decreased
    const victimAfter = await getAccount(
      connection,
      victimAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    const expectedVictim = Number(victimBefore.amount) - 200_000_000;
    assert(
      Number(victimAfter.amount) === expectedVictim,
      `Expected victim ${expectedVictim}, got ${victimAfter.amount}`
    );

    // Verify authority balance increased
    const authorityAfter = await getAccount(
      connection,
      authorityAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    const expectedAuthority = Number(authorityBefore.amount) + 200_000_000;
    assert(
      Number(authorityAfter.amount) === expectedAuthority,
      `Expected authority ${expectedAuthority}, got ${authorityAfter.amount}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 14: Blacklist remove
  // -------------------------------------------------------------------------
  await step("14. Blacklist remove (victim)", async () => {
    const { signature } = await client.blacklistRemove(
      mint.publicKey,
      victim.publicKey,
      victimAta
    );
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify blacklist entry is gone
    const entry = await client.fetchBlacklistEntry(configPda, victim.publicKey);
    assert(entry === null, "Blacklist entry should be removed");

    // Verify victim account is thawed
    const account = await getAccount(
      connection,
      victimAta,
      CONFIRM_COMMITMENT,
      TOKEN_2022_PROGRAM_ID
    );
    assert(account.isFrozen === false, "Account should be thawed after blacklist removal");
  });

  // -------------------------------------------------------------------------
  // Test 15: Attest reserve
  // -------------------------------------------------------------------------
  await step("15. Attest reserve", async () => {
    const reserveHash = new Array(32).fill(0xab);
    const { signature } = await client.attestReserve(mint.publicKey, {
      reserveHash,
      totalReservesUsd: new BN(2_000_000_00), // $2,000,000.00
      totalOutstanding: new BN(1_600_000_000), // 1600 tokens (after mints and burns)
      attestationUri: "https://example.com/reserves/e2e-test.json",
    });
    await confirmTx(connection, signature);
    console.log(`         tx: ${signature}`);

    // Verify attestation was created
    const attestation = await client.fetchReserveAttestation(configPda, 0);
    assert(attestation.index.toNumber() === 0, "Attestation index should be 0");
    assert(
      attestation.totalReservesUsd.eq(new BN(2_000_000_00)),
      `Expected totalReservesUsd 200000000, got ${attestation.totalReservesUsd.toString()}`
    );
    assert(
      attestation.attestedBy.toBase58() === authority.publicKey.toBase58(),
      "Attested by mismatch"
    );
    assert(
      attestation.attestationUri === "https://example.com/reserves/e2e-test.json",
      `URI mismatch: '${attestation.attestationUri}'`
    );

    // Verify config index incremented
    const config = await client.fetchConfig(mint.publicKey);
    assert(
      config.reserveAttestationIndex.toNumber() === 1,
      `Expected reserveAttestationIndex 1, got ${config.reserveAttestationIndex.toString()}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 16: Fetch and log all state
  // -------------------------------------------------------------------------
  await step("16. Fetch and log all state", async () => {
    console.log("\n  --- Final State Dump ---");

    // Config
    const config = await client.fetchConfig(mint.publicKey);
    console.log(`  Config:`);
    console.log(`    name:                    ${config.name}`);
    console.log(`    symbol:                  ${config.symbol}`);
    console.log(`    uri:                     ${config.uri}`);
    console.log(`    decimals:                ${config.decimals}`);
    console.log(`    masterAuthority:         ${config.masterAuthority.toBase58()}`);
    console.log(`    mint:                    ${config.mint.toBase58()}`);
    console.log(`    enablePermanentDelegate: ${config.enablePermanentDelegate}`);
    console.log(`    enableTransferHook:      ${config.enableTransferHook}`);
    console.log(`    enableConfidentialXfers: ${config.enableConfidentialTransfers}`);
    console.log(`    defaultAccountFrozen:    ${config.defaultAccountFrozen}`);
    console.log(`    isPaused:                ${config.isPaused}`);
    console.log(`    totalMinted:             ${config.totalMinted.toString()}`);
    console.log(`    totalBurned:             ${config.totalBurned.toString()}`);
    console.log(`    reserveAttestationIndex: ${config.reserveAttestationIndex.toString()}`);
    console.log(`    createdAt:               ${new Date(config.createdAt.toNumber() * 1000).toISOString()}`);
    console.log(`    updatedAt:               ${new Date(config.updatedAt.toNumber() * 1000).toISOString()}`);

    // Role registry
    const roles = await client.fetchRoleRegistry(configPda);
    console.log(`  Roles:`);
    console.log(`    masterAuthority: ${roles.masterAuthority.toBase58()}`);
    console.log(`    pauser:          ${roles.pauser.toBase58()}`);
    console.log(`    blacklister:     ${roles.blacklister.toBase58()}`);
    console.log(`    seizer:          ${roles.seizer.toBase58()}`);

    // Minters
    const minters = await client.fetchAllMinters(mint.publicKey);
    console.log(`  Minters (${minters.length}):`);
    for (const m of minters) {
      console.log(`    - ${m.account.minter.toBase58()}`);
      console.log(`      active: ${m.account.isActive}, quota: ${m.account.mintQuota.toString()}, totalMinted: ${m.account.totalMinted.toString()}`);
    }

    // Supply
    const supply = await client.getTotalSupply(mint.publicKey);
    console.log(`  Supply:`);
    console.log(`    totalMinted:  ${supply.totalMinted.toString()}`);
    console.log(`    totalBurned:  ${supply.totalBurned.toString()}`);
    console.log(`    currentSupply: ${supply.currentSupply.toString()}`);
    console.log(`    decimals:     ${supply.decimals}`);

    // On-chain token supply
    const tokenSupply = await client.getTokenSupply(mint.publicKey);
    console.log(`  On-chain Token Supply:`);
    console.log(`    amount:   ${tokenSupply.amount}`);
    console.log(`    decimals: ${tokenSupply.decimals}`);
    console.log(`    uiAmount: ${tokenSupply.uiAmount}`);

    // Holders
    const holders = await client.fetchTokenHolders(mint.publicKey);
    console.log(`  Token Holders (${holders.length}):`);
    for (const h of holders) {
      console.log(`    - ${h.address.toBase58()}: ${h.amount} (ui: ${h.uiAmount})`);
    }

    console.log("  --- End State Dump ---\n");

    // Basic assertions on final state
    assert(config.isPaused === false, "Should not be paused at the end");
    assert(config.enablePermanentDelegate === true, "SSS-2 should have permanent delegate");
    assert(config.enableTransferHook === true, "SSS-2 should have transfer hook");
    assert(supply.currentSupply.gt(new BN(0)), "Should have positive supply");
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=== Results ===");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    for (const r of results) {
      if (!r.ok) {
        console.log(`  [FAIL] ${r.name}`);
        console.log(`         ${r.detail}`);
      }
    }
    process.exit(1);
  } else {
    console.log("All tests passed.");
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(2);
});
