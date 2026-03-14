# Oracle Integration Module

> Switchboard-powered price feeds for non-USD stablecoin pegs (EUR, BRL, CPI-indexed)

**Program ID (devnet):** `BHWh9mmJMniLpNjoPYrMZfUUes3rLcBY7fJzairkM1zc`  
**IDL account:** `CDwaZ1VfnmdVqMYvSMoiVnaLeWBRzcZ9GJ2U7fMFWMBC`

---

## Overview

The Oracle Integration Module provides **real-time price feeds** from [Switchboard](https://switchboard.xyz) V2 aggregators, enabling SSS-1/SSS-2 stablecoins to support non-USD denominations and dynamic pricing for mint/redeem operations.

**Key insight**: The stablecoin itself remains a pure SSS-1/SSS-2 token. The oracle is a **separate on-chain program** that enforces exchange rates during mint/redeem by reading Switchboard feed data.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Oracle Integration Module                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  OracleConfig PDA                                            │
│  ├── authority: Pubkey                                       │
│  ├── stablecoin_state: Pubkey  (SSS-1/SSS-2 state PDA)      │
│  ├── mint: Pubkey                                            │
│  ├── feed_address: Pubkey  (Switchboard V2 aggregator)       │
│  ├── base_currency: String (e.g. "EUR", "BRL")              │
│  ├── max_staleness: i64    (max feed age in seconds)         │
│  ├── max_confidence: u64   (max confidence interval)         │
│  └── enabled: bool                                           │
│                                                              │
│  Instructions                                                │
  │  ├── create_oracle_config()         — link feed to stablecoin  │
  │  ├── update_feed()                 — change feed address      │
  │  ├── toggle_oracle()               — enable / disable oracle  │
  │  ├── oracle_gated_mint()           — mint at oracle price     │
  │  ├── oracle_gated_burn()           — burn at oracle price     │
  │  ├── read_price()                  — view-only price read     │
  │  ├── propose_oracle_authority()    — initiate authority xfer  │
  │  └── accept_oracle_authority()     — accept authority xfer    │
│                                                              │
│  Switchboard V2 Feed                                         │
│  ├── EUR/USD aggregator                                      │
│  ├── BRL/USD aggregator                                      │
│  ├── CPI index feed                                          │
│  └── Custom feeds                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Flow: Oracle-Gated Mint

```
User                 Oracle Module           Switchboard        SSS-1 Program
 │                        │                      │                    │
 │── oracle_gated_mint()─►│                      │                    │
 │   (100 EUR worth)      │── read aggregator ──►│                    │
 │                        │◄── EUR/USD = 1.08 ──│                    │
 │                        │                      │                    │
 │                        │── validate staleness  │                    │
 │                        │── calculate: 100 EUR  │                    │
 │                        │   × 1.08 = 108 USD   │                    │
 │                        │   = 108_000000 tokens │                    │
 │                        │                      │                    │
 │                        │── CPI: sss_token::mint_tokens() ────────►│
 │                        │◄──────────── tokens minted ──────────────│
 │◄── 108 tokens ────────│                      │                    │
```

---

## Supported Feeds

| Feed | Switchboard Devnet Aggregator | Use Case |
|------|-------------------------------|----------|
| EUR/USD | `GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR` | Euro-pegged stablecoin |
| BRL/USD | `8cCgBPsVQpGjCuxGKzq2GhEbGp7zcgEW3QUjRc9Tcn4v` | Brazilian Real stablecoin |
| GBP/USD | `8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee` | British Pound stablecoin |
| JPY/USD | `HesSdrxmSYGEqw5qSfq888B8RCVWJeXhQMW8N7RqFa2W` | Japanese Yen stablecoin |
| CPI | Custom | Inflation-indexed stablecoin |

---

## Integration Status

There is currently **no published TypeScript wrapper** for the oracle module under `solana-stablecoin-sdk/oracle`.

Use one of these integration paths instead:

1. Interact with the on-chain oracle program directly via Anchor `Program`
2. Generate a lightweight client from the oracle IDL in your app/service
3. Integrate from Rust using CPI where appropriate

This keeps the oracle module available on-chain without claiming a JS API that is not yet shipped.

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ORACLE_FEED_ADDRESS` | Switchboard V2 aggregator public key | — |
| `ORACLE_MAX_STALENESS` | Max feed age in seconds | 60 |
| `ORACLE_MAX_CONFIDENCE` | Max confidence interval in BPS | 100 |
| `ORACLE_BASE_CURRENCY` | Base currency code | USD |

---

## Price Calculation

```
tokens_to_mint = base_amount × exchange_rate

Where:
  base_amount     = amount in source currency (e.g., 100 EUR)
  exchange_rate   = oracle feed value (e.g., EUR/USD = 1.08)
  tokens_to_mint  = base_amount × exchange_rate × 10^decimals
```

For CPI-indexed stablecoins:
```
adjusted_amount = base_amount × (current_cpi / reference_cpi)
```

---

## Safety

1. **Staleness Check**: Rejects feeds older than `max_staleness` seconds
2. **Confidence Interval**: Rejects feeds with confidence > `max_confidence` BPS
3. **Feed Authority**: Only the oracle authority can update the feed address
4. **CPI Guard**: Uses SSS-1 minter quota system — oracle module must be registered as a minter

---

## References

- [Switchboard V2 Docs](https://docs.switchboard.xyz/)
- [Switchboard Solana SDK](https://github.com/switchboard-xyz/solana-sdk)
- [SSS-1 Standard](../docs/SSS-1.md)
