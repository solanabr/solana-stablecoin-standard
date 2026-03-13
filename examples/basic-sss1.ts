/**
 * Example: SSS-1 Minimal Stablecoin — Full Lifecycle
 *
 * This example creates an SSS-1 stablecoin and walks through:
 *   1. Initialize the stablecoin
 *   2. Add a minter with quota
 *   3. Mint tokens to a recipient
 *   4. Burn tokens
 *   5. Freeze/thaw an account
 *   6. Pause/unpause operations
 *   7. Query config and supply
 *
 * Usage:
 *   npx ts-node examples/basic-sss1.ts
 *
 * Prerequisites:
 *   - solana-test-validator running
 *   - Program deployed to localnet
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

async function main() {
  // ── Setup ────────────────────────────────────────────────────────────
  const connection = new Connection("http://localhost:8899", "confirmed");
  const authority = Keypair.generate();
  const wallet = new Wallet(authority);

  // Fund the authority
  const airdropSig = await connection.requestAirdrop(
    authority.publicKey,
    5 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSig);
  console.log("✅ Authority funded:", authority.publicKey.toBase58());

  // ── 1. Create SSS-1 Stablecoin ───────────────────────────────────────
  const stable = await SolanaStablecoin.create(connection, wallet, {
    preset: "SSS_1",
    name: "Example USD",
    symbol: "eUSD",
    decimals: 6,
    uri: "https://example.com/metadata.json",
  });

  console.log("✅ SSS-1 stablecoin created");
  console.log("   Mint:", stable.mintAddress.toBase58());

  // ── 2. Add Minter ────────────────────────────────────────────────────
  await stable.updateMinter({
    minter: authority.publicKey,
    quota: BigInt(10_000_000_000), // 10,000 token quota
  });
  console.log("✅ Minter added with 10,000 token quota");

  // ── 3. Mint Tokens ───────────────────────────────────────────────────
  const recipient = Keypair.generate();
  await connection.requestAirdrop(recipient.publicKey, LAMPORTS_PER_SOL);

  await stable.mint({
    recipient: recipient.publicKey,
    amount: BigInt(1_000_000_000), // 1,000 tokens
  });

  const supply = await stable.getTotalSupply();
  console.log("✅ Minted 1,000 tokens. Total supply:", supply.toString());

  // ── 4. Burn Tokens ───────────────────────────────────────────────────
  // Note: burner must be added first
  await stable.updateRoles({
    addBurner: authority.publicKey,
  });

  await stable.burn({
    tokenAccount: recipient.publicKey,
    amount: BigInt(100_000_000), // Burn 100 tokens
  });
  console.log("✅ Burned 100 tokens");

  // ── 5. Freeze/Thaw ──────────────────────────────────────────────────
  await stable.freeze({ address: recipient.publicKey });
  console.log("✅ Account frozen");

  await stable.thaw({ address: recipient.publicKey });
  console.log("✅ Account thawed");

  // ── 6. Pause/Unpause ────────────────────────────────────────────────
  await stable.pause();
  console.log("✅ Operations paused");

  await stable.unpause();
  console.log("✅ Operations unpaused");

  // ── 7. Query ────────────────────────────────────────────────────────
  const config = await stable.getConfig();
  console.log("\n📋 Stablecoin Config:");
  console.log("   Name:", config.name);
  console.log("   Symbol:", config.symbol);
  console.log("   Decimals:", config.decimals);
  console.log("   Total Minted:", config.totalMinted.toString());
  console.log("   Total Burned:", config.totalBurned.toString());
  console.log("   Is Paused:", config.isPaused);
  console.log("   Permanent Delegate:", config.enablePermanentDelegate);
  console.log("   Transfer Hook:", config.enableTransferHook);
  console.log("   Confidential Transfers:", config.enableConfidentialTransfers);
}

main().catch(console.error);
