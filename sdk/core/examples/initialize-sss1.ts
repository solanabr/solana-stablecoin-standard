import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Presets, SolanaStablecoin } from '../src/index.js';

async function main(): Promise<void> {
  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  const payer = Keypair.generate();

  const stablecoin = await SolanaStablecoin.create(connection, {
    payer,
    preset: Presets.SSS_1,
    name: 'Example USD',
    symbol: 'eUSD',
    uri: 'https://example.org/metadata/eusd.json',
    decimals: 6,
    treasury: new PublicKey('11111111111111111111111111111111'),
    initialMinterQuota: 1_000_000_000n,
    initialMinterWindowSeconds: 86400,
  });

  console.log('Mint:', stablecoin.addresses.mint.toBase58());
  console.log('Config:', stablecoin.addresses.config.toBase58());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
