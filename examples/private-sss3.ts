/**
 * Example: SSS-3 Private Stablecoin
 *
 * Creates a privacy-preserving stablecoin with confidential transfers.
 * This example shows SDK initialization only — the actual CT operations
 * (deposit, transfer, withdraw) require the spl-token CLI.
 *
 * For the full E2E confidential transfer demo, run:
 *   bash scripts/test-ct-e2e.sh
 *
 * Usage:
 *   npx ts-node examples/private-sss3.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const authority = Keypair.generate();
  const wallet = new Wallet(authority);

  await connection.confirmTransaction(
    await connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL)
  );

  // ── Create SSS-3 Private Stablecoin ──────────────────────────────────
  const stable = await SolanaStablecoin.create(connection, wallet, {
    preset: "SSS_3",
    name: "Private USD",
    symbol: "pUSD",
    decimals: 6,
    roles: {
      blacklister: authority.publicKey,
      seizer: authority.publicKey,
    },
  });

  console.log("✅ SSS-3 private stablecoin created");
  console.log("   Mint:", stable.mintAddress.toBase58());

  // ── Verify Extensions ────────────────────────────────────────────────
  const config = await stable.getConfig();
  console.log("\n📋 SSS-3 Config:");
  console.log("   Confidential Transfers:", config.enableConfidentialTransfers); // true
  console.log("   Permanent Delegate:", config.enablePermanentDelegate);
  console.log("   Transfer Hook:", config.enableTransferHook);

  // ── Mint Tokens (Public Balance) ─────────────────────────────────────
  await stable.updateMinter({
    minter: authority.publicKey,
    quota: BigInt(10_000_000_000),
  });

  const recipient = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(recipient.publicKey, LAMPORTS_PER_SOL)
  );

  await stable.mint({
    recipient: recipient.publicKey,
    amount: BigInt(1_000_000_000), // 1,000 tokens
  });

  console.log("✅ Minted 1,000 tokens (public balance)");

  // ── Next Steps: Confidential Transfer ────────────────────────────────
  console.log("\n📌 To perform confidential transfers, use the spl-token CLI:");
  console.log(`   1. spl-token configure-confidential-transfer-account --address <ATA>`);
  console.log(`   2. spl-token deposit-confidential-tokens ${stable.mintAddress.toBase58()} 500`);
  console.log(`   3. spl-token apply-pending-balance --address <ATA>`);
  console.log(`   4. spl-token transfer ${stable.mintAddress.toBase58()} 200 <DEST_ATA> --confidential`);
  console.log(`   5. spl-token withdraw-confidential-tokens ${stable.mintAddress.toBase58()} 100`);
  console.log("\n   Or run: bash scripts/test-ct-e2e.sh");
}

main().catch(console.error);
