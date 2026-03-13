# SSS Oracle Module

## Purpose

The SSS Oracle module provides **price feed integration** for stablecoins pegged to assets other than USD. It enables mint and redeem operations to validate prices against external oracles before allowing token creation or redemption.

While SSS-1 and SSS-2 handle token lifecycle (mint, burn, blacklist, seize), they do not enforce pricing logic. The oracle module is a **separate program** that:

1. Stores oracle configuration per stablecoin
2. Reads Switchboard aggregator feeds
3. Validates price staleness and deviation from peg
4. Emits events for downstream consumers (e.g., mint/redeem programs that CPI into the oracle before pricing)

## Use Cases

### Non-USD Pegs

| Peg Asset | Oracle Feed Example | Use Case |
|-----------|---------------------|----------|
| **EUR** | EUR/USD or EUR/stable | Euro-backed stablecoins (e.g., EURC-style) |
| **BRL** | BRL/USD | Brazilian real stablecoins |
| **CPI-indexed** | Consumer Price Index feed | Inflation-adjusted stablecoins |
| **Other** | Custom Switchboard feed | Any fiat or basket peg |

### Integration with SSS-1/SSS-2

The oracle module is **not** built into the core `sss-token` program. Integration happens via CPI:

```
Mint/Redeem Flow (with oracle):
1. Client builds tx: [check_price_deviation, mint/redeem_instruction]
2. check_price_deviation (sss-oracle) validates feed, emits PriceChecked
3. mint/redeem (sss-token) executes if oracle check passed
```

Alternatively, a **wrapper program** can:

1. CPI into `sss_oracle::check_price_deviation` first
2. On success, CPI into `sss_token::mint` or `sss_token::burn`

This keeps the core SSS programs simple and allows issuers to attach oracle validation only when needed.

## Account Model

### OracleConfig

| Field | Type | Description |
|-------|------|-------------|
| `stablecoin` | Pubkey | PDA of the StablecoinConfig (seed) |
| `authority` | Pubkey | Can update config and toggle |
| `feed_address` | Pubkey | Switchboard aggregator feed pubkey |
| `max_deviation_bps` | u16 | Max allowed deviation from peg (e.g., 100 = 1%) |
| `max_staleness_seconds` | i64 | Max age of price before stale |
| `enabled` | bool | Whether oracle is active |
| `bump` | u8 | PDA bump |

**PDA seeds:** `["oracle_config", stablecoin_config_pubkey]`

## Instructions

| Instruction | Description | Auth |
|-------------|-------------|------|
| `initialize_oracle` | Create OracleConfig for a stablecoin | Caller (typically stablecoin authority) |
| `update_oracle` | Update feed_address, max_deviation_bps, max_staleness_seconds | Authority |
| `toggle_oracle` | Enable/disable oracle | Authority |
| `check_price_deviation` | Read feed, validate staleness, compute deviation, emit event | Any (read-only validation) |

### check_price_deviation

- Reads the Switchboard aggregator account at `feed_address`
- Validates price is not older than `max_staleness_seconds`
- Computes deviation from peg (1.0) in basis points
- Emits `PriceChecked` with `price`, `deviation_bps`, `within_bounds`
- **Reverts** with `PriceFeedStale` if stale, `PriceDeviationTooHigh` if beyond `max_deviation_bps`

## Events

| Event | Fields |
|-------|--------|
| `OracleInitialized` | stablecoin, feed_address, max_deviation_bps, max_staleness_seconds |
| `OracleUpdated` | stablecoin, feed_address, max_deviation_bps, max_staleness_seconds |
| `PriceChecked` | stablecoin, price, deviation_bps, within_bounds |

## Errors

| Error | When |
|-------|------|
| `OracleNotEnabled` | check_price_deviation called when oracle disabled |
| `PriceFeedStale` | Feed older than max_staleness_seconds |
| `PriceDeviationTooHigh` | Deviation exceeds max_deviation_bps |
| `Unauthorized` | update_oracle or toggle_oracle by non-authority |
| `InvalidConfig` | Invalid params (e.g., max_staleness_seconds <= 0) |

## Switchboard Integration

The module uses [Switchboard](https://switchboard.xyz) V2 aggregator feeds. You must:

1. Create a Switchboard feed for your peg (e.g., EUR/USD)
2. Ensure the feed is updated within your `max_staleness_seconds`
3. Pass the feed's pubkey to `initialize_oracle` as `feed_address`

The `check_price_deviation` instruction expects the oracle price to represent the peg (1.0 = perfect peg). For EUR/USD, the feed typically reports the rate (e.g., 1.08); the module computes deviation from 1.0. For CPI-indexed or custom pegs, configure the Switchboard job to output a normalized value where 1.0 = on-peg.

## Program ID

```
SSSQracXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz
```

Note: Uses Q instead of O in the prefix (base58 excludes O to avoid confusion with 0).

## Dependencies

- `anchor-lang` 0.31.1
- `solana-security-txt` (security.txt metadata)

The module includes a minimal Switchboard V2 aggregator parser (no external `switchboard-solana` crate) to avoid Anchor version conflicts. The parser reads price and timestamp from the standard Switchboard account layout.
