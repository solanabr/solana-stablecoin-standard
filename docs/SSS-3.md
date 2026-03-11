# SSS-3: Private Stablecoin

SSS-3 extends SSS-2 (Compliant) with **confidential transfers** using Solana Token-2022's `ConfidentialTransferMint` extension. This enables privacy-preserving token transfers where balances and amounts are encrypted using ElGamal encryption and verified with zero-knowledge proofs.

## Overview

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---------|-------|-------|-------|
| Mint/Burn | Yes | Yes | Yes |
| Freeze/Thaw | Yes | Yes | Yes |
| Pause/Unpause | Yes | Yes | Yes |
| Blacklist | - | Yes | Yes |
| Seizure | - | Yes | Yes |
| Transfer Hook | - | Yes | Yes |
| **Confidential Transfers** | - | - | **Yes** |
| **Encrypted Balances** | - | - | **Yes** |
| **Auditor Key** | - | - | **Yes** |

## Token-2022 Extensions

SSS-3 mints are created with all SSS-2 extensions plus:

```
MintCloseAuthority     (SSS-1)
MetadataPointer        (SSS-1)
PermanentDelegate      (SSS-2)
TransferHook           (SSS-2)
ConfidentialTransferMint (SSS-3)  <-- NEW
```

## Architecture

### Confidential Transfer Flow

```
┌────────────────────┐     ┌──────────────────────────┐
│   Sender Client    │     │   Token-2022 Program     │
│                    │     │                          │
│  1. Generate ZK    │────>│  3. Verify proof         │
│     range proof    │     │  4. Update encrypted     │
│  2. Encrypt amount │     │     balances (ElGamal)   │
│     with receiver  │     │  5. Call transfer hook   │
│     ElGamal key    │     │     (blacklist check)    │
└────────────────────┘     └──────────────────────────┘
                                       │
                           ┌───────────▼──────────────┐
                           │  SSS Transfer Hook       │
                           │  • Check sender blacklist│
                           │  • Check receiver bl.    │
                           └──────────────────────────┘
```

### Key Components

1. **ElGamal Keypair**: Each account holder generates an ElGamal keypair for encrypting/decrypting balances
2. **Auditor Key**: An optional auditor ElGamal public key that can decrypt all transfer amounts (for regulatory compliance)
3. **Range Proofs**: Zero-knowledge proofs that verify transfer amounts are valid without revealing the actual values
4. **Pending Balance**: Incoming transfers go to a pending balance that must be applied by the recipient

## Roles

SSS-3 inherits all SSS-2 roles and adds:

| Role | Description |
|------|-------------|
| master_authority | Full control, can do everything |
| minter | Mint tokens (with optional quota) |
| burner | Burn tokens |
| pauser | Pause/unpause all transfers |
| blacklister | Add/remove addresses from blacklist |
| seizer | Seize tokens via permanent delegate |
| **auditor** | Can decrypt all transfer amounts (SSS-3) |

## Usage

### Initialize SSS-3

```typescript
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';

const token = await SolanaStablecoin.create(provider, {
  name: 'Private Euro',
  symbol: 'pEUR',
  uri: 'https://example.com/peur.json',
  preset: StablecoinPreset.SSS3,
  decimals: 6,
});
```

### CLI

```bash
# Initialize SSS-3 stablecoin
sss-token init --preset sss-3 --name "Private Euro" --symbol "pEUR" --uri "https://..."

# All SSS-1 and SSS-2 commands work on SSS-3 tokens
sss-token mint --mint <addr> --to <ata> --amount 1000000
sss-token blacklist add --mint <addr> --address <target>
```

## Privacy Guarantees

- **Transfer amounts**: Encrypted, only visible to sender, receiver, and auditor
- **Account balances**: Encrypted on-chain, only the owner (and auditor) can decrypt
- **Compliance**: Auditor key allows regulatory oversight without public disclosure
- **Blacklist enforcement**: Transfer hook still checks blacklist PDAs regardless of confidentiality

## Limitations

1. **Client-side computation**: Zero-knowledge proofs must be generated client-side
2. **Transaction size**: Confidential transfers require more transaction data for proofs
3. **Compatibility**: Not all wallets support confidential transfers yet
4. **Performance**: Proof generation adds latency to transfers

## Security Considerations

- The auditor key, if set, can decrypt ALL transfer amounts — choose the auditor carefully
- Seizure via permanent delegate still works on confidential balances
- Blacklisted addresses are still blocked even when using confidential transfers
- The transfer hook cannot see the transfer amount in confidential mode, only whether the sender/receiver is blacklisted

## Oracle Integration

SSS-3 tokens can also use oracle price feeds (same as SSS-1 and SSS-2):

```typescript
await token.oracle.configure({
  priceFeed: pythEurUsdFeed,
  pegCurrency: 'EUR',
  maxStalenessSecs: 60,
  priceExponent: -8,
});
```
