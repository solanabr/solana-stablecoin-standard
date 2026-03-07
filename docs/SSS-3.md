# SSS-3: Private Stablecoin Standard

## Overview

SSS-3 extends SSS-1 with confidential transfer capabilities using Token-2022's built-in confidential transfer extension. This enables privacy-preserving stablecoin transactions where amounts and balances are encrypted.

**Status**: ⚠️ Experimental - Confidential transfers are still maturing on Solana

## Use Cases

- **Corporate Treasury**: Hide balance amounts from competitors
- **High-Net-Worth Individuals**: Privacy for large transactions
- **Privacy-Focused Payments**: Confidential payment rails
- **Experimental DeFi**: Privacy-preserving protocols

## Features

### Core Features (from SSS-1)
- ✅ Mint tokens
- ✅ Burn tokens
- ✅ Freeze accounts
- ✅ Token metadata
- ✅ Role-based access control

### Privacy Features (SSS-3 Specific)
- ✅ **Confidential Transfers**: Encrypted transaction amounts
- ✅ **Confidential Balances**: Encrypted account balances
- ✅ **Scoped Allowlists**: Whitelist-based transfer permissions
- ✅ **Proof Generation**: Zero-knowledge proofs for transfers
- ⚠️ **Auditor Keys**: Optional balance decryption for compliance

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SSS-3 ARCHITECTURE                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Token-2022 Mint (with Confidential Transfer Extension) │
│  • Encrypted balances                                   │
│  • Zero-knowledge proofs                                │
│  • Auditor keys (optional)                              │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Confidential Transfer Flow                 │
│  1. Sender creates encrypted transfer proof             │
│  2. Proof verified on-chain                             │
│  3. Encrypted amount transferred                        │
│  4. Balances remain encrypted                           │
└─────────────────────────────────────────────────────────┘
```

## Token Configuration

### Extensions Enabled

```typescript
{
  // SSS-1 base features
  metadata: true,
  freezeAuthority: true,
  
  // SSS-3 privacy features
  confidentialTransfers: true,
  confidentialTransferFeeConfig: false, // Optional
  
  // Not included in SSS-3
  permanentDelegate: false,
  transferHook: false,
  defaultAccountFrozen: false
}
```

## SDK Usage

### Initialize SSS-3 Stablecoin

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const authority = Keypair.fromSecretKey(/* your key */);

// Create with SSS-3 preset
const privateStable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_3,
  name: "Private Stablecoin",
  symbol: "PUSD",
  decimals: 6,
  authority,
  // Optional: Add auditor for compliance
  auditorKey: auditorKeypair.publicKey,
});
```

### Configure Confidential Transfers

```typescript
// Enable confidential transfers for an account
await privateStable.privacy.configureAccount({
  owner: userKeypair,
  maximumPendingBalanceCreditCounter: 65536,
  decryptableZeroBalance: true,
});

// Approve account for confidential transfers
await privateStable.privacy.approveAccount({
  account: userTokenAccount,
  authority,
});
```

### Perform Confidential Transfer

```typescript
// Deposit tokens into confidential balance
await privateStable.privacy.deposit({
  source: userTokenAccount,
  amount: 1_000_000, // 1 PUSD
  owner: userKeypair,
});

// Transfer with encrypted amount
await privateStable.privacy.transfer({
  source: senderTokenAccount,
  destination: recipientTokenAccount,
  amount: 500_000, // 0.5 PUSD (encrypted)
  owner: senderKeypair,
});

// Withdraw from confidential balance
await privateStable.privacy.withdraw({
  destination: userTokenAccount,
  amount: 500_000,
  owner: userKeypair,
});
```

### Query Confidential Balances

```typescript
// Get encrypted balance (only owner can decrypt)
const encryptedBalance = await privateStable.privacy.getEncryptedBalance(
  userTokenAccount
);

// Decrypt balance (requires private key)
const decryptedBalance = await privateStable.privacy.decryptBalance(
  encryptedBalance,
  userKeypair
);

console.log(`Decrypted balance: ${decryptedBalance}`);
```

## CLI Usage

### Initialize SSS-3

```bash
# Create private stablecoin
sss-token init --preset sss-3 \
  --name "Private USD" \
  --symbol "PUSD" \
  --decimals 6 \
  --cluster devnet

# With auditor key
sss-token init --preset sss-3 \
  --name "Private USD" \
  --symbol "PUSD" \
  --auditor <auditor-pubkey>
```

### Privacy Operations

```bash
# Configure account for confidential transfers
sss-token privacy configure <account>

# Deposit into confidential balance
sss-token privacy deposit <amount>

# Confidential transfer
sss-token privacy transfer <recipient> <amount>

# Withdraw from confidential balance
sss-token privacy withdraw <amount>

# Check encrypted balance
sss-token privacy balance
```

## Security Considerations

### Privacy Guarantees

✅ **What is Private:**
- Transaction amounts (encrypted)
- Account balances (encrypted)
- Transfer patterns (partially hidden)

⚠️ **What is NOT Private:**
- Sender address (public)
- Recipient address (public)
- Transaction timing (public)
- Number of transactions (public)

### Compliance Features

```typescript
// Optional: Add auditor key for regulatory compliance
const auditorKey = Keypair.generate();

await privateStable.privacy.setAuditor({
  auditor: auditorKey.publicKey,
  authority,
});

// Auditor can decrypt balances
const auditedBalance = await privateStable.privacy.auditBalance(
  userTokenAccount,
  auditorKey
);
```

## Limitations

### Current Limitations (Token-2022)

1. **Performance**: Proof generation is computationally expensive
2. **UX Complexity**: Users need to manage encryption keys
3. **Tooling**: Limited wallet support for confidential transfers
4. **Composability**: Reduced DeFi integration compared to standard tokens

### Recommended Use Cases

✅ **Good for:**
- Corporate treasury management
- High-value private transactions
- Privacy-focused applications
- Experimental protocols

❌ **Not recommended for:**
- High-frequency trading
- Public DeFi protocols (yet)
- Consumer payments (UX not ready)
- Regulatory-heavy environments (unless auditor keys used)

## Comparison with SSS-1 and SSS-2

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---------|-------|-------|-------|
| **Mint/Burn** | ✅ | ✅ | ✅ |
| **Freeze** | ✅ | ✅ | ✅ |
| **Metadata** | ✅ | ✅ | ✅ |
| **Blacklist** | ❌ | ✅ | ❌ |
| **Transfer Hook** | ❌ | ✅ | ❌ |
| **Confidential Transfers** | ❌ | ❌ | ✅ |
| **Encrypted Balances** | ❌ | ❌ | ✅ |
| **Auditor Keys** | ❌ | ❌ | ✅ |
| **Compliance** | Basic | Full | Privacy-first |
| **Maturity** | Stable | Stable | Experimental |

## Migration Path

### From SSS-1 to SSS-3

Not directly possible - confidential transfer extension must be enabled at mint creation.

### From SSS-3 to SSS-2

Not recommended - privacy features cannot be removed once enabled.

## Testing

```bash
# Run SSS-3 specific tests
npm run test:sss3

# Test confidential transfers
npm run test:privacy

# Fuzz test proof generation
npm run test:fuzz:privacy
```

## Future Enhancements

### Planned Features

- [ ] **Shielded Pools**: Zcash-style privacy pools
- [ ] **Stealth Addresses**: One-time recipient addresses
- [ ] **Ring Signatures**: Hide sender in anonymity set
- [ ] **Improved UX**: Better wallet integration

### Research Areas

- [ ] **DeFi Integration**: Privacy-preserving AMMs
- [ ] **Cross-chain Privacy**: Bridge with other privacy chains
- [ ] **Regulatory Compliance**: Balance privacy with AML/KYC

## Resources

- [Token-2022 Confidential Transfers](https://spl.solana.com/token-2022/extensions#confidential-transfers)
- [Solana Confidential Transfer Spec](https://docs.solana.com/proposals/confidential-token-extension)
- [Zero-Knowledge Proofs on Solana](https://docs.solana.com/developing/on-chain-programs/examples#zero-knowledge-proofs)

## Disclaimer

⚠️ **Experimental Feature**: SSS-3 uses experimental Token-2022 features that are still maturing. Use in production at your own risk. Thoroughly test and audit before deploying with real value.

## Support

For SSS-3 specific questions:
- GitHub Issues: [github.com/solanabr/solana-stablecoin-standard/issues](https://github.com/solanabr/solana-stablecoin-standard/issues)
- Discord: #sss-3-privacy channel
- Email: privacy@superteam.fun

---

**Next Steps:**
1. Review [SSS-1 Specification](./SSS-1.md) for base features
2. Check [Privacy Module Documentation](./PRIVACY.md) for implementation details
3. See [Example Code](../examples/sss3-private-stable.ts) for complete examples
