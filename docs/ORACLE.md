# Oracle Integration Module

> **Status**: Bonus Feature  
> **Program**: `oracle_module`

## Overview

The oracle module provides price feeds for non-USD-pegged stablecoins (EUR, BRL, CPI-indexed). The token itself is pure SSS-1/SSS-2 — the oracle is a separate program used for mint/redeem pricing.

## Architecture

```
Oracle Authority
    │
    ▼
Oracle Config PDA ── stores price, decimals, staleness
    │
    ▼
Mint/Redeem pricing ── oracle-adjusted amounts
```

## Instructions

| Instruction | Description | Access |
|------------|-------------|--------|
| `initialize_oracle` | Create oracle config | Authority |
| `update_feed` | Update price + timestamp | Authority |
| `get_price` | Read current price | Anyone |
| `mint_with_oracle` | Mint with oracle-adjusted pricing | Minter |

## Usage

```typescript
// Initialize oracle for BRL/USD
await oracleProgram.methods.initializeOracle({
  priceFeedName: "BRL/USD",
  decimals: 8,
}).rpc();

// Update price (5.20 BRL per USD, 8 decimals)
await oracleProgram.methods.updateFeed(
  new BN(520_000_000), // 5.20 * 10^8
).rpc();

// Mint with oracle-adjusted pricing
await oracleProgram.methods.mintWithOracle(
  new BN(1_000_000), // base amount
).rpc();
```

## Integration with SSS-1/SSS-2

The oracle module is **separate from the stablecoin program**. It doesn't modify the token — it provides pricing data that backends and frontends use to calculate mint/redeem amounts.

```
User wants 100 BRL stablecoins
  → Backend queries oracle: BRL/USD = 5.20
  → Backend calculates: 100 BRL = ~19.23 USD worth
  → Backend calls stable.mint({ amount: 100_000_000 }) // 100 tokens
```
