/**
 * Example: SSS-2 Compliant Stablecoin — Compliance Flow
 *
 * Demonstrates the full compliance lifecycle:
 *   1. Initialize SSS-2 with blacklister + seizer roles
 *   2. Mint tokens to a user
 *   3. Blacklist a suspect address (sanctions match)
 *   4. Freeze the suspect's account
 *   5. Seize tokens to treasury
 *   6. Remove from blacklist (if cleared)
 *   7. Query compliance status
 *
 * Usage:
 *   npx ts-node examples/compliant-sss2.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const authority = Keypair.generate();
  const wallet = new Wallet(authority);

  // Fund authority
  await connection.confirmTransaction(
    await connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL)
  );

  // ── 1. Create SSS-2 Compliant Stablecoin ────────────────────────────
  const blacklister = authority; // In production, use a separate compliance key
  const seizer = authority;

  const stable = await SolanaStablecoin.create(connection, wallet, {
    preset: "SSS_2",
    name: "Compliant BRL",
    symbol: "cBRL",
    decimals: 6,
    roles: {
      blacklister: blacklister.publicKey,
      seizer: seizer.publicKey,
    },
  });

  console.log("✅ SSS-2 compliant stablecoin created");
  console.log("   Mint:", stable.mintAddress.toBase58());

  // ── 2. Mint Tokens ──────────────────────────────────────────────────
  await stable.updateMinter({
    minter: authority.publicKey,
    quota: BigInt(100_000_000_000),
  });

  const suspect = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(suspect.publicKey, LAMPORTS_PER_SOL)
  );

  await stable.mint({
    recipient: suspect.publicKey,
    amount: BigInt(5_000_000_000), // 5,000 tokens
  });
  console.log("✅ Minted 5,000 tokens to suspect address");

  // ── 3. Compliance: Blacklist ─────────────────────────────────────────
  await stable.compliance.blacklistAdd(
    suspect.publicKey,
    "OFAC sanctions match — SDN list entry"
  );
  console.log("✅ Address blacklisted: OFAC sanctions match");

  // Verify blacklist status
  const isBlacklisted = await stable.compliance.isBlacklisted(suspect.publicKey);
  console.log("   Blacklisted:", isBlacklisted); // true

  // Get blacklist entry details
  const entry = await stable.compliance.getBlacklistEntry(suspect.publicKey);
  if (entry) {
    console.log("   Reason:", entry.reason);
    console.log("   Blacklisted by:", entry.blacklistedBy.toBase58());
  }

  // ── 4. Freeze Account ──────────────────────────────────────────────
  await stable.freeze({ address: suspect.publicKey });
  console.log("✅ Suspect account frozen");

  // ── 5. Seize Tokens ────────────────────────────────────────────────
  const treasury = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(treasury.publicKey, LAMPORTS_PER_SOL)
  );

  await stable.compliance.seize(suspect.publicKey, treasury.publicKey);
  console.log("✅ Tokens seized to treasury");

  // ── 6. Remove from Blacklist (cleared by review) ───────────────────
  await stable.compliance.blacklistRemove(suspect.publicKey);
  console.log("✅ Address removed from blacklist (cleared)");

  const stillBlacklisted = await stable.compliance.isBlacklisted(suspect.publicKey);
  console.log("   Blacklisted:", stillBlacklisted); // false

  // ── 7. Query Config ────────────────────────────────────────────────
  const config = await stable.getConfig();
  console.log("\n📋 SSS-2 Config:");
  console.log("   Permanent Delegate:", config.enablePermanentDelegate); // true
  console.log("   Transfer Hook:", config.enableTransferHook);           // true
  console.log("   Total Minted:", config.totalMinted.toString());
  console.log("   Total Burned:", config.totalBurned.toString());
}

main().catch(console.error);
