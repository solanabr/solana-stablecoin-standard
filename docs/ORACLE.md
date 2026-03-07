# Oracle Integration Module

## Overview

The Oracle Integration Module enables stablecoins to peg to non-USD assets using Switchboard price feeds. This allows creation of EUR, BRL, CPI-indexed, or commodity-backed stablecoins while maintaining the SSS token standards.

**Architecture**: The oracle module is a separate program that provides pricing for mint/redeem operations. The stablecoin token itself remains pure SSS-1/SSS-2/SSS-3.

## Use Cases

- **Multi-Currency Stablecoins**: EUR, GBP, JPY, BRL pegged tokens
- **Inflation-Indexed**: CPI-linked stablecoins
- **Commodity-Backed**: Gold, silver, oil-pegged tokens
- **Synthetic Assets**: Stock indices, crypto baskets

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  ORACLE ARCHITECTURE                    │
└─────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐
│  Switchboard     │────────▶│  Oracle Adapter  │
│  Price Feeds     │         │  Program         │
│  (EUR/USD, etc)  │         │                  │
└──────────────────┘         └──────────────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │  Mint/Redeem     │
                             │  Service         │
                             │                  │
                             └──────────────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │  SSS Token       │
                             │  (Pure SSS-1/2)  │
                             └──────────────────┘
```

## Supported Price Feeds

### Fiat Currencies

| Asset | Feed | Update Frequency |
|-------|------|------------------|
| EUR/USD | Switchboard EUR/USD | 60s |
| GBP/USD | Switchboard GBP/USD | 60s |
| JPY/USD | Switchboard JPY/USD | 60s |
| BRL/USD | Switchboard BRL/USD | 60s |
| CNY/USD | Switchboard CNY/USD | 60s |

### Inflation Indices

| Index | Feed | Update Frequency |
|-------|------|------------------|
| US CPI | Switchboard CPI | Daily |
| EU HICP | Switchboard HICP | Daily |

### Commodities

| Asset | Feed | Update Frequency |
|-------|------|------------------|
| Gold (XAU/USD) | Switchboard Gold | 60s |
| Silver (XAG/USD) | Switchboard Silver | 60s |
| Oil (WTI) | Switchboard Oil | 60s |

## Installation

```bash
# Install oracle module
npm install @stbr/sss-oracle

# Or with CLI
sss-token oracle install
```

## SDK Usage

### Initialize Oracle-Backed Stablecoin

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { OracleModule, SwitchboardFeed } from "@stbr/sss-oracle";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const authority = Keypair.fromSecretKey(/* your key */);

// Create EUR-pegged stablecoin
const eurStable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Euro Stablecoin",
  symbol: "EURS",
  decimals: 6,
  authority,
});

// Attach oracle module
const oracle = new OracleModule(connection, {
  stablecoin: eurStable,
  feed: SwitchboardFeed.EUR_USD,
  updateInterval: 60, // seconds
  deviationThreshold: 0.01, // 1% price deviation triggers update
});

await oracle.initialize(authority);
```

### Mint with Oracle Pricing

```typescript
// Get current exchange rate
const rate = await oracle.getPrice();
console.log(`Current EUR/USD rate: ${rate}`);

// Mint EUR stablecoin (automatically uses oracle price)
// User deposits $1,000 USD, receives ~900 EURS (at 1.11 EUR/USD)
await eurStable.mintWithOracle({
  recipient: userAddress,
  usdAmount: 1_000_000_000, // $1,000 USD (6 decimals)
  oracle,
  minter: minterKeypair,
});

// The oracle automatically calculates:
// EURS amount = USD amount / (EUR/USD rate)
// = 1000 / 1.11 = 900.90 EURS
```

### Redeem with Oracle Pricing

```typescript
// Redeem EUR stablecoin for USD
// User burns 500 EURS, receives ~555 USD (at 1.11 EUR/USD)
await eurStable.redeemWithOracle({
  owner: userKeypair,
  eursAmount: 500_000_000, // 500 EURS
  oracle,
});

// The oracle automatically calculates:
// USD amount = EURS amount * (EUR/USD rate)
// = 500 * 1.11 = 555 USD
```

### Query Oracle Data

```typescript
// Get current price
const price = await oracle.getPrice();
console.log(`Price: ${price}`);

// Get price with metadata
const priceData = await oracle.getPriceData();
console.log(`Price: ${priceData.price}`);
console.log(`Last updated: ${new Date(priceData.timestamp * 1000)}`);
console.log(`Confidence: ${priceData.confidence}`);

// Get historical prices
const history = await oracle.getPriceHistory(24); // last 24 hours
console.log(`24h high: ${Math.max(...history.map(p => p.price))}`);
console.log(`24h low: ${Math.min(...history.map(p => p.price))}`);
```

## CLI Usage

### Initialize Oracle

```bash
# Create EUR-pegged stablecoin with oracle
sss-token init --preset sss-2 \
  --name "Euro Stablecoin" \
  --symbol "EURS" \
  --oracle switchboard:EUR/USD

# Create BRL-pegged stablecoin
sss-token init --preset sss-2 \
  --name "Brazilian Real Stablecoin" \
  --symbol "BRLS" \
  --oracle switchboard:BRL/USD

# Create gold-backed stablecoin
sss-token init --preset sss-2 \
  --name "Gold Stablecoin" \
  --symbol "XAUS" \
  --oracle switchboard:XAU/USD
```

### Oracle Operations

```bash
# Check current oracle price
sss-token oracle price

# Mint with oracle pricing
sss-token oracle mint <recipient> <usd-amount>

# Redeem with oracle pricing
sss-token oracle redeem <token-amount>

# Update oracle feed
sss-token oracle update

# View oracle status
sss-token oracle status

# View price history
sss-token oracle history --hours 24
```

## Oracle Adapter Program

### Program Structure

```rust
// programs/oracle-adapter/src/lib.rs

use anchor_lang::prelude::*;
use switchboard_v2::AggregatorAccountData;

declare_id!("orac1e111111111111111111111111111111111111111");

#[program]
pub mod oracle_adapter {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        feed_address: Pubkey,
        update_interval: i64,
    ) -> Result<()> {
        let oracle_state = &mut ctx.accounts.oracle_state;
        oracle_state.authority = ctx.accounts.authority.key();
        oracle_state.feed_address = feed_address;
        oracle_state.update_interval = update_interval;
        oracle_state.last_update = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn get_price(ctx: Context<GetPrice>) -> Result<u64> {
        let feed = &ctx.accounts.price_feed;
        let aggregator = AggregatorAccountData::new(feed)?;
        
        // Get current price from Switchboard
        let price = aggregator.get_result()?.try_into()?;
        
        // Update last fetch time
        let oracle_state = &mut ctx.accounts.oracle_state;
        oracle_state.last_update = Clock::get()?.unix_timestamp;
        oracle_state.last_price = price;
        
        Ok(price)
    }

    pub fn calculate_mint_amount(
        ctx: Context<CalculateMintAmount>,
        usd_amount: u64,
    ) -> Result<u64> {
        let price = get_price(ctx.accounts.into())?;
        
        // Token amount = USD amount / price
        // Example: 1000 USD / 1.11 EUR/USD = 900.90 EUR
        let token_amount = (usd_amount as u128)
            .checked_mul(1_000_000)
            .unwrap()
            .checked_div(price as u128)
            .unwrap() as u64;
        
        Ok(token_amount)
    }

    pub fn calculate_redeem_amount(
        ctx: Context<CalculateRedeemAmount>,
        token_amount: u64,
    ) -> Result<u64> {
        let price = get_price(ctx.accounts.into())?;
        
        // USD amount = Token amount * price
        // Example: 500 EUR * 1.11 EUR/USD = 555 USD
        let usd_amount = (token_amount as u128)
            .checked_mul(price as u128)
            .unwrap()
            .checked_div(1_000_000)
            .unwrap() as u64;
        
        Ok(usd_amount)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + OracleState::LEN
    )]
    pub oracle_state: Account<'info, OracleState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetPrice<'info> {
    #[account(mut)]
    pub oracle_state: Account<'info, OracleState>,
    
    /// CHECK: Switchboard feed account
    pub price_feed: AccountInfo<'info>,
}

#[account]
pub struct OracleState {
    pub authority: Pubkey,
    pub feed_address: Pubkey,
    pub update_interval: i64,
    pub last_update: i64,
    pub last_price: u64,
}

impl OracleState {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8;
}
```

## Price Feed Configuration

### Switchboard Feed Addresses (Mainnet)

```typescript
export const SWITCHBOARD_FEEDS = {
  // Fiat currencies
  EUR_USD: new PublicKey("6gMq3mRCKf8aP3ttTyYhuijVZ2s9da9W6TFax4stnPPQ"),
  GBP_USD: new PublicKey("BjUgj6YCnFBZ49wF54ddBVA9qu8TeqkFtkbqmZcee8uW"),
  JPY_USD: new PublicKey("7Cfyymx49ipGsgEsCA1SsqBs3r7vLCKjKvJJfLvJNxXy"),
  BRL_USD: new PublicKey("5Z3F4NZqvQQqvFQmLYqXvJJqvJJqvJJqvJJqvJJqvJJq"),
  
  // Commodities
  XAU_USD: new PublicKey("8GWTTbNiXdmyZREXbjsZBmCRuzdPrW55dnZGDkTRjWvb"),
  XAG_USD: new PublicKey("4YvqJJhqvJJqvJJqvJJqvJJqvJJqvJJqvJJqvJJqvJJq"),
  
  // Inflation indices
  US_CPI: new PublicKey("CpiIndexAccount111111111111111111111111111111"),
};
```

### Custom Feed Integration

```typescript
// Use custom Switchboard feed
const customOracle = new OracleModule(connection, {
  stablecoin: myStable,
  customFeed: new PublicKey("YourCustomFeedAddress..."),
  updateInterval: 300, // 5 minutes
});
```

## Security Considerations

### Oracle Risks

⚠️ **Price Manipulation**: Always use multiple oracle sources for high-value operations

⚠️ **Stale Data**: Implement staleness checks and circuit breakers

⚠️ **Feed Downtime**: Have fallback mechanisms

### Best Practices

```typescript
// 1. Check price freshness
const priceData = await oracle.getPriceData();
const age = Date.now() / 1000 - priceData.timestamp;
if (age > 300) { // 5 minutes
  throw new Error("Price data is stale");
}

// 2. Check confidence interval
if (priceData.confidence > 0.02) { // 2%
  throw new Error("Price confidence too low");
}

// 3. Implement circuit breakers
const priceChange = Math.abs(priceData.price - lastPrice) / lastPrice;
if (priceChange > 0.10) { // 10% change
  // Pause operations and alert admin
  await stablecoin.pause({ authority });
}

// 4. Use multiple oracles
const prices = await Promise.all([
  oracle1.getPrice(),
  oracle2.getPrice(),
  oracle3.getPrice(),
]);
const medianPrice = prices.sort()[1]; // Use median
```

## Testing

```bash
# Test oracle integration
npm run test:oracle

# Test specific feed
npm run test:oracle:eur

# Simulate price updates
npm run test:oracle:simulate
```

## Deployment

### Deploy Oracle Adapter Program

```bash
# Build program
cd programs/oracle-adapter
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet
```

### Initialize Oracle for Stablecoin

```bash
# Initialize EUR oracle
sss-token oracle init \
  --feed switchboard:EUR/USD \
  --interval 60 \
  --deviation 0.01

# Verify oracle
sss-token oracle verify
```

## Examples

### EUR Stablecoin

```typescript
// Complete EUR stablecoin example
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { OracleModule, SwitchboardFeed } from "@stbr/sss-oracle";

// 1. Create EUR stablecoin
const eurs = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Euro Stablecoin",
  symbol: "EURS",
  decimals: 6,
  authority,
});

// 2. Attach oracle
const oracle = new OracleModule(connection, {
  stablecoin: eurs,
  feed: SwitchboardFeed.EUR_USD,
});
await oracle.initialize(authority);

// 3. Mint EURS
await eurs.mintWithOracle({
  recipient: user.publicKey,
  usdAmount: 1_000_000_000, // $1,000
  oracle,
  minter,
});

// 4. Check balance
const balance = await eurs.getBalance(user.publicKey);
console.log(`EURS balance: ${balance / 1_000_000}`);
```

### BRL Stablecoin (Brazilian Real)

```typescript
// BRL stablecoin for Brazilian market
const brls = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Brazilian Real Stablecoin",
  symbol: "BRLS",
  decimals: 2, // BRL uses 2 decimals
  authority,
});

const brlOracle = new OracleModule(connection, {
  stablecoin: brls,
  feed: SwitchboardFeed.BRL_USD,
});
await brlOracle.initialize(authority);
```

### Gold-Backed Stablecoin

```typescript
// Gold-backed token
const xaus = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "Gold Stablecoin",
  symbol: "XAUS",
  decimals: 6,
  authority,
});

const goldOracle = new OracleModule(connection, {
  stablecoin: xaus,
  feed: SwitchboardFeed.XAU_USD,
});
await goldOracle.initialize(authority);
```

## Roadmap

### Phase 1 (Current)
- [x] Switchboard integration
- [x] EUR, GBP, JPY, BRL feeds
- [x] Basic mint/redeem with oracle pricing

### Phase 2 (Q2 2026)
- [ ] Pyth Network integration
- [ ] Chainlink integration (when available)
- [ ] Multi-oracle aggregation
- [ ] Advanced circuit breakers

### Phase 3 (Q3 2026)
- [ ] Custom oracle support
- [ ] Time-weighted average pricing
- [ ] Volatility-adjusted pricing
- [ ] Cross-chain oracle bridges

## Resources

- [Switchboard Documentation](https://docs.switchboard.xyz/)
- [Pyth Network](https://pyth.network/)
- [Oracle Security Best Practices](https://blog.chain.link/oracle-security/)

## Support

For oracle-related questions:
- GitHub Issues: [github.com/solanabr/solana-stablecoin-standard/issues](https://github.com/solanabr/solana-stablecoin-standard/issues)
- Discord: #oracle-integration channel
- Email: oracle@superteam.fun

---

**Next Steps:**
1. Review [Oracle Adapter Program](../programs/oracle-adapter/src/lib.rs)
2. Check [Example Implementations](../examples/oracle-backed-stables.ts)
3. Read [Security Considerations](./SECURITY.md#oracle-risks)
