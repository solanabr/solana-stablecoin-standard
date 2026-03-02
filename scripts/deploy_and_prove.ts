/**
 * deploy_and_prove.ts
 *
 * Deploys SSS programs (already done) and generates proof transactions
 * demonstrating all key SSS operations on Solana devnet.
 *
 * Run: npx ts-node scripts/deploy_and_prove.ts
 */

import * as anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const RPC = 'https://api.devnet.solana.com';

async function main() {
  // Load wallet
  const keypairPath = process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), '.config', 'solana', 'id.json');
  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf-8')) as number[];
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(RPC, 'confirmed');
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(keypair),
    { commitment: 'confirmed' },
  );
  anchor.setProvider(provider);

  console.log('=== SSS Devnet Proof Transactions ===');
  console.log('Authority:', keypair.publicKey.toBase58());
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL\n');

  // Dynamic import of SDK
  const { SolanaStablecoin, StablecoinPreset } = await import('../sdk/src/index');
  const { BN } = anchor;

  // ─── 1. Initialize SSS-1 ─────────────────────────────────────────────────
  console.log('[1] Initializing SSS-1 stablecoin (DUSD)...');
  const sss1Result = await SolanaStablecoin.initialize(provider, {
    name: 'Demo USD',
    symbol: 'DUSD',
    uri: 'https://raw.githubusercontent.com/TheAuroraAI/solana-stablecoin-standard/main/metadata/dusd.json',
    decimals: 6,
    maxSupply: new BN(1_000_000_000_000), // 1M DUSD
    preset: StablecoinPreset.SSS1,
  });
  console.log('  ✓ Mint:', sss1Result.mint.toBase58());
  console.log('  ✓ Signature:', sss1Result.signature);

  const sss1 = SolanaStablecoin.load(provider, sss1Result.mint);

  // ─── 2. Mint tokens ───────────────────────────────────────────────────────
  console.log('\n[2] Minting 100 DUSD to authority...');
  const ata1 = await sss1.getOrCreateAta(keypair.publicKey);
  const mintSig = await sss1.mint(ata1, new BN(100_000_000)); // 100 DUSD
  console.log('  ✓ ATA:', ata1.toBase58());
  console.log('  ✓ Signature:', mintSig);

  // ─── 3. Pause / Unpause ──────────────────────────────────────────────────
  console.log('\n[3] Pausing transfers...');
  const pauseSig = await sss1.pause();
  console.log('  ✓ Pause signature:', pauseSig);

  console.log('[3b] Unpausing transfers...');
  const unpauseSig = await sss1.unpause();
  console.log('  ✓ Unpause signature:', unpauseSig);

  // ─── 4. Initialize SSS-2 ─────────────────────────────────────────────────
  console.log('\n[4] Initializing SSS-2 stablecoin (CUSD)...');
  const sss2Result = await SolanaStablecoin.initialize(provider, {
    name: 'Compliant USD',
    symbol: 'CUSD',
    uri: 'https://raw.githubusercontent.com/TheAuroraAI/solana-stablecoin-standard/main/metadata/cusd.json',
    decimals: 6,
    maxSupply: new BN(500_000_000_000), // 500K CUSD
    preset: StablecoinPreset.SSS2,
    blacklister: keypair.publicKey,
    seizer: keypair.publicKey,
  });
  console.log('  ✓ Mint:', sss2Result.mint.toBase58());
  console.log('  ✓ Signature:', sss2Result.signature);

  const sss2 = SolanaStablecoin.load(provider, sss2Result.mint);

  // ─── 5. SSS-2: Mint tokens ────────────────────────────────────────────────
  console.log('\n[5] Minting 50 CUSD to authority...');
  const ata2 = await sss2.getOrCreateAta(keypair.publicKey);
  const mintSig2 = await sss2.mint(ata2, new BN(50_000_000));
  console.log('  ✓ Signature:', mintSig2);

  // ─── 6. SSS-2: Blacklist a test address ──────────────────────────────────
  const testTarget = Keypair.generate().publicKey;
  console.log('\n[6] Adding test address to blacklist...');
  console.log('  Target:', testTarget.toBase58());
  const blacklistSig = await sss2.compliance.blacklistAdd(testTarget, 1);
  console.log('  ✓ Signature:', blacklistSig);

  // Verify blacklist status
  const isBlacklisted = await sss2.compliance.isBlacklisted(testTarget);
  console.log('  ✓ Verified blacklisted:', isBlacklisted);

  // ─── 7. SSS-2: Remove from blacklist ─────────────────────────────────────
  console.log('\n[7] Removing test address from blacklist...');
  const removeSig = await sss2.compliance.blacklistRemove(testTarget);
  console.log('  ✓ Signature:', removeSig);

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n=== PROOF SUMMARY ===');
  const supply1 = await sss1.getTotalSupply();
  const supply2 = await sss2.getTotalSupply();

  const summary = {
    deployer: keypair.publicKey.toBase58(),
    network: 'devnet',
    sss1: {
      mint: sss1Result.mint.toBase58(),
      supply: supply1.toString(),
      transactions: {
        initialize: sss1Result.signature,
        mint: mintSig,
        pause: pauseSig,
        unpause: unpauseSig,
      },
    },
    sss2: {
      mint: sss2Result.mint.toBase58(),
      supply: supply2.toString(),
      transactions: {
        initialize: sss2Result.signature,
        mint: mintSig2,
        blacklist_add: blacklistSig,
        blacklist_remove: removeSig,
      },
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  // Write evidence file
  fs.writeFileSync(
    path.join(__dirname, '..', 'DEVNET_EVIDENCE.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log('\n✓ Evidence written to DEVNET_EVIDENCE.json');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
