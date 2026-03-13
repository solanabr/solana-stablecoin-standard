/**
 * Example: Supply Cap Enforcement
 *
 * Demonstrates the supply cap feature — a hard ceiling on total mintable tokens.
 * This prevents over-minting from compromised keys, which is critical for
 * regulated stablecoins that need to maintain 1:1 reserve backing.
 *
 * Usage:
 *   npx ts-node examples/supply-cap.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin } from "@stbr/sss-token";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const authority = Keypair.generate();
  const wallet = new Wallet(authority);

  await connection.confirmTransaction(
    await connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL)
  );

  // ── Create Stablecoin WITH Supply Cap ────────────────────────────────
  const SUPPLY_CAP = BigInt(10_000_000_000); // 10,000 tokens max

  const stable = await SolanaStablecoin.create(connection, wallet, {
    preset: "SSS_1",
    name: "Capped USD",
    symbol: "cUSD",
    decimals: 6,
    supplyCap: SUPPLY_CAP,
  });

  console.log("✅ Stablecoin created with supply cap");
  console.log("   Supply Cap:", (Number(SUPPLY_CAP) / 1e6).toLocaleString(), "tokens");

  // ── Add Minter ──────────────────────────────────────────────────────
  await stable.updateMinter({
    minter: authority.publicKey,
    quota: BigInt(50_000_000_000), // Minter quota > cap (cap takes precedence)
  });

  // ── Mint Up to Cap ──────────────────────────────────────────────────
  const recipient = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(recipient.publicKey, LAMPORTS_PER_SOL)
  );

  // Mint 8,000 tokens (under cap)
  await stable.mint({
    recipient: recipient.publicKey,
    amount: BigInt(8_000_000_000),
  });
  console.log("✅ Minted 8,000 tokens (under cap)");

  // Mint 2,000 more (exactly at cap)
  await stable.mint({
    recipient: recipient.publicKey,
    amount: BigInt(2_000_000_000),
  });
  console.log("✅ Minted 2,000 more (exactly at 10,000 cap)");

  // ── Try to Mint Over Cap ────────────────────────────────────────────
  try {
    await stable.mint({
      recipient: recipient.publicKey,
      amount: BigInt(1), // Even 1 base unit should fail
    });
    console.log("❌ Should not reach here");
  } catch (err: any) {
    console.log("✅ Mint over cap rejected:", err.message.includes("SupplyCapExceeded")
      ? "SupplyCapExceeded"
      : err.message.slice(0, 80));
  }

  // ── Query Final State ──────────────────────────────────────────────
  const config = await stable.getConfig();
  console.log("\n📋 Final State:");
  console.log("   Total Minted:", (Number(config.totalMinted) / 1e6).toLocaleString(), "tokens");
  console.log("   Supply Cap:", (Number(SUPPLY_CAP) / 1e6).toLocaleString(), "tokens");
  console.log("   Remaining:", ((Number(SUPPLY_CAP) - Number(config.totalMinted)) / 1e6).toLocaleString(), "tokens");
}

main().catch(console.error);
