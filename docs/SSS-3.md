# SSS-3: Private Stablecoin (Confidential Transfers)

## Overview

SSS-3 is the privacy-preserving stablecoin preset. It extends SSS-1/SSS-2 with
**confidential transfers** — encrypted token balances and ZK-proof-based transfers
on Solana using Token-2022's `ConfidentialTransferMint` extension.

**Why it matters**: Institutions need privacy for treasury ops, payroll, OTC settlements.
SSS-3 proves Solana can handle privacy-preserving stablecoins at protocol level.

## Architecture

```
┌─────────────────────────────────┐
│   SSS-3 Mint Extensions         │
├─────────────────────────────────┤
│  ConfidentialTransferMint       │  ← Encrypted balances + ZK proofs
│  PermanentDelegate              │  ← Compliance seizure
│  TransferHook                   │  ← Blacklist enforcement
│  MetadataPointer                │  ← On-chain metadata
└─────────────────────────────────┘
```

## Confidential Transfer Flow

```
1. Initialize SSS-3 mint (CT + auto-approve enabled)
2. Create token accounts
3. Configure accounts for CT (ElGamal keypair generation)
4. Deposit tokens: public → confidential pending balance
5. Apply pending balance → available confidential balance
6. Confidential transfer (ZK range proofs generated client-side)
7. Recipient applies pending → available
8. Withdraw: confidential → public balance
```

## On-Chain Extension

Our Anchor program initializes the `ConfidentialTransferMint` extension during
mint creation when `enable_confidential_transfers: true` is set:

```rust
// In initialize.rs
if params.enable_confidential_transfers {
    extensions.push(ExtensionType::ConfidentialTransferMint);
    // CPI: initialize_confidential_transfer_mint
    // auto_approve = true, no auditor
}
```

## E2E Test Script

Run the full confidential transfer lifecycle on localnet:

```bash
bash scripts/test-ct-e2e.sh
```

This runs 14 checks:
1. Mint created with CT extension
2. CT extension verified on mint
3. Token accounts created
4. Tokens minted (public)
5. Sender configured for CT
6. Recipient configured for CT
7. 500 tokens deposited to confidential
8. Pending balance applied
9. 200 token confidential transfer (ZK proofs)
10. Recipient pending balance applied
11. 100 tokens withdrawn to public
12-14. Final balance verification

## Current Status

> **⚠️ Important**: The ZK ElGamal Program is currently disabled on Solana
> devnet and mainnet while it undergoes a security audit. Confidential transfers
> work ONLY on localnet with Token-2022 that has `zk-ops` support.

### Test Coverage (6 tests)

| Test | Description |
|------|-------------|
| initializes SSS-3 | Creates mint with CT + all SSS-2 extensions |
| CT extension present | Verifies `ConfidentialTransferMint` on mint TLV data |
| preset flags | Validates all SSS-3 config flags |
| extension coexistence | CT + PermanentDelegate + TransferHook + MetadataPointer |
| mint on CT token | Mints 500 tokens on CT-enabled stablecoin |
| supply tracking | `total_minted` correctly tracked on CT config |

## SDK Usage

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: "SSS_3",
  name: "Private USD",
  symbol: "pUSD",
  decimals: 6,
});
```

## Limitations

- CT operations (deposit, transfer, withdraw) require `spl-token` CLI v4+ or
  custom TypeScript with ZK proof generation
- No pure JavaScript implementation for ElGamal decryption yet
- Transfer hook may not resolve in all wallets during CT transfers
- ZK ElGamal Program disabled on devnet/mainnet (security audit in progress)
