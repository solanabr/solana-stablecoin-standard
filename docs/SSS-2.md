# SSS-2: Compliant Stablecoin Standard

## Overview

SSS-2 is the compliant stablecoin standard for Solana, designed for regulated environments where proactive compliance enforcement is required. It extends SSS-1 with permanent delegate, transfer hooks, and on-chain blacklist enforcement.

## Use Cases

- **Regulated Stablecoins**: USDC/USDT-class tokens
- **Bank-Issued Digital Currencies**: CBDC, bank stablecoins
- **Payment Processors**: Compliant payment rails
- **Remittance Services**: Cross-border transfers
- **Institutional DeFi**: Regulated DeFi protocols

## Features

### SSS-1 Features (Inherited)

✅ Mint Authority  
✅ Freeze Authority  
✅ Metadata  
✅ Role Management  

### SSS-2 Additional Features

✅ **Permanent Delegate**: Token seizure capability  
✅ **Transfer Hook**: Automatic blacklist enforcement on every transfer  
✅ **On-chain Blacklist**: Immutable compliance records  
✅ **Token Seizure**: Recover tokens from frozen accounts  
✅ **Audit Trail**: Complete compliance history  

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SSS-2 Components                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         SSS-1 Base (Inherited)                   │  │
│  │  • Mint/Burn                                     │  │
│  │  • Freeze/Thaw                                   │  │
│  │  • Pause/Unpause                                 │  │
│  │  • Role Management                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │         SSS-2 Compliance Module                  │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  Permanent Delegate                        │ │  │
│  │  │  • Enables token seizure                   │ │  │
│  │  │  • Vault has delegate authority            │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  Transfer Hook Program                     │ │  │
│  │  │  • Checks every transfer                   │ │  │
│  │  │  • Validates against blacklist             │ │  │
│  │  │  • Fails if sender/recipient blacklisted   │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  Blacklist Management                      │ │  │
│  │  │  • Add/remove addresses                    │ │  │
│  │  │  • Reason tracking                         │ │  │
│  │  │  • Timestamp and authority                 │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  │                                                  │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │  Token Seizure                             │ │  │
│  │  │  • Seize from frozen accounts              │ │  │
│  │  │  • Transfer to treasury                    │ │  │
│  │  │  • Audit trail                             │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Configuration

### Initialization Parameters

```rust
pub struct SSS2Config {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    
    // SSS-2 required
    pub enable_permanent_delegate: true,
    pub enable_transfer_hook: true,
    pub default_account_frozen: false,
}
```

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority: adminKeypair,
  roles: {
    blacklisters: [complianceOfficer],
    seizers: [complianceOfficer],
  },
});
```

### CLI

```bash
sss-token init --preset sss-2 \
  --name "Compliant USD" \
  --symbol "CUSD" \
  --decimals 6
```

## Compliance Operations

### 1. Blacklist Management

#### Add to Blacklist

**Who can add**: Accounts with blacklister role  
**Effect**: Address cannot send or receive tokens  
**Enforcement**: Automatic via transfer hook

```typescript
await stable.compliance.blacklistAdd(
  suspiciousAddress,
  "OFAC sanctions match",
  blacklisterKeypair
);
```

**What happens:**
1. Blacklist entry created on-chain
2. Transfer hook enforces on every transfer
3. Audit log entry created
4. Event emitted

#### Remove from Blacklist

```typescript
await stable.compliance.blacklistRemove(
  addressToUnblock,
  blacklisterKeypair
);
```

#### Check Blacklist Status

```typescript
const isBlacklisted = await stable.compliance.isBlacklisted(address);
```

### 2. Token Seizure

**Who can seize**: Accounts with seizer role  
**Requirements**: Account must be frozen first  
**Use case**: Regulatory enforcement, court orders

```typescript
// Step 1: Freeze account
await stable.freezeAccount({
  tokenAccount: violatorAccount,
  authority: masterAuthority,
});

// Step 2: Seize tokens
await stable.compliance.seize({
  fromAccount: violatorAccount,
  toAccount: treasuryAccount,
  amount: new BN(1_000_000),
  seizer: seizerKeypair,
});
```

**What happens:**
1. Validates account is frozen
2. Uses permanent delegate to transfer
3. Creates audit log entry
4. Emits seizure event

### 3. Transfer Hook Enforcement

**Automatic on every transfer:**

```
User initiates transfer
       ↓
Transfer Hook Program invoked
       ↓
Check sender blacklist ──→ Blacklisted? → FAIL
       ↓ Not blacklisted
Check recipient blacklist ──→ Blacklisted? → FAIL
       ↓ Not blacklisted
Transfer proceeds → SUCCESS
```

**No gaps in enforcement** - Every transfer is checked.

## Roles (SSS-2 Specific)

### Blacklister

- Can add addresses to blacklist
- Can remove addresses from blacklist
- Cannot seize tokens (separate role)
- Multiple blacklisters supported

### Seizer

- Can seize tokens from frozen accounts
- Requires account to be frozen first
- Uses permanent delegate authority
- Multiple seizers supported

## Compliance Workflow

### Typical Compliance Flow

```
1. Suspicious Activity Detected
   ↓
2. Compliance Officer Reviews
   ↓
3. Decision: Freeze or Blacklist?
   ↓
   ├─→ Freeze Only (temporary)
   │   • Freeze account
   │   • Investigate
   │   • Thaw if cleared
   │
   └─→ Blacklist (permanent)
       • Add to blacklist
       • Freeze account
       • Seize if required
       • Report to authorities
```

### Integration with External Systems

```typescript
// Example: Chainalysis integration
import { Chainalysis } from 'chainalysis-sdk';

const chainalysis = new Chainalysis(apiKey);

// Screen address before transfer
const screening = await chainalysis.screenAddress(recipientAddress);

if (screening.risk === 'high') {
  // Add to blacklist
  await stable.compliance.blacklistAdd(
    recipientAddress,
    `Chainalysis risk: ${screening.reason}`,
    blacklisterKeypair
  );
  
  // Freeze account
  await stable.freezeAccount({
    tokenAccount: recipientTokenAccount,
    authority: masterAuthority,
  });
}
```

## Audit Trail

### On-Chain Events

Every compliance action emits events:

```rust
// Blacklist events
AddressBlacklisted {
    mint: Pubkey,
    address: Pubkey,
    reason: String,
    blacklister: Pubkey,
    timestamp: i64,
}

AddressRemovedFromBlacklist {
    mint: Pubkey,
    address: Pubkey,
    blacklister: Pubkey,
    timestamp: i64,
}

// Seizure events
TokensSeized {
    mint: Pubkey,
    from: Pubkey,
    to: Pubkey,
    amount: u64,
    seizer: Pubkey,
    timestamp: i64,
}
```

### Audit Log Export

```bash
# Export compliance actions
sss-token audit-log --action blacklist --export audit.csv

# Export seizure history
sss-token audit-log --action seize --export seizures.csv
```

## Regulatory Considerations

### GENIUS Act Compliance

SSS-2 is designed to support GENIUS Act requirements:

✅ **Freeze Capability**: Can freeze accounts  
✅ **Blacklist Enforcement**: Automatic on every transfer  
✅ **Token Seizure**: Via permanent delegate  
✅ **Audit Trail**: Immutable on-chain records  
✅ **Role Separation**: Compliance officers separate from operators  

### OFAC Compliance

```typescript
// Maintain OFAC sanctions list
const ofacList = await fetchOFACSanctionsList();

// Screen all addresses
for (const address of ofacList) {
  await stable.compliance.blacklistAdd(
    new PublicKey(address),
    "OFAC Specially Designated National",
    blacklisterKeypair
  );
}
```

### Data Retention

- Blacklist entries: Permanent on-chain
- Events: Permanent on-chain
- Audit logs: Exportable for off-chain storage
- Compliance reports: Generate on-demand

## Security Considerations

### Permanent Delegate Risks

**Risk**: Permanent delegate has powerful authority  
**Mitigation**: 
- Use multi-sig for master authority
- Separate seizer role from other roles
- Require account freeze before seizure
- Audit all seizure actions

### Transfer Hook Risks

**Risk**: Hook adds complexity to transfers  
**Mitigation**:
- Hook program is simple and audited
- Only checks blacklist (no complex logic)
- Fails safely (rejects on error)

### Blacklist Management

**Risk**: Incorrect blacklisting  
**Mitigation**:
- Require reason for every blacklist
- Multiple blacklisters for redundancy
- Removal capability for mistakes
- Regular audit of blacklist

## Performance Impact

### Transfer Costs

| Transfer Type | Compute Units | Cost Impact |
|--------------|---------------|-------------|
| SSS-1 (no hook) | ~5,000 | Baseline |
| SSS-2 (with hook) | ~8,000 | +60% |

**Note**: Still significantly cheaper than Ethereum.

### Blacklist Checks

- O(1) lookup via PDA
- No iteration required
- Minimal performance impact

## Migration from SSS-1

### Cannot Upgrade In-Place

SSS-1 tokens cannot be upgraded to SSS-2. Must deploy new token.

### Migration Process

```typescript
// 1. Deploy new SSS-2 token
const sss2Token = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority: adminKeypair,
});

// 2. Migrate balances
for (const holder of sss1Holders) {
  // Burn from SSS-1
  await sss1Token.burn({
    amount: holder.balance,
    burner: migrationAuthority,
    tokenAccount: holder.sss1Account,
  });
  
  // Mint to SSS-2
  await sss2Token.mint({
    recipient: holder.address,
    amount: holder.balance,
    minter: migrationAuthority,
  });
}

// 3. Update all integrations
// 4. Deprecate SSS-1 token
```

## Examples

### Example 1: Regulated Stablecoin

```typescript
// Initialize with compliance roles
const cusd = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority: bankMultisig,
  roles: {
    minters: [
      { address: treasuryManager, dailyQuota: new BN(10_000_000) }
    ],
    burners: [redemptionService],
    blacklisters: [complianceOfficer1, complianceOfficer2],
    seizers: [complianceOfficer1],
    pausers: [emergencyCouncil],
  },
});

// Compliance workflow
const suspiciousAddress = new PublicKey("...");

// 1. Add to blacklist
await cusd.compliance.blacklistAdd(
  suspiciousAddress,
  "Suspicious transaction pattern detected",
  complianceOfficer1
);

// 2. Freeze account
await cusd.freezeAccount({
  tokenAccount: suspiciousTokenAccount,
  authority: bankMultisig,
});

// 3. Seize if required
await cusd.compliance.seize({
  fromAccount: suspiciousTokenAccount,
  toAccount: bankTreasuryAccount,
  amount: await cusd.getBalance(suspiciousAddress),
  seizer: complianceOfficer1,
});
```

### Example 2: Payment Processor

```typescript
// Initialize payment processor stablecoin
const payToken = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "PayToken",
  symbol: "PAY",
  decimals: 6,
  authority: processorMultisig,
});

// Real-time compliance screening
async function processPayment(from: PublicKey, to: PublicKey, amount: BN) {
  // Check blacklist before processing
  const fromBlacklisted = await payToken.compliance.isBlacklisted(from);
  const toBlacklisted = await payToken.compliance.isBlacklisted(to);
  
  if (fromBlacklisted || toBlacklisted) {
    throw new Error('Address is blacklisted');
  }
  
  // Process payment (transfer hook will double-check)
  await processTransfer(from, to, amount);
}
```

## Comparison with SSS-1

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Compliance | Reactive | Proactive |
| Blacklist | Manual freeze | Automatic enforcement |
| Token Seizure | ❌ | ✅ |
| Transfer Hook | ❌ | ✅ |
| Permanent Delegate | ❌ | ✅ |
| Regulatory Fit | Low | High |
| Complexity | Low | Medium |
| Gas Cost | Lower | Higher (+60%) |

## FAQ

**Q: Is SSS-2 required for all stablecoins?**  
A: No, only for regulated environments. Use SSS-1 for internal tokens.

**Q: Can I disable compliance features later?**  
A: No, extensions are permanent. Deploy SSS-1 if you don't need compliance.

**Q: What happens if transfer hook fails?**  
A: The entire transfer fails. No tokens move.

**Q: Can blacklisted addresses still hold tokens?**  
A: Yes, but they cannot send or receive.

**Q: How do I handle false positives?**  
A: Remove from blacklist immediately using `blacklistRemove`.

**Q: Is the blacklist public?**  
A: Yes, all on-chain data is public. Consider privacy implications.

## Resources

- [SSS-1 Specification](./SSS-1.md)
- [Compliance Guide](./COMPLIANCE.md)
- [Operations Guide](./OPERATIONS.md)
- [SDK Documentation](./SDK.md)
