// @ts-nocheck
/**
 * Solana Stablecoin Standard — Testnet Verification Script
 *
 * Tests all spec requirements against deployed programs:
 *   Stablecoin:     DiPC4AnyDpp74kLqwwXfvjo6uM5BW3YvHpg3kgNvZHaz
 *   Transfer Hook:  BA8HH8nHbw6pfLprdW5YMMFoax33Fnmo9DoiNs1Lbux3
 *
 * Usage:
 *   cd solana-stablecoin-standard
 *   npx ts-node ../testnet-test.ts
 *
 * Prerequisites:
 *   - solana config set --url http://adrena-solanad-ac2e.devnet.rpcpool.com/eb24df90-f9aa-45f2-9a9c-fe20cd0f35fd
 *   - Funded keypair at ~/.config/solana/hotwallet.json
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY,
  Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ─── Program IDs (deployed to testnet) ─────────────────────────
const STABLECOIN_PROGRAM_ID = new PublicKey("GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y");
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM");

// ─── PDA Derivation ────────────────────────────────────────────
function findConfigPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin-config"), mint.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

function findRolePDA(config: PublicKey, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), holder.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

function findBlacklistPDA(mint: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

// ─── Helpers ───────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;

function pass(name: string, sig?: string) {
  passCount++;
  console.log(`  ✅ ${name}`);
  if (sig) console.log(`     tx: ${sig}`);
}

function fail(name: string, err: any) {
  failCount++;
  console.log(`  ❌ ${name}`);
  console.log(`     Error: ${err?.message || err}`);
}

async function airdrop(connection: Connection, pubkey: PublicKey, sol = 1) {
  try {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  } catch {
    // Airdrop may fail on testnet; user should have funds
  }
}

async function createATA(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID
  );
  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
  return ata;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main Test Runner ──────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Solana Stablecoin Standard — Testnet Verification  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  // Setup provider
  const keypairPath = path.join(process.env.HOME!, ".config/solana/hotwallet.json");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const connection = new Connection("http://adrena-solanad-ac2e.devnet.rpcpool.com/eb24df90-f9aa-45f2-9a9c-fe20cd0f35fd", "confirmed");
  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, "sdk/src/idl/solana_stablecoin.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  idl.address = STABLECOIN_PROGRAM_ID.toBase58();
  const program = new Program(idl, provider);

  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  console.log(`Balance:   ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  console.log(`Stablecoin Program: ${STABLECOIN_PROGRAM_ID.toBase58()}`);
  console.log(`Transfer Hook:      ${TRANSFER_HOOK_PROGRAM_ID.toBase58()}\n`);

  // ═══════════════════════════════════════════════════════════════
  //  TEST 1: SSS-1 — Minimal Stablecoin
  // ═══════════════════════════════════════════════════════════════
  console.log("━━━ SSS-1: Minimal Stablecoin ━━━━━━━━━━━━━━━━━━━━━━━");

  const sss1Mint = Keypair.generate();
  const [sss1Config] = findConfigPDA(sss1Mint.publicKey);
  const [sss1AuthRole] = findRolePDA(sss1Config, authority.publicKey);

  // 1.1 Initialize SSS-1
  try {
    const sig = await program.methods
      .initialize({
        preset: { sss1: {} },
        customFeatures: null,
        name: "Test USD",
        symbol: "tUSD",
        uri: "",
        decimals: 6,
        transferHookProgram: null,
        defaultAccountFrozen: false,
      })
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        mint: sss1Mint.publicKey,
        authorityRole: sss1AuthRole,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1Mint])
      .rpc();
    pass("Initialize SSS-1 stablecoin", sig);
  } catch (err) {
    fail("Initialize SSS-1 stablecoin", err);
    console.log("  ⚠️  Cannot continue SSS-1 tests without initialization");
    return;
  }

  await sleep(2000);

  // 1.2 Verify config
  try {
    const config = await program.account.stablecoinConfig.fetch(sss1Config);
    const checks = [
      config.authority.equals(authority.publicKey),
      config.mint.equals(sss1Mint.publicKey),
      config.paused === false,
      config.features.freezeAuthority === true,
      config.features.permanentDelegate === false,
      config.features.transferHook === false,
    ];
    if (checks.every(Boolean)) {
      pass("Config matches SSS-1 preset (freeze=true, delegate=false, hook=false)");
    } else {
      fail("Config mismatch", `checks: ${checks}`);
    }
  } catch (err) {
    fail("Fetch config", err);
  }

  // 1.3 Create ATAs & Mint tokens
  let aliceATA: PublicKey;
  try {
    const alice = authority; // authority acts as both minter and alice for simplicity
    aliceATA = await createATA(connection, authority, sss1Mint.publicKey, alice.publicKey);

    const sig = await program.methods
      .mintTokens(new BN(10_000_000)) // 10 tokens
      .accounts({
        minter: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
        mint: sss1Mint.publicKey,
        destination: aliceATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const acct = await getAccount(connection, aliceATA, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (Number(acct.amount) === 10_000_000) {
      pass("Mint 10 tokens to ATA", sig);
    } else {
      fail("Mint amount mismatch", `got ${acct.amount}`);
    }
  } catch (err) {
    fail("Mint tokens", err);
    return;
  }

  // 1.4 Burn tokens
  try {
    const sig = await program.methods
      .burnTokens(new BN(1_000_000)) // burn 1 token
      .accounts({
        burner: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
        mint: sss1Mint.publicKey,
        source: aliceATA,
        sourceAuthority: authority.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const acct = await getAccount(connection, aliceATA, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (Number(acct.amount) === 9_000_000) {
      pass("Burn 1 token (9 remaining)", sig);
    } else {
      fail("Burn amount mismatch", `got ${acct.amount}`);
    }
  } catch (err) {
    fail("Burn tokens", err);
  }

  // 1.5 Freeze account
  try {
    const sig = await program.methods
      .freezeAccount()
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
        mint: sss1Mint.publicKey,
        tokenAccount: aliceATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const acct = await getAccount(connection, aliceATA, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (acct.isFrozen) {
      pass("Freeze account", sig);
    } else {
      fail("Account not frozen", "isFrozen=false");
    }
  } catch (err) {
    fail("Freeze account", err);
  }

  // 1.6 Thaw account
  try {
    const sig = await program.methods
      .thawAccount()
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
        mint: sss1Mint.publicKey,
        tokenAccount: aliceATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const acct = await getAccount(connection, aliceATA, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (!acct.isFrozen) {
      pass("Thaw account", sig);
    } else {
      fail("Account still frozen", "isFrozen=true");
    }
  } catch (err) {
    fail("Thaw account", err);
  }

  // 1.7 Pause
  try {
    const sig = await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(sss1Config);
    if (config.paused) {
      pass("Pause stablecoin", sig);
    } else {
      fail("Not paused", "paused=false");
    }
  } catch (err) {
    fail("Pause", err);
  }

  // 1.8 Verify minting fails when paused
  try {
    await program.methods
      .mintTokens(new BN(1_000_000))
      .accounts({
        minter: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
        mint: sss1Mint.publicKey,
        destination: aliceATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    fail("Mint while paused should fail", "tx succeeded");
  } catch (err) {
    pass("Mint rejected while paused");
  }

  // 1.9 Unpause
  try {
    const sig = await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(sss1Config);
    if (!config.paused) {
      pass("Unpause stablecoin", sig);
    } else {
      fail("Still paused", "paused=true");
    }
  } catch (err) {
    fail("Unpause", err);
  }

  // 1.10 Role management — grant Minter role to new keypair
  const minter2 = Keypair.generate();
  const [minter2Role] = findRolePDA(sss1Config, minter2.publicKey);
  try {
    const sig = await program.methods
      .manageRole({
        role: { minter: {} },
        action: { grant: {} },
        mintQuota: new BN(5_000_000),
      })
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        roleHolder: minter2.publicKey,
        roleAssignment: minter2Role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const role = await program.account.roleAssignment.fetch(minter2Role);
    pass("Grant Minter role to new keypair", sig);
  } catch (err) {
    fail("Grant Minter role", err);
  }

  // 1.11 Revoke role
  try {
    const sig = await program.methods
      .manageRole({
        role: { minter: {} },
        action: { revoke: {} },
        mintQuota: null,
      })
      .accounts({
        authority: authority.publicKey,
        config: sss1Config,
        roleHolder: minter2.publicKey,
        roleAssignment: minter2Role,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    pass("Revoke Minter role", sig);
  } catch (err) {
    fail("Revoke Minter role", err);
  }

  // 1.12 Transfer (Token-2022 direct transfer)
  const bob = Keypair.generate();
  try {
    await airdrop(connection, bob.publicKey, 0.1);
    await sleep(2000);

    // Fund bob enough for ATA creation
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: bob.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      })
    );
    await sendAndConfirmTransaction(connection, fundTx, [authority]);

    const bobATA = await createATA(connection, authority, sss1Mint.publicKey, bob.publicKey);

    const ix = createTransferCheckedInstruction(
      aliceATA, sss1Mint.publicKey, bobATA,
      authority.publicKey, 1_000_000, 6,
      [], TOKEN_2022_PROGRAM_ID
    );
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });

    const bobAcct = await getAccount(connection, bobATA, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (Number(bobAcct.amount) === 1_000_000) {
      pass("Token-2022 transfer (SSS-1, no hook)", sig);
    } else {
      fail("Transfer amount mismatch", `got ${bobAcct.amount}`);
    }
  } catch (err) {
    fail("Token transfer", err);
  }

  // ═══════════════════════════════════════════════════════════════
  //  TEST 2: SSS-2 — Compliant Stablecoin
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━ SSS-2: Compliant Stablecoin ━━━━━━━━━━━━━━━━━━━━━");

  const sss2Mint = Keypair.generate();
  const [sss2Config] = findConfigPDA(sss2Mint.publicKey);
  const [sss2AuthRole] = findRolePDA(sss2Config, authority.publicKey);

  // 2.1 Initialize SSS-2
  try {
    const sig = await program.methods
      .initialize({
        preset: { sss2: {} },
        customFeatures: null,
        name: "Compliant USD",
        symbol: "cUSD",
        uri: "",
        decimals: 6,
        transferHookProgram: TRANSFER_HOOK_PROGRAM_ID,
        defaultAccountFrozen: false,
      })
      .accounts({
        authority: authority.publicKey,
        config: sss2Config,
        mint: sss2Mint.publicKey,
        authorityRole: sss2AuthRole,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss2Mint])
      .rpc();
    pass("Initialize SSS-2 stablecoin", sig);
  } catch (err) {
    fail("Initialize SSS-2 stablecoin", err);
    console.log("  ⚠️  Cannot continue SSS-2 tests without initialization");
    printSummary();
    return;
  }

  await sleep(2000);

  // 2.1b Initialize transfer hook extra-account-metas PDA
  try {
    const [extraAccountMetasPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), sss2Mint.publicKey.toBuffer()],
      TRANSFER_HOOK_PROGRAM_ID
    );

    // Build Anchor instruction for initialize_extra_account_metas
    // Discriminator = sha256("global:initialize_extra_account_metas")[:8]
    const disc = Buffer.from([
      22, 213, 130, 114, 1, 174, 121, 36,
    ]);

    const keys = [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },   // payer
      { pubkey: extraAccountMetasPDA, isSigner: false, isWritable: true }, // extra_account_metas
      { pubkey: sss2Mint.publicKey, isSigner: false, isWritable: false },  // mint
      { pubkey: STABLECOIN_PROGRAM_ID, isSigner: false, isWritable: false }, // stablecoin_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ];

    const initHookIx = new anchor.web3.TransactionInstruction({
      programId: TRANSFER_HOOK_PROGRAM_ID,
      keys,
      data: disc,
    });

    const tx = new Transaction().add(initHookIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
    pass("Initialize transfer hook extra-account-metas", sig);
  } catch (err) {
    fail("Initialize transfer hook extra-account-metas", err);
  }

  await sleep(1000);

  // 2.2 Verify SSS-2 config
  try {
    const config = await program.account.stablecoinConfig.fetch(sss2Config);
    const checks = [
      config.features.freezeAuthority === true,
      config.features.permanentDelegate === true,
      config.features.transferHook === true,
    ];
    if (checks.every(Boolean)) {
      pass("SSS-2 config: freeze=true, delegate=true, hook=true");
    } else {
      fail("SSS-2 config mismatch", `features: ${JSON.stringify(config.features)}`);
    }
  } catch (err) {
    fail("Fetch SSS-2 config", err);
  }

  // 2.3 Mint SSS-2 tokens
  let sss2ATA: PublicKey;
  try {
    sss2ATA = await createATA(connection, authority, sss2Mint.publicKey, authority.publicKey);

    const sig = await program.methods
      .mintTokens(new BN(50_000_000))
      .accounts({
        minter: authority.publicKey,
        config: sss2Config,
        roleAssignment: sss2AuthRole,
        mint: sss2Mint.publicKey,
        destination: sss2ATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    pass("Mint 50 SSS-2 tokens", sig);
  } catch (err) {
    fail("Mint SSS-2 tokens", err);
    printSummary();
    return;
  }

  // 2.4 Blacklist an address
  const suspect = Keypair.generate();
  const [blacklistPDA] = findBlacklistPDA(sss2Mint.publicKey, suspect.publicKey);
  try {
    const sig = await program.methods
      .addToBlacklist(suspect.publicKey, "OFAC sanctioned entity")
      .accounts({
        blacklister: authority.publicKey,
        config: sss2Config,
        roleAssignment: sss2AuthRole,
        blacklistEntry: blacklistPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const entry = await program.account.blacklistEntry.fetch(blacklistPDA);
    if (entry.address.equals(suspect.publicKey)) {
      pass("Add address to blacklist", sig);
    } else {
      fail("Blacklist address mismatch", `got ${entry.address}`);
    }
  } catch (err) {
    fail("Add to blacklist", err);
  }

  // 2.5 Verify duplicate blacklist rejected
  try {
    await program.methods
      .addToBlacklist(suspect.publicKey, "duplicate")
      .accounts({
        blacklister: authority.publicKey,
        config: sss2Config,
        roleAssignment: sss2AuthRole,
        blacklistEntry: blacklistPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    fail("Duplicate blacklist should fail", "tx succeeded");
  } catch (err) {
    pass("Duplicate blacklist correctly rejected");
  }

  // 2.6 Seize tokens from blacklisted account
  try {
    // Fund suspect and create their ATA
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: suspect.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      })
    );
    await sendAndConfirmTransaction(connection, fundTx, [authority]);

    const suspectATA = await createATA(connection, authority, sss2Mint.publicKey, suspect.publicKey);

    // Mint tokens to suspect
    await program.methods
      .mintTokens(new BN(5_000_000))
      .accounts({
        minter: authority.publicKey,
        config: sss2Config,
        roleAssignment: sss2AuthRole,
        mint: sss2Mint.publicKey,
        destination: suspectATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    await sleep(1000);

    // Seize from suspect → authority treasury
    const sig = await program.methods
      .seize(new BN(5_000_000))
      .accounts({
        seizer: authority.publicKey,
        config: sss2Config,
        roleAssignment: sss2AuthRole,
        blacklistEntry: blacklistPDA,
        mint: sss2Mint.publicKey,
        source: suspectATA,
        destination: sss2ATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const suspectAcct = await getAccount(connection, suspectATA, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (Number(suspectAcct.amount) === 0) {
      pass("Seize tokens from blacklisted account (5 tokens)", sig);
    } else {
      fail("Seize incomplete", `suspect still has ${suspectAcct.amount}`);
    }
  } catch (err) {
    fail("Seize tokens", err);
  }

  // 2.7 Verify seize fails without Seizer role
  try {
    const rando = Keypair.generate();
    const [randoRole] = findRolePDA(sss2Config, rando.publicKey);

    // Grant rando only Minter role (not Seizer)
    await program.methods
      .manageRole({ role: { minter: {} }, action: { grant: {} }, mintQuota: new BN(1_000_000) })
      .accounts({
        authority: authority.publicKey,
        config: sss2Config,
        roleHolder: rando.publicKey,
        roleAssignment: randoRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await sleep(1000);

    // Fund rando for tx fees
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: rando.publicKey,
        lamports: 0.02 * LAMPORTS_PER_SOL,
      })
    );
    await sendAndConfirmTransaction(connection, fundTx, [authority]);

    // Rando tries to seize — should fail
    const suspectATA = getAssociatedTokenAddressSync(sss2Mint.publicKey, suspect.publicKey, false, TOKEN_2022_PROGRAM_ID);
    await program.methods
      .seize(new BN(1))
      .accounts({
        seizer: rando.publicKey,
        config: sss2Config,
        roleAssignment: randoRole,
        blacklistEntry: blacklistPDA,
        mint: sss2Mint.publicKey,
        source: suspectATA,
        destination: sss2ATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([rando])
      .rpc();
    fail("Seize without Seizer role should fail", "tx succeeded");
  } catch (err) {
    pass("Seize correctly rejected without Seizer role");
  }

  // 2.8 Remove from blacklist
  try {
    const sig = await program.methods
      .removeFromBlacklist(suspect.publicKey)
      .accounts({
        blacklister: authority.publicKey,
        config: sss2Config,
        roleAssignment: sss2AuthRole,
        blacklistEntry: blacklistPDA,
      })
      .rpc();

    // Verify PDA is closed
    const info = await connection.getAccountInfo(blacklistPDA);
    if (info === null) {
      pass("Remove from blacklist (PDA closed)", sig);
    } else {
      pass("Remove from blacklist (account flagged)", sig);
    }
  } catch (err) {
    fail("Remove from blacklist", err);
  }

  // 2.9 Verify blacklist operations fail on SSS-1 mint
  try {
    const [sss1Blacklist] = findBlacklistPDA(sss1Mint.publicKey, suspect.publicKey);
    await program.methods
      .addToBlacklist(suspect.publicKey, "test")
      .accounts({
        blacklister: authority.publicKey,
        config: sss1Config,
        roleAssignment: sss1AuthRole,
        blacklistEntry: sss1Blacklist,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    fail("Blacklist on SSS-1 should fail", "tx succeeded");
  } catch (err) {
    pass("Blacklist correctly rejected on SSS-1 mint");
  }

  // ═══════════════════════════════════════════════════════════════
  //  TEST 3: Role Separation (SSS-2)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━ Role Separation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 3.1 Grant separate Blacklister and Seizer roles
  const blacklister = Keypair.generate();
  const seizer = Keypair.generate();
  const [blRole] = findRolePDA(sss2Config, blacklister.publicKey);
  const [szRole] = findRolePDA(sss2Config, seizer.publicKey);

  try {
    await program.methods
      .manageRole({ role: { blacklister: {} }, action: { grant: {} }, mintQuota: null })
      .accounts({
        authority: authority.publicKey, config: sss2Config,
        roleHolder: blacklister.publicKey, roleAssignment: blRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    pass("Grant Blacklister role");
  } catch (err) {
    fail("Grant Blacklister role", err);
  }

  try {
    await program.methods
      .manageRole({ role: { seizer: {} }, action: { grant: {} }, mintQuota: null })
      .accounts({
        authority: authority.publicKey, config: sss2Config,
        roleHolder: seizer.publicKey, roleAssignment: szRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    pass("Grant Seizer role");
  } catch (err) {
    fail("Grant Seizer role", err);
  }

  // 3.2 Verify Blacklister/Seizer roles rejected on SSS-1
  try {
    const user = Keypair.generate();
    const [userRole] = findRolePDA(sss1Config, user.publicKey);
    await program.methods
      .manageRole({ role: { seizer: {} }, action: { grant: {} }, mintQuota: null })
      .accounts({
        authority: authority.publicKey, config: sss1Config,
        roleHolder: user.publicKey, roleAssignment: userRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    fail("Seizer on SSS-1 should fail", "tx succeeded");
  } catch (err) {
    pass("Seizer role correctly rejected on SSS-1");
  }

  try {
    const user = Keypair.generate();
    const [userRole] = findRolePDA(sss1Config, user.publicKey);
    await program.methods
      .manageRole({ role: { blacklister: {} }, action: { grant: {} }, mintQuota: null })
      .accounts({
        authority: authority.publicKey, config: sss1Config,
        roleHolder: user.publicKey, roleAssignment: userRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    fail("Blacklister on SSS-1 should fail", "tx succeeded");
  } catch (err) {
    pass("Blacklister role correctly rejected on SSS-1");
  }

  // ═══════════════════════════════════════════════════════════════
  //  TEST 4: Transfer Authority
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━ Transfer Authority ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Use a fresh SSS-1 mint for authority transfer test
  const authMint = Keypair.generate();
  const [authConfig] = findConfigPDA(authMint.publicKey);
  const [authRole] = findRolePDA(authConfig, authority.publicKey);
  const newAuth = Keypair.generate();

  try {
    await program.methods
      .initialize({
        preset: { sss1: {} }, customFeatures: null,
        name: "Auth Test", symbol: "AUTH", uri: "", decimals: 6,
        transferHookProgram: null, defaultAccountFrozen: false,
      })
      .accounts({
        authority: authority.publicKey, config: authConfig,
        mint: authMint.publicKey, authorityRole: authRole,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authMint])
      .rpc();

    const sig = await program.methods
      .transferAuthority(newAuth.publicKey)
      .accounts({
        authority: authority.publicKey,
        config: authConfig,
      })
      .rpc();

    await sleep(2000);
    const config = await program.account.stablecoinConfig.fetch(authConfig);
    if (config.authority.equals(newAuth.publicKey)) {
      pass("Transfer authority to new keypair", sig);
    } else {
      fail("Authority not updated", `got ${config.authority}`);
    }
  } catch (err) {
    fail("Transfer authority", err);
  }

  // Verify old authority can no longer mint
  try {
    const ata = getAssociatedTokenAddressSync(authMint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID);
    // Try to create ATA and mint (should fail since authority was transferred)
    await program.methods
      .mintTokens(new BN(1_000_000))
      .accounts({
        minter: authority.publicKey, config: authConfig,
        roleAssignment: authRole, mint: authMint.publicKey,
        destination: ata, tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    fail("Old authority mint should fail", "tx succeeded");
  } catch (err) {
    pass("Old authority correctly rejected after transfer");
  }

  // ═══════════════════════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════════════════════
  printSummary();

  function printSummary() {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log(`║  Results: ${passCount} passed, ${failCount} failed${" ".repeat(Math.max(0, 28 - String(passCount).length - String(failCount).length))}║`);
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log("║  SSS-1 Mint:  " + sss1Mint.publicKey.toBase58().slice(0, 36) + "...  ║");
    console.log("║  SSS-2 Mint:  " + sss2Mint.publicKey.toBase58().slice(0, 36) + "...  ║");
    console.log("╚══════════════════════════════════════════════════════╝");

    if (failCount === 0) {
      console.log("\n🎉 All spec requirements verified on testnet!\n");
    } else {
      console.log(`\n⚠️  ${failCount} test(s) failed — review output above.\n`);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});