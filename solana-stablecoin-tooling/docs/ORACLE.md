# Oracle Integration Module

Separate Anchor program for oracle-based pricing of SSS stablecoins, supporting non-USD pegs.

## Architecture

The oracle is **intentionally decoupled** from core SSS-1/SSS-2 token logic. It provides pricing context for mint/redeem operations via CPI.

```
┌─────────────────┐     CPI      ┌──────────────────┐
│  Mint/Redeem    │ ──────────── │  Oracle Pricing   │
│  Service        │  validate    │  Program          │
└─────────────────┘              └────────┬─────────┘
                                          │ reads
                                 ┌────────▼─────────┐
                                 │  Pyth / Switchboard│
                                 │  Price Feed        │
                                 └───────────────────┘
```

## Security Model

### Validation Layers (applied on every refresh/validate)

| Check | Description | Error |
|-------|------------|-------|
| **Feed owner** | Account owner must match `expected_feed_owner` stored at init | `InvalidFeedOwner` |
| **Feed address** | Must match stored `feed_address` | `InvalidFeedData` |
| **Staleness** | Price age ≤ `max_staleness_secs` | `StalePrice` |
| **Pyth status** | Pyth feed must report trading status (status=1) | `PythNotTrading` |
| **Confidence** | Confidence/price ratio ≤ `max_confidence_bps` | `ConfidenceTooWide` |
| **Peg deviation** | |price - target| ≤ `max_deviation_bps` of target | `PriceDeviationExceeded` |
| **Circuit breaker** | Price within `[circuit_breaker_min, circuit_breaker_max]` | `CircuitBreakerTripped` |

### Circuit Breaker

The circuit breaker **trips permanently** when price exits hard bounds. Once tripped:
- All `refresh_price` and `validate_price` calls fail
- Only the authority can reset via `update_oracle_config(reset_circuit_breaker: true)`
- This prevents cascading damage from oracle manipulation or flash crashes

### Feed Owner Validation

At initialization, the feed account's on-chain owner (the oracle program ID) is captured and stored as `expected_feed_owner`. On every subsequent refresh/validate, the feed account's owner is re-checked. This prevents an attacker from substituting a spoofed feed account owned by a different program.

### Known Limitations (Proof-of-Concept)

- **Raw offset parsing**: Pyth/Switchboard data is parsed at fixed byte offsets. This is fragile across account version changes. Production should use official SDK crates.
- **No TWAP**: Uses spot price only. Production should implement time-weighted average pricing.
- **Single feed**: No multi-oracle aggregation or fallback feeds.
- **No slippage model**: The oracle validates price but doesn't model slippage for large trades.

## Instructions

### `initialize_oracle`
| Param | Type | Description |
|-------|------|-------------|
| `provider` | `OracleProvider` | `Pyth` or `Switchboard` |
| `base_currency` | `BaseCurrency` | `USD`, `EUR`, `BRL`, `GBP`, `JPY`, `CPI`, `Custom` |
| `max_staleness_secs` | `u64` | Max price age (e.g., 60) |
| `max_deviation_bps` | `u16` | Max peg deviation in bps (100 = 1%) |
| `max_confidence_bps` | `u16` | Max confidence/price ratio in bps (200 = 2%) |
| `target_price` | `u64` | Peg price × 10^8 |
| `circuit_breaker_min` | `u64` | Hard floor × 10^8 (0 = disabled) |
| `circuit_breaker_max` | `u64` | Hard ceiling × 10^8 (0 = disabled) |

### `refresh_price`
Permissionless. Reads feed, validates all checks, updates cached price. Trips circuit breaker if bounds exceeded.

### `validate_price`
CPI target. Full validation + returns `PriceQuote` via `set_return_data`.

### `update_oracle_config`
Authority only. Can update any parameter and reset circuit breaker.

## SDK Usage

```typescript
import { OraclePricing } from '@sss/sdk/oracle';

const oracle = new OraclePricing(connection, mintPubkey);
const price = await oracle.getCurrentPrice();
// { price: 1.085, stale: false, deviationBps: 12 }

const tokens = await oracle.calculateMintAmount(1000, 6); // 1000 EUR
const withinPeg = await oracle.isWithinPeg();
```

## PDA Seeds

| Account | Seeds |
|---------|-------|
| `OracleFeedConfig` | `["oracle-config", mint]` |

## Program ID

```
OrcL8pRf5G8ZxqkNBhREedUiXK3X4LC5GFDnGkuSvCn
```
