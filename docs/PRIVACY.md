# SSS-3 Privacy Module (Confidential Transfers)

Layer 3 of the Solana Stablecoin Standard implementing privacy-preserving token transfers.

## Overview

SSS-3 adds **confidential transfers** to the stablecoin standard using Solana Token-2022's Confidential Transfer extension. This enables:

- **Encrypted balances** - Account balances remain private
- **Confidential transfers** - Transfer amounts are hidden
- **Zero-knowledge proofs** - Validity without disclosure (Bulletproofs)
- **Regulatory compliance** - Optional auditor access
- **Allowlist access control** - Permissioned confidential transfers

## Architecture

```
SSS-3 Architecture:
┌──────────────────────────────────────────────────────────┐
│                     Client (SDK/CLI)                     │
├──────────────────────────────────────────────────────────┤
│         ElGamal Encryption │ Bulletproof Generation       │
├──────────────────────────────────────────────────────────┤
│              Solana RPC (Encrypted tx)                   │
├──────────────────────────────────────────────────────────┤
│     On-Chain: ConfidentialTransfer Extension             │
│     • Encrypted balances │ ZK Range Proof Verification    │
│     • Auditor access │ Allowlist enforcement             │
└──────────────────────────────────────────────────────────┘
```

## ElGamal Encryption

SSS-3 uses **ElGamal public-key encryption** for balances:

- **Public Key** - Shared, used to encrypt incoming transfers
- **Private Key** - Kept secret, used to decrypt and spend
- **Homomorphic** - Supports operations on encrypted values

### Key Generation

```bash
# Generate ElGamal keypair
sss-token privacy generate-keys --output my-keys.json

# Public key: Share with others to receive transfers
# Private key: KEEP SECURE - required to decrypt balances
```

**⚠️ Security Warning**: Lost private keys = Lost access to funds. No recovery possible!

## Confidential Accounts

### Creating Account

```typescript
const privacy = new PrivacyModule(connection);

// Create confidential token account
const { account, elgamalRegistry } = await privacy.createConfidentialAccount({
  mint: stablecoinMint,
  owner: userKeypair,
});
```

### Account Structure

```rust
pub struct ConfidentialAccount {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub pending_balance: EncryptedBalance,
    pub available_balance: EncryptedBalance,
    pub allow_timestamps: u64,
    pub bump: u8,
}
```

## Confidential Transfer Flow

### 1. Deposit (Public → Private)

```typescript
// Deposit to confidential account
await privacy.depositToConfidential({
  tokenAccount: publicTokenAccount,
  confidentialAccount: confidentialAccount,
  mint: stablecoinMint,
  amount: new BN(1000000), // 1 token
  authority: userKeypair,
});
```

### 2. Transfer (Confidential)

```typescript
// Create zero-knowledge range proof
const proof = privacy.generateRangeProof(
  amount,           // Amount to prove
  new BN(0),        // Min
  new BN(1000000)   // Max
);

// Perform confidential transfer
await privacy.confidentialTransfer({
  source: sourceConfidentialAccount,
  destination: destConfidentialAccount,
  mint: stablecoinMint,
  amount: new BN(500000),
  authority: senderKeypair,
  proofData: proof, // ZK proof that 0 <= amount <= balance
});
```

### 3. Withdraw (Private → Public)

```typescript
// Requires decryption key to prove sufficient balance
await privacy.withdrawFromConfidential({
  confidentialAccount: confidentialAccount,
  tokenAccount: publicTokenAccount,
  mint: stablecoinMint,
  amount: new BN(100000),
  authority: userKeypair,
  decryptionKey: elgamalPrivateKey, // Required!
});
```

## Zero-Knowledge Range Proofs

SSS-3 uses **Bulletproofs** for range proofs:

- **Proof Size**: ~672 bytes (constant)
- **Verification**: On-chain via Solana runtime
- **Range**: 0 to 2^32 or 0 to 2^64 (configurable)

### Proof Generation (Off-chain)

```typescript
import { bulletproofs } from '@stbr/sss-token';

// Generate proof that amount is in [0, 1000000]
const proof = await bulletproofs.prove(
  amount,
  0n,
  1000000n,
  blindingFactor
);
```

### Verification (On-chain)

```rust
// Solana runtime verifies proof
confidential_transfer(
  amount,
  proof_data,
  source_account,
  dest_account,
) ?
```

## Allowlist

Optional access control for confidential transfers:

### Enable Allowlist

```typescript
await privacy.enableConfidentialTransfers({
  stablecoin: mint,
  authority: adminKeypair,
  requireAllowlist: true, // Enforce allowlist
});
```

### Manage Allowlist

```bash
# Add to allowlist
sss-token privacy allowlist:add \
  --stablecoin <MINT> \
  --address <USER_ADDR> \
  --reason "KYC verified"

# Check status
sss-token privacy allowlist:check \
  --stablecoin <MINT> \
  --address <USER_ADDR>
```

## Auditor

Optional regulatory auditor with decryption capability:

### Set Auditor

```typescript
await privacy.setAuditor({
  stablecoin: mint,
  auditor: auditorPublicKey,
  auditorPubkey: auditorElGamalPublicKey,
  authority: adminKeypair,
});
```

### Auditor Capabilities

✅ Can decrypt transaction amounts (sender/receiver hidden)  
❌ Cannot view account balances  
❌ Cannot transfer funds  

**Use Case**: Regulatory compliance while preserving user privacy

## Presets

### Default (Balanced)

```typescript
import { SSS3_PRESET } from '@stbr/sss-token';

// Standard confidential transfer
SSS3_PRESET.enableConfidentialTransfers = true;
SSS3_PRESET.requireAllowlist = false;
SSS3_PRESET.maxConfidentialBalance = 0; // Unlimited
```

### High Privacy

```typescript
import { SSS3_HIGH_PRIVACY_PRESET } from '@stbr/sss-token';

// Maximum privacy with allowlist
SSS3_HIGH_PRIVACY_PRESET.requireAllowlist = true;
SSS3_HIGH_PRIVACY_PRESET.maxConfidentialBalance = new BN(1000000000000);
SSS3_HIGH_PRIVACY_PRESET.auditor.enabled = true;
```

### Regulatory Compliant

```typescript
import { SSS3_COMPLIANT_PRESET } from '@stbr/sss-token';

// Privacy with oversight
SSS3_COMPLIANT_PRESET.requireAllowlist = true;
SSS3_COMPLIANT_PRESET.auditor.enabled = true;
SSS3_COMPLIANT_PRESET.rangeProof.minAmount = new BN(1000000); // Min 1 token
```

## CLI Commands

```bash
# Initialize SSS-3
sss-token privacy init --stablecoin <MINT>

# Create confidential account
sss-token privacy create-account --mint <MINT>

# Confidential transfer
sss-token privacy transfer \
  --source <SRC> \
  --destination <DST> \
  --mint <MINT> \
  --amount 1000000

# Allowlist management
sss-token privacy allowlist:add --stablecoin <MINT> --address <ADDR>
```

## Security Considerations

### Key Management

- **Private keys**: Store in secure vault (e.g., AWS KMS, HashiCorp Vault)
- **Key rotation**: Regularly rotate ElGamal keys
- **Backup**: Multiple secure backups required

### Privacy Limitations

- **Sender/Receiver**: Still visible on-chain (just amounts hidden)
- **Transaction patterns**: Can be analyzed via timing
- **Identity**: Wallet addresses remain public

### Full Privacy

For complete privacy, combine with:
- Multiple confidential accounts
- Mixing services
- Time delays between transactions

## Deployment

### Requirements

- Solana validator: v1.16+ (Token-2022 support)
- Anchor: v0.30.1
- Space: ElGamal extension requires 165 bytes per account

### Costs

- **Account creation**: ~0.002 SOL
- **Transaction**: +0.00001 SOL (proof verification)
- **Proof size**: +672 bytes per transfer

## Integration Example

```typescript
// Full SSS-3 stablecoin setup
import { SolanaStablecoin, PrivacyModule, SSS3_PRESET } from '@stbr/sss-token';

const connection = new Connection('https://api.devnet.solana.com');

// 1. Initialize base stablecoin
const token = new SolanaStablecoin(connection);
const result = await token.initialize({
  name: 'Private USD',
  symbol: 'PUSD',
  decimals: 6,
  authority: adminKeypair,
  enableConfidentialTransfers: true,
  enablePermanentDelegate: true,
});

// 2. Setup privacy
const privacy = new PrivacyModule(connection);
await privacy.initialize(program);

// 3. Enable SSS-3
await privacy.enableConfidentialTransfers({
  stablecoin: result.data!.mint,
  authority: adminKeypair,
  requireAllowlist: true,
});

// 4. Create confidential account
const { account } = await privacy.createConfidentialAccount({
  mint: result.data!.mint,
  owner: userKeypair,
});

// 5. Deposit
await privacy.depositToConfidential({
  tokenAccount: publicAccount,
  confidentialAccount: account,
  mint: result.data!.mint,
  amount: new BN(10000000), // 10 PUSD
  authority: userKeypair,
});

// 6. Confidential transfer
await privacy.confidentialTransfer({
  source: account,
  destination: recipientConfidentialAccount,
  mint: result.data!.mint,
  amount: new BN(5000000), // 5 PUSD
  authority: userKeypair,
});
```

## Troubleshooting

### "Range proof verification failed"

- Amount exceeds balance: Decrypt and check available
- Proof expired: Regenerate proof
- Wrong bit size: Use 32 or 64 as configured

### "Insufficient funds for fee"

- Confidential transfers need SOL for:
  - Transaction fee
  - ZK proof verification
  - Rent exemption

### "Account not found"

- Must call `createConfidentialAccount` first
- Check correct mint address
- Verify network (devnet vs mainnet)

## References

- [Token-2022 Confidential Transfers](https://spl.solana.com/token-2022/extensions#confidential-transfers)
- [Bulletproofs Paper](https://eprint.iacr.org/2017/1066.pdf)
- [ElGamal Encryption](https://en.wikipedia.org/wiki/ElGamal_encryption)

## License

MIT - See [LICENSE](../LICENSE)
