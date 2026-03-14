---
sidebar_position: 1
title: SSS-1 Preset
description: Basic compliant stablecoin with minimal features
---

# SSS-1: Basic Preset

SSS-1 is the minimal stablecoin preset, providing essential compliance features without transfer hooks.

## Architecture

```mermaid
flowchart TB
    subgraph SSS1["SSS-1 Architecture"]
        MINT["🪙 Token Mint<br/>Token-2022"]
        CONFIG["📄 Config PDA"]
        ROLES["👤 Roles PDA"]
    end

    subgraph Extensions["Token-2022 Extensions"]
        META["MetadataPointer"]
        CLOSE["MintCloseAuthority"]
        DELEGATE["PermanentDelegate"]
    end

    subgraph NotIncluded["❌ Not Included"]
        HOOK["Transfer Hook"]
        BL["Blacklist"]
        CT["Confidential Transfer"]
    end

    MINT --> META & CLOSE & DELEGATE
    CONFIG --> ROLES
    
    style HOOK fill:#f44336,color:#fff
    style BL fill:#f44336,color:#fff
    style CT fill:#f44336,color:#fff
    style META fill:#4CAF50,color:#fff
    style CLOSE fill:#4CAF50,color:#fff
    style DELEGATE fill:#4CAF50,color:#fff
```

## Features

| Feature | Included |
|---------|:--------:|
| Mint/Burn | ✅ |
| Freeze/Thaw | ✅ |
| Pause/Unpause | ✅ |
| Metadata | ✅ |
| Permanent Delegate | ✅ |
| Supply Caps | ✅ |
| Transfer Hook | ❌ |
| Blacklist | ❌ |
| Seize | ❌ |
| Confidential Transfer | ❌ |

## Token-2022 Extensions

```mermaid
flowchart LR
    subgraph Used["✅ Extensions Used"]
        M["MetadataPointer<br/>On-chain metadata"]
        C["MintCloseAuthority<br/>Close when empty"]
        P["PermanentDelegate<br/>Authority control"]
    end
```

- **MetadataPointer** - On-chain token metadata
- **MintCloseAuthority** - Close mint when supply = 0
- **PermanentDelegate** - Authority can transfer from any account

## Use Cases

SSS-1 is ideal for:

- **Simple internal tokens** - Company-specific stablecoins
- **Testing and development** - Quick prototyping
- **Non-regulated markets** - Where blacklisting isn't required

## State Machine

```mermaid
stateDiagram-v2
    [*] --> Active: initialize()
    
    state Active {
        [*] --> Ready
        Ready --> Minting: mint_tokens()
        Minting --> Ready: ✅
        Ready --> Burning: burn_tokens()
        Burning --> Ready: ✅
    }
    
    Active --> Paused: pause()
    Paused --> Active: unpause()
    Active --> [*]: close_mint()
```

## Initialization

```typescript
import { SSSClient, Preset, BackingType, BankingRail } from '@sss/sdk';

const { mint, configPda } = await client.initialize({
  name: 'Basic USD',
  symbol: 'BUSD',
  decimals: 6,
  preset: Preset.Sss1,
  supplyCap: 100_000_000_000_000n, // 100M tokens
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.None,
  uri: 'https://example.com/metadata.json',
});
```

## Operations

### Minting

```typescript
await client.mintTokens({
  amount: 1_000_000n,
  recipient: userPubkey,
  config: configPda,
});
```

### Freezing

```mermaid
sequenceDiagram
    participant Auth as Authority
    participant SSS as SSS Protocol
    participant Account as Token Account

    Auth->>SSS: freeze_account()
    SSS->>Account: Set frozen flag
    Account-->>Auth: ✅ Account frozen
    
    Note over Account: Cannot send tokens
    Note over Account: Can still receive
```

```typescript
// Freeze a suspicious account
await client.freezeAccount({
  address: suspiciousAccount,
  config: configPda,
});

// Thaw when cleared
await client.thawAccount({
  address: suspiciousAccount,
  config: configPda,
});
```

### Pausing

```typescript
// Emergency pause - stops all minting
await client.pause({ config: configPda });

// Resume operations
await client.unpause({ config: configPda });
```

## Limitations

```mermaid
flowchart TB
    subgraph Limitations["⚠️ SSS-1 Limitations"]
        L1["No transfer blocking<br/>Addresses can still receive"]
        L2["Manual compliance<br/>Must freeze individually"]
        L3["No transfer fees<br/>Cannot add protocol fees"]
        L4["No privacy<br/>All balances public"]
    end
```

- **No transfer blocking** - Blacklisted addresses can still receive transfers
- **Manual compliance** - Must freeze accounts individually
- **No transfer fees** - Cannot add protocol fees on transfers

## When to Upgrade

Consider SSS-2 if you need:
- Automatic transfer blocking
- Blacklist enforcement
- Seizure capabilities
- Transfer hooks for custom logic

---

Next: [SSS-2 Preset](./sss-2) - Full compliance with transfer hooks
