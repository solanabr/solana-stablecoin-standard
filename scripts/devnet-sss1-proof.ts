/**
 * SSS-1 Devnet Lifecycle Proof
 *
 * Demonstrates the full SSS-1 (minimal stablecoin) lifecycle on devnet:
 * 1. Initialize mint with SSS-1 preset
 * 2. Grant minter role
 * 3. Mint tokens
 * 4. Burn tokens
 * 5. Freeze account
 * 6. Thaw account
 * 7. Pause operations
 * 8. Unpause operations
 *
 * Usage: npx ts-node scripts/devnet-sss1-proof.ts
 * Requires: Funded devnet keypair (ANCHOR_WALLET > KEYPAIR_PATH > ~/Documents/secret/sss-devnet-keypair.json)
 */

import * as fs from "fs";
import * as path from "path";
import {
  Connection,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import { SSS } from "../sdk/dist";

const DEVNET_RPC = process.env.DEVNET_RPC || clusterApiUrl("devnet");

interface ProofResult {
  preset: "sss-1";
  mint: string;
  config: string;
  transactions: Record<string, string>;
  timestamp: string;
  cluster: string;
}

async function main() {
  console.log("=== SSS-1 Devnet Lifecycle Proof ===\n");

  // Load keypair
  const keypairPath = process.env.ANCHOR_WALLET
    || process.env.KEYPAIR_PATH
    || path.join(process.env.HOME!, "Documents/secret/sss-devnet-keypair.json");
  const rawKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(rawKey));

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  const balance = await connection.getBalance(payer.publicKey);
  console.log(
    `Payer: ${payer.publicKey.toBase58()} (${(balance / 1e9).toFixed(4)} SOL)`,
  );
  if (balance < 0.1 * 1e9) {
    throw new Error(
      "Insufficient devnet balance. Fund with: solana airdrop 2 --url devnet",
    );
  }

  const txSigs: Record<string, string> = {};

  // 1. Create SSS-1 stablecoin
  console.log("\n1. Creating SSS-1 stablecoin...");
  const sss = await SSS.create(provider, {
    preset: "sss-1",
    name: "SSS-1 Proof Token",
    symbol: "S1PT",
    uri: "https://sss.dev/metadata/sss1-proof.json",
    decimals: 6,
    supplyCap: BigInt(1_000_000_000_000), // 1M tokens
  });
  txSigs.initialize = "see-explorer"; // Created in SSS.create
  console.log(`   Mint: ${sss.mint.toBase58()}`);
  console.log(`   Config: ${sss.configPda.toBase58()}`);

  // 2. Grant minter role
  console.log("\n2. Granting minter role...");
  txSigs.grantMinter = await sss.roles.grant(payer.publicKey, "minter");
  console.log(`   Tx: ${txSigs.grantMinter}`);

  // 3. Create ATA and mint tokens
  console.log("\n3. Minting tokens...");
  const ata = getAssociatedTokenAddressSync(
    sss.mint,
    payer.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const createAtaTx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      payer.publicKey,
      sss.mint,
      TOKEN_2022_PROGRAM_ID,
    ),
  );
  await provider.sendAndConfirm(createAtaTx);
  txSigs.mint = await sss.mintTokens(ata, BigInt(500_000_000_000)); // 500K
  console.log(`   Minted 500K tokens. Tx: ${txSigs.mint}`);

  // 4. Burn tokens
  console.log("\n4. Burning tokens...");
  txSigs.burn = await sss.burn(ata, BigInt(100_000_000_000)); // 100K
  console.log(`   Burned 100K tokens. Tx: ${txSigs.burn}`);

  // 5. Grant freezer and freeze account
  console.log("\n5. Freezing account...");
  txSigs.grantFreezer = await sss.roles.grant(payer.publicKey, "freezer");
  txSigs.freeze = await sss.freeze(ata);
  console.log(`   Frozen. Tx: ${txSigs.freeze}`);

  // 6. Thaw account
  console.log("\n6. Thawing account...");
  txSigs.thaw = await sss.thaw(ata);
  console.log(`   Thawed. Tx: ${txSigs.thaw}`);

  // 7. Grant pauser and pause
  console.log("\n7. Pausing operations...");
  txSigs.grantPauser = await sss.roles.grant(payer.publicKey, "pauser");
  txSigs.pause = await sss.pause();
  console.log(`   Paused. Tx: ${txSigs.pause}`);

  // 8. Unpause
  console.log("\n8. Unpausing operations...");
  txSigs.unpause = await sss.unpause();
  console.log(`   Unpaused. Tx: ${txSigs.unpause}`);

  // 9. Fetch info
  console.log("\n9. Final state:");
  const info = await sss.info();
  console.log(`   Preset: ${info.preset}`);
  console.log(`   Supply: ${info.currentSupply} (minted: ${info.totalMinted}, burned: ${info.totalBurned})`);
  console.log(`   Cap: ${info.supplyCap}`);
  console.log(`   Paused: ${info.paused}`);

  // Save proof
  const proof: ProofResult = {
    preset: "sss-1",
    mint: sss.mint.toBase58(),
    config: sss.configPda.toBase58(),
    transactions: txSigs,
    timestamp: new Date().toISOString(),
    cluster: "devnet",
  };

  const outPath = path.join(__dirname, "..", "deployments", "devnet-sss1-proof.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(proof, null, 2));
  console.log(`\nProof saved to: ${outPath}`);
  console.log("\n=== SSS-1 Lifecycle Proof Complete ===");
}

main().catch((err) => {
  console.error("SSS-1 proof failed:", err);
  process.exit(1);
});
