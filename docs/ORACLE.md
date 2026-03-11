# Oracle Integration

The Solana Stablecoin Standard supports oracle price feeds for non-USD pegged stablecoins. This enables stablecoins pegged to EUR, GBP, BRL, XAU (gold), or any asset with an on-chain price feed.

## Supported Oracles

- **Pyth Network** (primary): Production-grade price feeds with sub-second latency
- **Switchboard**: Decentralized oracle network
- **Custom**: Any oracle following the standard price account format

## Architecture

```
┌─────────────────────┐
│  Oracle Price Feed   │ ← Updated by oracle network
│  (Pyth / Switchboard)│
└──────────┬──────────┘
           │ reads price data
┌──────────▼──────────┐
│  OracleConfig PDA    │
│  Seeds: [oracle-      │
│   config, mint]       │
│                       │
│  price_feed: Pubkey   │
│  peg_currency: [u8;8] │
│  max_staleness: i64   │
│  price_exponent: i32  │
│  enabled: bool        │
└───────────────────────┘
```

## Quick Start

### 1. Configure Oracle

```typescript
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';
import { PublicKey } from '@solana/web3.js';

// Create a EUR-pegged stablecoin
const eurToken = await SolanaStablecoin.create(provider, {
  name: 'Euro Stablecoin',
  symbol: 'sEUR',
  uri: 'https://example.com/seur.json',
  preset: StablecoinPreset.SSS1,
});

// Configure Pyth EUR/USD price feed
const pythEurUsd = new PublicKey('... Pyth EUR/USD feed address ...');

await eurToken.oracle.configure({
  priceFeed: pythEurUsd,
  pegCurrency: 'EUR',
  maxStalenessSecs: 60,    // Reject prices older than 60 seconds
  priceExponent: -8,        // Pyth uses 10^-8 precision
});
```

### 2. CLI Usage

```bash
# Configure oracle
sss-token oracle set \
  --mint <address> \
  --feed <pyth-price-account> \
  --currency EUR \
  --staleness 60 \
  --exponent -8

# Check oracle status
sss-token oracle status --mint <address>

# Disable oracle
sss-token oracle disable --mint <address>
```

### 3. Check Oracle Status

```typescript
const oracleConfig = await eurToken.oracle.getConfig();
if (oracleConfig) {
  console.log('Oracle enabled:', oracleConfig.enabled);
  console.log('Peg currency:', String.fromCharCode(...oracleConfig.pegCurrency.filter(b => b)));
  console.log('Max staleness:', oracleConfig.maxStalenessSecs.toString(), 'seconds');
}
```

## On-Chain Validation

The oracle module validates Pyth V2 price data with the following checks:

1. **Magic number**: Verifies the account is a valid Pyth price account (0xa1b2c3d4)
2. **Trading status**: Rejects prices when the market is not in "trading" status
3. **Staleness**: Rejects prices older than `max_staleness_secs`
4. **Positive price**: Ensures the price is positive

## Pyth Price Feed Addresses

Common Pyth devnet price feeds:

| Pair | Devnet Address |
|------|---------------|
| EUR/USD | `9dmZ3TEMqqLbXKm6CgrJPH4QZZWsvQHMXzceUGvJCHNB` |
| GBP/USD | `7dARsQp6TShrcWq5suqo7KhPn6oqGsqABCHMpCRGXJEE` |
| BRL/USD | `5oKdEzLuqTcPBDKgKJmBeNJzSPQQdMa1u3L7U2p4eBkD` |
| XAU/USD | `8y3WWjvmSmVGWVKH1rCA7VTRkYXfsa7LhNk5tUjpavhG` |
| SOL/USD | `J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix` |

For mainnet feeds, see: https://pyth.network/price-feeds

## Supported Peg Currencies

Any 1-8 character ASCII currency code:

- **Fiat**: USD, EUR, GBP, JPY, BRL, CHF, AUD, CAD, etc.
- **Commodities**: XAU (gold), XAG (silver), XPT (platinum)
- **Crypto**: BTC, ETH, SOL
- **Indices**: SPX (S&P 500 via oracle)

## Security

- Only the `master_authority` can configure or disable the oracle
- Oracle configuration changes are logged in the audit trail
- Staleness checks prevent using outdated price data
- The oracle feed account is validated against Pyth's magic number format
- Price must be positive — zero or negative prices are rejected

## Disabling Oracle

```typescript
await eurToken.oracle.disable();
```

```bash
sss-token oracle disable --mint <address>
```

When disabled, the stablecoin operates without oracle price validation (standard USD peg behavior).
