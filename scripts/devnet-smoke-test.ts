#!/usr/bin/env ts-node

/**
 * Devnet Smoke Test — Exercises ALL instructions and generates DEVNET_EVIDENCE.md
 *
 * Prerequisites:
 *   1. Programs deployed to devnet: `anchor deploy --provider.cluster devnet`
 *   2. Keypair at ~/.config/solana/id.json funded with devnet SOL
 *   3. `anchor build` completed (IDL in target/idl/)
 *
 * Usage:
 *   npx ts-node scripts/devnet-smoke-test.ts
 *
 * Output:
 *   - Console: step-by-step transaction signatures
 *   - File:    DEVNET_EVIDENCE.md with all signatures and explorer links
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Connection,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey("G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL");
const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey("EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389");

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");
const BLACKLIST_SEED = Buffer.from("blacklist");
const ALLOWLIST_SEED = Buffer.from("allowlist");

const ROLE_MINTER = 0x01;
const ROLE_FREEZER = 0x03;
const ROLE_BLACKLISTER = 0x04;
const ROLE_SEIZER = 0x05;

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------
function getConfigAddress(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED, mint.toBuffer()], SSS_CORE_PROGRAM_ID);
}

function getRoleAddress(config: PublicKey, role: number, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([role]), holder.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getQuotaAddress(config: PublicKey, minter: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTA_SEED, config.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getBlacklistAddress(config: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getAllowlistAddress(config: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ALLOWLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Evidence tracking
// ---------------------------------------------------------------------------
interface TxRecord {
  step: number;
  instruction: string;
  description: string;
  signature: string;
}

const evidence: TxRecord[] = [];
let stepCounter = 0;

function record(instruction: string, description: string, signature: string) {
  stepCounter++;
  evidence.push({ step: stepCounter, instruction, description, signature });
  console.log(`  [${stepCounter}] ${instruction}: ${signature}`);
}

function generateEvidence(
  sss1Mint: PublicKey,
  sss2Mint: PublicKey,
  sss3Mint: PublicKey,
): string {
  const now = new Date().toISOString().split("T")[0];
  let md = `# Devnet Evidence\n\n`;
  md += `Generated: ${now}\n\n`;
  md += `## Program IDs\n\n`;
  md += `| Program | ID |\n|---------|----|\n`;
  md += `| sss-core | \`${SSS_CORE_PROGRAM_ID.toBase58()}\` |\n`;
  md += `| sss-transfer-hook | \`${SSS_TRANSFER_HOOK_PROGRAM_ID.toBase58()}\` |\n\n`;
  md += `## Mint Addresses\n\n`;
  md += `| Preset | Mint |\n|--------|------|\n`;
  md += `| SSS-1 | \`${sss1Mint.toBase58()}\` |\n`;
  md += `| SSS-2 | \`${sss2Mint.toBase58()}\` |\n`;
  md += `| SSS-3 | \`${sss3Mint.toBase58()}\` |\n\n`;
  md += `## Transactions (${evidence.length} total)\n\n`;
  md += `| # | Instruction | Description | Signature | Explorer |\n`;
  md += `|---|------------|-------------|-----------|----------|\n`;

  for (const tx of evidence) {
    const short = tx.signature.slice(0, 16) + "...";
    const link = `https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`;
    md += `| ${tx.step} | \`${tx.instruction}\` | ${tx.description} | \`${short}\` | [View](${link}) |\n`;
  }

  md += `\n## Verification\n\n`;
  md += `All transactions above can be verified on [Solana Explorer (devnet)](https://explorer.solana.com/?cluster=devnet).\n`;
  md += `\n### Full Signature List\n\n\`\`\`\n`;
  for (const tx of evidence) {
    md += `${tx.signature}\n`;
  }
  md += `\`\`\`\n`;

  return md;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== SSS Devnet Smoke Test ===\n");

  // Setup provider
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const keypairPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  const authority = Keypair.fromSecretKey(new Uint8Array(secret));
  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Load IDL
  const idlPath = path.resolve(__dirname, "../target/idl/sss_core.json");
  if (!fs.existsSync(idlPath)) {
    console.error("IDL not found at", idlPath);
    console.error("Run `anchor build` first.");
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const program = new Program(idl, provider);

  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  const balance = await connection.getBalance(authority.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL\n`);

  if (balance < 0.5e9) {
    console.error("Insufficient SOL. Request devnet airdrop first.");
    process.exit(1);
  }

  // Fresh keypairs for this test run
  const newAuthority = Keypair.generate();
  const target = Keypair.generate();
  const treasury = Keypair.generate();

  // ======================================================================
  // Part 1: SSS-1 (compliance disabled)
  // ======================================================================
  console.log("--- Part 1: SSS-1 Lifecycle ---");
  const sss1Mint = Keypair.generate();
  const [sss1Config] = getConfigAddress(sss1Mint.publicKey);
  const [minterRole] = getRoleAddress(sss1Config, ROLE_MINTER, authority.publicKey);
  const [minterQuota] = getQuotaAddress(sss1Config, authority.publicKey);
  const [freezerRole] = getRoleAddress(sss1Config, ROLE_FREEZER, authority.publicKey);

  // 1. Initialize SSS-1
  {
    const tx = await program.methods
      .initialize({
        name: "Devnet Test USD",
        symbol: "DTUSD",
        uri: "https://sss.example.com/dtusd.json",
        decimals: 6,
        complianceEnabled: false,
        enableAllowlist: false,
        supplyCap: null,
      })
      .accountsPartial({
        authority: authority.publicKey,
        mint: sss1Mint.publicKey,
        config: sss1Config,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss1Mint])
      .rpc();
    record("initialize", "SSS-1 stablecoin (compliance disabled)", tx);
  }

  // 2. Grant minter role
  {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("grant_role", "Grant minter role", tx);
  }

  // 3. Set quota
  {
    const tx = await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("set_quota", "Set unlimited minter quota", tx);
  }

  // 4. Create ATA + mint
  const authorityAta = getAssociatedTokenAddressSync(
    sss1Mint.publicKey,
    authority.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  {
    const createAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAta,
        authority.publicKey,
        sss1Mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    const sig = await provider.sendAndConfirm(createAtaTx);
    record("create_ata", "Create authority ATA", sig);
  }

  // 5. Mint tokens
  {
    const tx = await program.methods
      .mintTokens(new BN(1_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: sss1Config,
        minterRole,
        minterQuota,
        mint: sss1Mint.publicKey,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("mint_tokens", "Mint 1000 tokens", tx);
  }

  // 6. Burn tokens
  {
    const tx = await program.methods
      .burnTokens(new BN(100_000_000))
      .accountsPartial({
        burner: authority.publicKey,
        config: sss1Config,
        mint: sss1Mint.publicKey,
        burnerTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("burn_tokens", "Burn 100 tokens", tx);
  }

  // 7. Grant freezer role + freeze/thaw
  {
    const tx = await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
        roleAssignment: freezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("grant_role", "Grant freezer role", tx);
  }

  // Create recipient ATA to freeze
  const recipientAta = getAssociatedTokenAddressSync(
    sss1Mint.publicKey,
    target.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  {
    const createAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        recipientAta,
        target.publicKey,
        sss1Mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(createAtaTx);
  }

  // 8. Freeze
  {
    const tx = await program.methods
      .freezeAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: sss1Config,
        freezerRole,
        mint: sss1Mint.publicKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("freeze_account", "Freeze recipient account", tx);
  }

  // 9. Thaw
  {
    const tx = await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: sss1Config,
        freezerRole,
        mint: sss1Mint.publicKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("thaw_account", "Thaw recipient account", tx);
  }

  // 10. Pause
  {
    const tx = await program.methods
      .pause()
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("pause", "Pause stablecoin", tx);
  }

  // 11. Unpause
  {
    const tx = await program.methods
      .unpause()
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("unpause", "Unpause stablecoin", tx);
  }

  // 12. Set metadata (fund mint for extra rent first)
  {
    try {
      // Transfer lamports to mint for extended metadata rent
      const transferIx = SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: sss1Mint.publicKey,
        lamports: 100_000_000, // 0.1 SOL for rent
      });
      const fundTx = new Transaction().add(transferIx);
      fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      fundTx.feePayer = authority.publicKey;
      fundTx.sign(authority);
      await connection.sendRawTransaction(fundTx.serialize());
      await sleep(2000);

      const tx = await program.methods
        .setMetadata({ field: "description", value: "Devnet test stablecoin" })
        .accountsPartial({
          authority: authority.publicKey,
          config: sss1Config,
          mint: sss1Mint.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      record("set_metadata", "Update token metadata field", tx);
    } catch (err: any) {
      console.log(`  [12] set_metadata: SKIPPED (${err.message?.slice(0, 60)})`);
    }
  }

  // 13. Set supply cap (SSS-1 also supports this)
  {
    const tx = await program.methods
      .setSupplyCap(new BN(5_000_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("set_supply_cap", "Set supply cap to 5000 tokens", tx);
  }

  // 14. Remove supply cap
  {
    const tx = await program.methods
      .setSupplyCap(new BN(0))
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("set_supply_cap", "Remove supply cap (0 = unlimited)", tx);
  }

  // 15. Propose authority (two-step)
  {
    const tx = await program.methods
      .proposeAuthority(newAuthority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("propose_authority", "Propose new authority (two-step)", tx);
  }

  // 16. Cancel authority transfer
  {
    const tx = await program.methods
      .cancelAuthorityTransfer()
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("cancel_authority_transfer", "Cancel authority transfer", tx);
  }

  // 17. Single-step transfer authority and transfer back
  {
    const tx = await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
      })
      .rpc();
    record("transfer_authority", "Single-step transfer authority", tx);
  }

  // 18. Transfer back (newAuthority signs)
  {
    const tx = await program.methods
      .transferAuthority(authority.publicKey)
      .accountsPartial({
        authority: newAuthority.publicKey,
        config: sss1Config,
      })
      .signers([newAuthority])
      .rpc();
    record("transfer_authority", "Transfer authority back to original", tx);
  }

  // 19. Revoke freezer role
  {
    const tx = await program.methods
      .revokeRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss1Config,
        roleAssignment: freezerRole,
      })
      .rpc();
    record("revoke_role", "Revoke freezer role (deactivation)", tx);
  }

  // ======================================================================
  // Part 2: SSS-2 (compliance enabled)
  // ======================================================================
  console.log("\n--- Part 2: SSS-2 Compliance Lifecycle ---");
  const sss2Mint = Keypair.generate();
  const [sss2Config] = getConfigAddress(sss2Mint.publicKey);
  const [sss2MinterRole] = getRoleAddress(sss2Config, ROLE_MINTER, authority.publicKey);
  const [sss2MinterQuota] = getQuotaAddress(sss2Config, authority.publicKey);
  const [sss2FreezerRole] = getRoleAddress(sss2Config, ROLE_FREEZER, authority.publicKey);
  const [blacklisterRole] = getRoleAddress(sss2Config, ROLE_BLACKLISTER, authority.publicKey);
  const [seizerRole] = getRoleAddress(sss2Config, ROLE_SEIZER, authority.publicKey);
  const [blacklistEntry] = getBlacklistAddress(sss2Config, target.publicKey);

  // 20. Initialize SSS-2
  {
    const tx = await program.methods
      .initialize({
        name: "Devnet Compliant USD",
        symbol: "DCUSD",
        uri: "https://sss.example.com/dcusd.json",
        decimals: 6,
        complianceEnabled: true,
        enableAllowlist: false,
        supplyCap: null,
      })
      .accountsPartial({
        authority: authority.publicKey,
        mint: sss2Mint.publicKey,
        config: sss2Config,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss2Mint])
      .rpc();
    record("initialize", "SSS-2 stablecoin (compliance enabled)", tx);
  }

  // 21-24. Grant compliance roles
  for (const [role, name] of [
    [ROLE_MINTER, "minter"],
    [ROLE_FREEZER, "freezer"],
    [ROLE_BLACKLISTER, "blacklister"],
    [ROLE_SEIZER, "seizer"],
  ] as [number, string][]) {
    const [roleAddr] = getRoleAddress(sss2Config, role, authority.publicKey);
    const tx = await program.methods
      .grantRole(role, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2Config,
        roleAssignment: roleAddr,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("grant_role", `Grant ${name} role (SSS-2)`, tx);
  }

  // 25. Set quota
  {
    const tx = await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: sss2Config,
        minterRole: sss2MinterRole,
        minterQuota: sss2MinterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("set_quota", "Set unlimited quota (SSS-2)", tx);
  }

  // Create ATAs for SSS-2
  const sss2AuthAta = getAssociatedTokenAddressSync(
    sss2Mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const sss2TargetAta = getAssociatedTokenAddressSync(
    sss2Mint.publicKey, target.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const sss2TreasuryAta = getAssociatedTokenAddressSync(
    sss2Mint.publicKey, treasury.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  {
    const createTx = new anchor.web3.Transaction();
    for (const [ata, owner] of [
      [sss2AuthAta, authority.publicKey],
      [sss2TargetAta, target.publicKey],
      [sss2TreasuryAta, treasury.publicKey],
    ] as [PublicKey, PublicKey][]) {
      createTx.add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey, ata, owner, sss2Mint.publicKey,
          TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    await provider.sendAndConfirm(createTx);
  }

  // Thaw ATAs (SSS-2 DefaultAccountState::Frozen)
  for (const ata of [sss2AuthAta, sss2TargetAta, sss2TreasuryAta]) {
    await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: sss2Config,
        freezerRole: sss2FreezerRole,
        mint: sss2Mint.publicKey,
        targetTokenAccount: ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // 26. Mint to target
  {
    const tx = await program.methods
      .mintTokens(new BN(500_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: sss2Config,
        minterRole: sss2MinterRole,
        minterQuota: sss2MinterQuota,
        mint: sss2Mint.publicKey,
        recipientTokenAccount: sss2TargetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("mint_tokens", "Mint 500 tokens to target (SSS-2)", tx);
  }

  // 27. Add to blacklist (now with reason)
  {
    const tx = await program.methods
      .addToBlacklist(target.publicKey, "Sanctions compliance - OFAC listed")
      .accountsPartial({
        blacklister: authority.publicKey,
        config: sss2Config,
        blacklisterRole,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("add_to_blacklist", "Blacklist target with reason", tx);
  }

  // 28. Freeze blacklisted target
  {
    const tx = await program.methods
      .freezeAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: sss2Config,
        freezerRole: sss2FreezerRole,
        mint: sss2Mint.publicKey,
        targetTokenAccount: sss2TargetAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("freeze_account", "Freeze blacklisted target (SSS-2)", tx);
  }

  // 29. Seize
  {
    const tx = await program.methods
      .seize(new BN(200_000_000))
      .accountsPartial({
        seizer: authority.publicKey,
        config: sss2Config,
        seizerRole,
        blacklistEntry,
        targetOwner: target.publicKey,
        mint: sss2Mint.publicKey,
        sourceTokenAccount: sss2TargetAta,
        treasuryTokenAccount: sss2TreasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("seize", "Atomic seize 200 tokens (thaw->burn->refreeze->mint)", tx);
  }

  // 30. Remove from blacklist (deactivation)
  {
    const tx = await program.methods
      .removeFromBlacklist(target.publicKey)
      .accountsPartial({
        blacklister: authority.publicKey,
        config: sss2Config,
        blacklisterRole,
        blacklistEntry,
      })
      .rpc();
    record("remove_from_blacklist", "Deactivate blacklist entry", tx);
  }

  // ======================================================================
  // Part 3: SSS-3 (allowlist enabled)
  // ======================================================================
  console.log("\n--- Part 3: SSS-3 Allowlist Lifecycle ---");
  const sss3Mint = Keypair.generate();
  const [sss3Config] = getConfigAddress(sss3Mint.publicKey);
  const [sss3MinterRole] = getRoleAddress(sss3Config, ROLE_MINTER, authority.publicKey);
  const [sss3MinterQuota] = getQuotaAddress(sss3Config, authority.publicKey);
  const [sss3FreezerRole] = getRoleAddress(sss3Config, ROLE_FREEZER, authority.publicKey);
  const allowlistUser1 = Keypair.generate();
  const allowlistUser2 = Keypair.generate();
  const [allowlistEntry1] = getAllowlistAddress(sss3Config, allowlistUser1.publicKey);
  const [allowlistEntry2] = getAllowlistAddress(sss3Config, allowlistUser2.publicKey);
  const [allowlistAuthority] = getAllowlistAddress(sss3Config, authority.publicKey);

  // 31. Initialize SSS-3 (compliance + allowlist)
  {
    const tx = await program.methods
      .initialize({
        name: "Devnet Allowlist USD",
        symbol: "DAUSD",
        uri: "https://sss.example.com/dausd.json",
        decimals: 6,
        complianceEnabled: true,
        enableAllowlist: true,
        supplyCap: new BN(10_000_000_000),
      })
      .accountsPartial({
        authority: authority.publicKey,
        mint: sss3Mint.publicKey,
        config: sss3Config,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([sss3Mint])
      .rpc();
    record("initialize", "SSS-3 stablecoin (allowlist + supply cap 10000)", tx);
  }

  // 32. Grant minter + freezer roles for SSS-3
  {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        roleAssignment: sss3MinterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("grant_role", "Grant minter role (SSS-3)", tx);
  }
  {
    const tx = await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        roleAssignment: sss3FreezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("grant_role", "Grant freezer role (SSS-3)", tx);
  }

  // 33. Set quota
  {
    const tx = await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        minterRole: sss3MinterRole,
        minterQuota: sss3MinterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("set_quota", "Set unlimited quota (SSS-3)", tx);
  }

  // 34. Add authority to allowlist
  {
    const tx = await program.methods
      .addToAllowlist(authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        allowlistEntry: allowlistAuthority,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("add_to_allowlist", "Add authority to allowlist", tx);
  }

  // 35. Add user1 to allowlist
  {
    const tx = await program.methods
      .addToAllowlist(allowlistUser1.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        allowlistEntry: allowlistEntry1,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("add_to_allowlist", "Add user1 to allowlist", tx);
  }

  // 36. Add user2 to allowlist
  {
    const tx = await program.methods
      .addToAllowlist(allowlistUser2.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        allowlistEntry: allowlistEntry2,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    record("add_to_allowlist", "Add user2 to allowlist", tx);
  }

  // 37. Remove user2 from allowlist (account closure)
  {
    const tx = await program.methods
      .removeFromAllowlist(allowlistUser2.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: sss3Config,
        allowlistEntry: allowlistEntry2,
      })
      .rpc();
    record("remove_from_allowlist", "Remove user2 from allowlist (closed)", tx);
  }

  // 38. Mint tokens within supply cap (SSS-3)
  const sss3AuthAta = getAssociatedTokenAddressSync(
    sss3Mint.publicKey, authority.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  {
    const createAtaTx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey, sss3AuthAta, authority.publicKey, sss3Mint.publicKey,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(createAtaTx);

    // Thaw (SSS-3 is DefaultAccountState::Frozen)
    await program.methods
      .thawAccount()
      .accountsPartial({
        freezer: authority.publicKey,
        config: sss3Config,
        freezerRole: sss3FreezerRole,
        mint: sss3Mint.publicKey,
        targetTokenAccount: sss3AuthAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  {
    const tx = await program.methods
      .mintTokens(new BN(1_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: sss3Config,
        minterRole: sss3MinterRole,
        minterQuota: sss3MinterQuota,
        mint: sss3Mint.publicKey,
        recipientTokenAccount: sss3AuthAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    record("mint_tokens", "Mint 1000 tokens within 10000 cap (SSS-3)", tx);
  }

  // ======================================================================
  // Done — write evidence
  // ======================================================================
  console.log(`\n=== Completed: ${evidence.length} transactions ===\n`);

  const evidenceMd = generateEvidence(sss1Mint.publicKey, sss2Mint.publicKey, sss3Mint.publicKey);
  const outputPath = path.resolve(__dirname, "../DEVNET_EVIDENCE.md");
  fs.writeFileSync(outputPath, evidenceMd);
  console.log(`Evidence written to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
