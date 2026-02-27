# SSS-3: Private Stablecoin Preset

## Overview

SSS-3 extends SSS-2 with **confidential transfers** and **allowlist enforcement**, enabling privacy-preserving regulated stablecoins on Solana.

## Features

SSS-3 includes everything from SSS-2 plus:

| Feature | Description |
|---|---|
| Confidential Transfers | Token-2022 `ConfidentialTransferMint` extension |
| Allowlist | Only allowlisted addresses can receive transfers |
| Auditor Key | ElGamal auditor key for regulatory compliance |
| Default Frozen | All new accounts are frozen by default |

## Architecture

```
SSS-3 = SSS-2 + ConfidentialTransfers + Allowlist

┌─────────────────────────────────────────┐
│            SSS-3 (Private)              │
├─────────────────────────────────────────┤
│  ✅ Token-2022 Mint                     │
│  ✅ 6 RBAC Roles                        │
│  ✅ Mint/Burn with Quotas               │
│  ✅ Freeze/Thaw                         │
│  ✅ Pause/Unpause                       │
│  ✅ Transfer Hook (Blacklist)           │
│  ✅ Permanent Delegate (Seize)          │
│  ✅ Transfer Fees                       │
│  ✅ Batch Operations                    │
│  ✅ Multisig Governance                 │
│  🆕 Confidential Transfers             │
│  🆕 Allowlist Enforcement              │
│  🆕 Auditor Key (ElGamal)              │
│  🆕 Default Account Frozen             │
└─────────────────────────────────────────┘
```

## Preset Configuration

```typescript
const SSS_3_PRESET = {
  enablePermanentDelegate: true,
  enableTransferHook: true,
  defaultAccountFrozen: true,
  enableConfidentialTransfers: true,
  enableAllowlist: true,
  transferFeeBasisPoints: 50, // 0.5%
  maxTransferFee: 1_000_000,  // 1 token max
};
```

## SDK Usage

### Initialize SSS-3 Stablecoin

```typescript
import { SolanaStablecoin, SSS_3_PRESET } from "@stbr/sss-token";

const stablecoin = await SolanaStablecoin.create(provider, {
  preset: SSS_3_PRESET,
  name: "Private USD",
  symbol: "pUSD",
  decimals: 6,
  auditorKey: auditorElGamalPublicKey,
});
```

### Allowlist Operations

```typescript
// Add to allowlist
await stablecoin.compliance.addToAllowlist(recipientAddress);

// Remove from allowlist
await stablecoin.compliance.removeFromAllowlist(recipientAddress);

// Check if allowed
const isAllowed = await stablecoin.compliance.isAllowlisted(address);
```

### Confidential Transfers

```typescript
// Configure account for confidential transfers
await stablecoin.confidential.configureAccount(tokenAccount);

// Deposit tokens to confidential balance
await stablecoin.confidential.deposit(tokenAccount, amount);

// Confidential transfer
await stablecoin.confidential.transfer(
  sourceAccount,
  destinationAccount,
  amount,
  auditorKey
);

// Withdraw from confidential balance
await stablecoin.confidential.withdraw(tokenAccount, amount);
```

## CLI Commands

```bash
# Initialize with SSS-3 preset
yarn cli init --preset sss-3 -n "Private USD" -s "pUSD" -d 6

# Manage allowlist
yarn cli allowlist add <ADDRESS> -m <MINT>
yarn cli allowlist remove <ADDRESS> -m <MINT>
yarn cli allowlist check <ADDRESS> -m <MINT>
```

## PDA Seeds

| PDA | Seeds | Description |
|---|---|---|
| Allowlist Entry | `["allowlist", mint, address]` | Per-address allowlist status |
| Auditor Config | `["auditor", mint]` | ElGamal auditor public key |

## Security

- **Auditor key** enables regulatory compliance: auditor can decrypt transfer amounts without accessing funds
- **Allowlist** restricts token transfers to verified/KYC'd addresses only  
- **Default frozen** ensures new accounts must be explicitly thawed (KYC'd) before receiving tokens
- All SSS-2 security features (blacklist, seize, pause) remain active

## Comparison with SSS-1 and SSS-2

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---|---|---|---|
| Token-2022 | ✅ | ✅ | ✅ |
| RBAC | ✅ | ✅ | ✅ |
| Transfer Hook | ❌ | ✅ | ✅ |
| Blacklist | ❌ | ✅ | ✅ |
| Seize | ❌ | ✅ | ✅ |
| Transfer Fees | ❌ | ✅ | ✅ |
| Confidential | ❌ | ❌ | ✅ |
| Allowlist | ❌ | ❌ | ✅ |
| Default Frozen | ❌ | ❌ | ✅ |
