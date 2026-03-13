# Minimal Stablecoin Standard (SSS-1)

The SSS-1 specifies the exact capabilities required for a lightweight, internal or governance-focused stablecoin without excessive overhead.

## Capabilities
1. **Minting:** Master authority configuration and Minter quotas.
2. **Burning:** Unidirectional value destruction.
3. **Freezing:** Account-level transaction halts (reactionary compliance).
4. **Metadata:** Standard SPL attributes.

## Disabled Options
- Permanent Delegation is **disabled**.
- SSS-1 tokens cannot have their balances arbitrarily seized or re-routed by the administrators, increasing trust for decentralized treasury usage.
- Transfer Hooks are **disabled**. No runtime checking against the blacklist occurs per-transfer.

## Who is this for?
- DAO Treasuries
- Closed Ecosystem Settlements
- Internal Accounting Markers
