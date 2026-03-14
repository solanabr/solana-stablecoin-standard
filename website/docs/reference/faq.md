---
sidebar_position: 4
title: FAQ
description: Frequently asked questions about SSS
---

# Frequently Asked Questions

Common questions about the Solana Stablecoin Standard.

## General

### What is SSS?

SSS (Solana Stablecoin Standard) is an open-source framework for building regulated, institutional-grade stablecoins on Solana using Token-2022.

### Why use SSS instead of existing stablecoins?

SSS provides capabilities not available in existing stablecoins:

```mermaid
flowchart LR
    subgraph SSS_Benefits["SSS Advantages"]
        OS["Open Source"]
        MA["Multi-Asset Backing"]
        CT["Confidential Transfers"]
        BR["Banking Rails"]
        SEC["Enterprise Security"]
    end
```

- **Open Source**: Full code transparency and auditability
- **Self-Custody**: You control your stablecoin, not a third party
- **Multi-Asset**: Support for gold, silver, bonds, not just fiat
- **Privacy**: Optional confidential transfers (SSS-3)
- **Compliance**: Built-in regulatory features

### Is SSS production-ready?

Yes! SSS includes:
- 332+ test cases
- Comprehensive documentation
- Devnet deployment
- Multiple auditable presets

## Presets

### Which preset should I choose?

```mermaid
flowchart TD
    START["What do you need?"] --> Q1{"Transfer blocking<br/>required?"}
    
    Q1 -->|No| SSS1["SSS-1<br/>Basic Compliance"]
    Q1 -->|Yes| Q2{"Privacy<br/>required?"}
    
    Q2 -->|No| SSS2["SSS-2<br/>Full Compliance"]
    Q2 -->|Yes| SSS3["SSS-3<br/>Privacy + Compliance"]

    style SSS1 fill:#4CAF50,color:#fff
    style SSS2 fill:#2196F3,color:#fff
    style SSS3 fill:#9C27B0,color:#fff
```

| Use Case | Recommended Preset |
|----------|-------------------|
| Internal tokens | SSS-1 |
| Regulated stablecoin | SSS-2 |
| Private payments | SSS-3 |
| Commodity-backed | SSS-2 |
| Institutional trading | SSS-3 |

### Can I upgrade from SSS-1 to SSS-2?

No, presets are set at initialization and cannot be changed. This is because:
- Token-2022 extensions are immutable after creation
- Transfer hooks must be configured at mint creation
- Security model depends on preset choice

If you need to upgrade, create a new stablecoin and migrate balances.

### What's the difference between freeze and blacklist?

| Feature | Freeze | Blacklist |
|---------|--------|-----------|
| **Scope** | Single account | Address globally |
| **Sends** | ❌ Blocked | ❌ Blocked |
| **Receives** | ✅ Allowed | ❌ Blocked |
| **Preset** | All presets | SSS-2, SSS-3 |
| **Mechanism** | Token-2022 | Transfer hook |

## Technical

### What Solana programs does SSS use?

```mermaid
flowchart TB
    subgraph SSS_Programs["SSS Programs"]
        TOKEN["sss-token"]
        HOOK["sss-transfer-hook"]
    end

    subgraph Solana_Programs["Solana Programs"]
        T22["Token-2022"]
        SYS["System Program"]
    end

    subgraph Oracles["Oracle Programs"]
        PYTH["Pyth"]
        SWITCH["Switchboard"]
    end

    TOKEN --> T22
    TOKEN --> PYTH
    TOKEN -.-> SWITCH
    HOOK --> TOKEN
```

### How are PDAs derived?

| PDA | Seeds |
|-----|-------|
| Config | `["config", mint]` |
| Roles | `["roles", config, user]` |
| Blacklist | `["blacklist", config, address]` |
| Oracle | `["oracle", config]` |

### What Token-2022 extensions are used?

| Extension | SSS-1 | SSS-2 | SSS-3 |
|-----------|:-----:|:-----:|:-----:|
| MetadataPointer | ✅ | ✅ | ✅ |
| MintCloseAuthority | ✅ | ✅ | ✅ |
| PermanentDelegate | ✅ | ✅ | ✅ |
| TransferHook | ❌ | ✅ | ✅ |
| ConfidentialTransferMint | ❌ | ❌ | ✅ |

### How does the transfer hook work?

```mermaid
sequenceDiagram
    participant User
    participant T22 as Token-2022
    participant Hook as Transfer Hook
    participant Config as Config PDA

    User->>T22: transfer()
    T22->>Hook: execute_hook()
    Hook->>Config: Check pause status
    Hook->>Config: Check blacklists
    Hook-->>T22: Allow/Deny
    T22-->>User: Result
```

## Security

### What is `security_txt!`?

A Rust macro that embeds security contact information directly on-chain:

```rust
security_txt! {
    name: "SSS",
    contacts: "email:security@example.com",
    policy: "https://example.com/security"
}
```

This helps security researchers report vulnerabilities responsibly.

### How does two-step authority transfer work?

```mermaid
sequenceDiagram
    participant A as Current Authority
    participant Config as Config PDA
    participant B as New Authority

    A->>Config: nominate_authority(B)
    Note over Config: pending_authority = B
    
    Note over A,B: B must explicitly accept
    
    B->>Config: accept_authority()
    Note over Config: authority = B
```

This prevents accidental or malicious authority transfers.

### What are minter quotas?

Daily limits on how much each minter can mint:

```typescript
await client.updateMinterConfig({
  minter: minterPubkey,
  quota: 1_000_000_000000n,  // 1M tokens per day
  epochDuration: 86400,       // 24 hours
});
```

Quotas automatically reset each epoch.

## Operations

### How do I pause the stablecoin?

```typescript
// Emergency pause
await client.pause({ config: configPda });

// Resume when safe
await client.unpause({ config: configPda });
```

Only Authority or Pauser role can pause.

### How do I add someone to the blacklist?

```typescript
await client.addToBlacklist({
  address: badActorPubkey,
  reason: 'Sanctions violation',
  config: configPda,
});
```

### How do I seize tokens?

First blacklist the address, then seize:

```typescript
// 1. Blacklist
await client.addToBlacklist({
  address: targetAddress,
  config: configPda,
});

// 2. Seize
await client.seize({
  address: targetAddress,
  amount: 1_000_000_000n,
  config: configPda,
});
```

## Banking

### What banking rails are supported?

| Rail | Network | Settlement |
|------|---------|------------|
| SWIFT | Global | 1-5 days |
| SEPA | Europe | 1-2 days |
| Fedwire | USA | Same day |
| Wire | Regional | 1-3 days |
| ACH | USA | 2-3 days |

### How do mint requests work?

```mermaid
flowchart LR
    A["User wires fiat"] --> B["Backend confirms"]
    B --> C["Create mint request"]
    C --> D["Confirm & mint"]
    D --> E["User receives tokens"]
```

## Privacy (SSS-3)

### How do confidential transfers work?

Amounts are encrypted using ElGamal encryption and verified via zero-knowledge proofs:

```mermaid
flowchart TB
    PLAIN["Regular Balance<br/>Visible on-chain"] --> DEPOSIT["Deposit"]
    DEPOSIT --> ENCRYPTED["Confidential Balance<br/>Encrypted"]
    ENCRYPTED --> TRANSFER["CT Transfer<br/>Amount hidden"]
    TRANSFER --> ENCRYPTED
    ENCRYPTED --> WITHDRAW["Withdraw"]
    WITHDRAW --> PLAIN
```

### Can authority see confidential balances?

Yes, the stablecoin authority can configure auditor keys to view encrypted balances for compliance purposes.

### What's the performance impact of CT?

Confidential transfers require more compute units due to ZK proof verification:

| Operation | Regular CUs | CT CUs |
|-----------|-------------|--------|
| Transfer | ~50,000 | ~200,000 |
| Deposit | ~30,000 | ~100,000 |
| Withdraw | ~30,000 | ~150,000 |

## Troubleshooting

### Transaction failed with "QuotaExceeded"

The minter has reached their daily quota. Either:
1. Wait for epoch reset
2. Have authority increase quota

### Transaction failed with "SupplyCapExceeded"

Total supply would exceed the configured cap. Either:
1. Burn tokens to make room
2. Have authority increase supply cap

### Transfer hook failing with "AccountNotFound"

Ensure all required accounts are included:
1. Sender blacklist PDA
2. Receiver blacklist PDA  
3. Config PDA
4. Extra accounts PDAs

## More Questions?

- [GitHub Issues](https://github.com/solanabr/solana-stablecoin-standard/issues)
- [Discord Community](https://discord.gg/solana)
- [Documentation](/)
