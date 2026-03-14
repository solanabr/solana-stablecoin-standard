import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Presets, SolanaStablecoin } from '../src/index.js';

async function main(): Promise<void> {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const payer = Keypair.generate();

  const stablecoin = await SolanaStablecoin.create(connection, {
    payer,
    preset: Presets.SSS_2,
    name: 'Regulated USD',
    symbol: 'rUSD',
    uri: 'https://example.org/metadata/rusd.json',
    decimals: 6,
    treasury: new PublicKey('11111111111111111111111111111111'),
    initialMinterQuota: 5_000_000_000n,
    initialMinterWindowSeconds: 3600,
  });

  console.log('Mint:', stablecoin.addresses.mint.toBase58());
  console.log('Hook Config:', stablecoin.addresses.transferHookConfig?.toBase58());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
