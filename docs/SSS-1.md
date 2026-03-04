# SSS-1: Minimal Stablecoin Standard

## Overview

SSS-1 is the minimal stablecoin standard for Solana, providing essential features for internal tokens, DAO treasuries, and ecosystem settlement. It focuses on simplicity and flexibility while maintaining security.

## Use Cases

- **Internal Company Tokens**: Employee rewards, internal accounting
- **DAO Treasuries**: Governance tokens, treasury management
- **Gaming Currencies**: In-game tokens, reward systems
- **Loyalty Points**: Customer rewards, membership benefits
- **Test Environments**: Development and testing

## Features

### Core Capabilities

1. **Mint Authority**: Controlled token creation with role-based access
2. **Freeze Authority**: Ability to freeze/thaw individual accounts
3. **Metadata**: Token name, symbol, URI for off-chain data
4. **Role Management**: Separate roles for minting, burning, pausing

### What's NOT Included

- ❌ Permanent Delegate (no token seizure)
- ❌ Transfer Hook (no automatic blacklist enforcement)
- ❌ Default Account Freezing
- ❌ On-chain Blacklist

## Architecture

```
┌─────────────────────────────────────────────────┐
│              SSS-1 Components                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Token-2022 Core                  │  │
│  │  • Mint Authority                        │  │
│  │  • Freeze Authority                      │  │
│  │  • Metadata Extension                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Role Management                  │  │
│  │  • Master Authority                      │  │
│  │  • Minters (with quotas)                │  │
│  │  • Burners                               │  │
│  │  • Pausers                               │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Operations                       │  │
│  │  • Mint                                  │  │
│  │  • Burn                                  │  │
│  │  • Freeze Account                        │  │
│  │  • Thaw Account                          │  │
│  │  • Pause/Unpause                         │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Configuration

### Initialization Parameters

```rust
pub struct SSS1Config {
    pub name: String,              // Max 32 characters
    pub symbol: String,            // Max 10 characters
    pub uri: String,               // Max 200 characters
    pub decimals: u8,              // 0-9
    
    // SSS-1 specific (all false)
    pub enable_permanent_delegate: false,
    pub enable_transfer_hook: false,
    pub default_account_frozen: false,
}
```

### TypeScript SDK

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My Token",
  symbol: "MTK",
  decimals: 6,
  authority: adminKeypair,
});
```

### CLI

```bash
sss-token init --preset sss-1 \
  --name "My Token" \
  --symbol "MTK" \
  --decimals 6
```

## Operations

### 1. Minting

**Who can mint**: Accounts with minter role  
**Constraints**: Daily quota per minter  
**Checks**: Not paused, valid amount, quota available

```typescript
await stable.mint({
  recipient: recipientAddress,
  amount: new BN(1_000_000),
  minter: minterKeypair,
});
```

### 2. Burning

**Who can burn**: Accounts with burner role  
**Constraints**: Must own tokens being burned  
**Checks**: Not paused, valid amount

```typescript
await stable.burn({
  amount: new BN(500_000),
  burner: burnerKeypair,
  tokenAccount: tokenAccountAddress,
});
```

### 3. Freezing Accounts

**Who can freeze**: Master authority  
**Effect**: Prevents all transfers from/to account  
**Use case**: Reactive compliance (freeze suspicious accounts)

```typescript
await stable.freezeAccount({
  tokenAccount: suspiciousAccount,
  authority: masterAuthority,
});
```

### 4. Pausing

**Who can pause**: Accounts with pauser role  
**Effect**: Stops all operations (mint, burn, transfer)  
**Use case**: Emergency circuit breaker

```typescript
await stable.pause(pauserKeypair);
```

## Role Management

### Master Authority

- Can update all roles
- Can freeze/thaw accounts
- Can transfer authority
- Cannot be removed (only transferred)

### Minter

- Can mint tokens up to daily quota
- Quota resets every 24 hours
- Multiple minters supported
- Each minter has independent quota

### Burner

- Can burn tokens from any account they control
- No quota limits
- Multiple burners supported

### Pauser

- Can pause/unpause all operations
- Emergency control only
- Multiple pausers supported

## Compliance Model

### Reactive Compliance

SSS-1 uses **reactive compliance**:
- No automatic enforcement
- Manual intervention required
- Freeze accounts as needed
- Suitable for low-risk environments

### When to Use SSS-1

✅ **Good for:**
- Internal company tokens
- DAO governance tokens
- Gaming currencies
- Loyalty programs
- Development/testing

❌ **Not suitable for:**
- Regulated stablecoins (use SSS-2)
- Public payment systems
- High-value transfers
- Jurisdictions requiring proactive compliance

## Security Considerations

### Access Control

- Separate roles prevent single point of failure
- Master authority should use multi-sig
- Minter quotas limit damage from compromised keys
- Pause functionality provides emergency stop

### Best Practices

1. **Multi-sig Master Authority**: Use 3-of-5 or similar
2. **Minter Quotas**: Set conservative daily limits
3. **Regular Audits**: Monitor minting activity
4. **Freeze Capability**: Keep master authority accessible
5. **Pause Mechanism**: Designate trusted pausers

## Upgrade Path

### To SSS-2 (Compliant)

If regulatory requirements change:
1. Cannot upgrade existing token
2. Must deploy new SSS-2 token
3. Migrate balances via burn/mint
4. Update all integrations

### To SSS-3 (Private)

For privacy features:
1. Cannot upgrade existing token
2. Must deploy new SSS-3 token
3. Migrate with privacy considerations

## Examples

### Example 1: DAO Treasury Token

```typescript
// Initialize
const daoToken = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "DAO Treasury Token",
  symbol: "DTT",
  decimals: 6,
  authority: daoMultisig,
  roles: {
    minters: [
      { address: treasuryManager, dailyQuota: new BN(1_000_000) }
    ],
    burners: [treasuryManager],
    pausers: [emergencyCouncil],
  },
});

// Mint for operations
await daoToken.mint({
  recipient: operationsWallet,
  amount: new BN(100_000),
  minter: treasuryManager,
});
```

### Example 2: Gaming Currency

```typescript
// Initialize
const gameCoin = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "Game Coin",
  symbol: "GAME",
  decimals: 0, // Whole numbers only
  authority: gameServer,
  roles: {
    minters: [
      { address: rewardSystem, dailyQuota: new BN(1_000_000) }
    ],
    burners: [marketplaceContract],
  },
});

// Reward player
await gameCoin.mint({
  recipient: playerWallet,
  amount: new BN(100), // 100 coins
  minter: rewardSystem,
});
```

## Comparison with SSS-2

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Mint/Burn | ✅ | ✅ |
| Freeze Accounts | ✅ | ✅ |
| Pause/Unpause | ✅ | ✅ |
| Role Management | ✅ | ✅ |
| Permanent Delegate | ❌ | ✅ |
| Transfer Hook | ❌ | ✅ |
| Blacklist | ❌ | ✅ |
| Token Seizure | ❌ | ✅ |
| Compliance | Reactive | Proactive |
| Use Case | Internal | Regulated |

## FAQ

**Q: Can I add compliance features later?**  
A: No, extensions must be enabled at initialization. Deploy a new SSS-2 token instead.

**Q: How do I handle suspicious activity?**  
A: Freeze the account immediately, investigate, then thaw or keep frozen.

**Q: What's the difference between pause and freeze?**  
A: Pause stops ALL operations globally. Freeze stops one specific account.

**Q: Can I have multiple master authorities?**  
A: No, but you should use a multi-sig wallet as the master authority.

**Q: What happens if a minter exceeds their quota?**  
A: The transaction fails with "QuotaExceeded" error. Quota resets daily.

## Resources

- [SDK Documentation](./SDK.md)
- [Operations Guide](./OPERATIONS.md)
- [Architecture](./ARCHITECTURE.md)
- [SSS-2 Specification](./SSS-2.md)
