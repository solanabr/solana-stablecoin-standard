# Compliant Stablecoin Standard (SSS-2)

The SSS-2 standard wraps SSS-1 semantics into a highly restrictive, institutionally-compliant token model that satisfies regulatory scrutiny (e.g. OFAC/GENIUS Act).

## Capabilities additions
* **Permanent Delegation:** Enables sweeping of funds out of untrusted or sanctioned accounts to a compliance treasury address.
* **Transfer Hooks:** Pre-execution enforcement. Checks if `Source` or `Destination` accounts are registered in the `BlacklistRegistry`. If true, atomic execution halts.

## Required Config Options
```rust
pub enable_permanent_delegate: true,
pub enable_transfer_hook: true,
pub default_account_frozen: false,
```

## Who is this for?
- USDC/USDT style stablecoins
- Highly regulated CBDCs or RWA proxies
- Issuers requiring audit-proven seizure capabilities
