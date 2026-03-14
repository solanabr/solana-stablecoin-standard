---
sidebar_position: 2
title: SSS-2 Preset
description: Full compliance stablecoin with transfer hooks
---

# SSS-2: Full Compliance Preset

SSS-2 is the recommended preset for production stablecoins, providing complete compliance features including transfer hooks for automatic blacklist enforcement.

## Architecture

```mermaid
flowchart TB
    subgraph SSS2["SSS-2 Architecture"]
        MINT["🪙 Token Mint<br/>Token-2022"]
        CONFIG["📄 Config PDA"]
        ROLES["👤 Roles PDA"]
        BLACKLIST["🚫 Blacklist PDAs"]
        HOOK["🔗 Transfer Hook"]
    end

    subgraph Extensions["Token-2022 Extensions"]
        META["MetadataPointer"]
        CLOSE["MintCloseAuthority"]
        DELEGATE["PermanentDelegate"]
        HOOEXT["TransferHook ✨"]
    end

    MINT --> META & CLOSE & DELEGATE & HOOEXT
    CONFIG --> ROLES
    CONFIG --> BLACKLIST
    HOOEXT --> HOOK
    HOOK --> BLACKLIST
    
    style HOOK fill:#9945FF,color:#fff
    style HOOEXT fill:#9945FF,color:#fff
    style BLACKLIST fill:#f44336,color:#fff
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
| Transfer Hook | ✅ |
| Blacklist | ✅ |
| Seize | ✅ |
| Confidential Transfer | ❌ |

## Token-2022 Extensions

```mermaid
flowchart LR
    subgraph Used["✅ Extensions Used"]
        M["MetadataPointer"]
        C["MintCloseAuthority"]
        P["PermanentDelegate"]
        H["TransferHook ⭐"]
    end
    
    style H fill:#9945FF,color:#fff
```

- **MetadataPointer** - On-chain token metadata
- **MintCloseAuthority** - Close mint when supply = 0
- **PermanentDelegate** - Authority can seize tokens
- **TransferHook** - Custom transfer logic for compliance

## Use Cases

SSS-2 is ideal for:

- **Regulated stablecoins** - USDC/USDT-like compliance
- **Enterprise tokens** - B2B settlement tokens
- **RWA tokens** - Tokenized real-world assets

## Transfer Hook Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant T22 as Token-2022
    participant Hook as Transfer Hook
    participant BL as Blacklist PDAs
    participant Config as Config PDA

    User->>T22: transfer(recipient, 100)
    T22->>Hook: execute_hook()
    
    Hook->>Config: is_paused?
    Config-->>Hook: false
    
    Hook->>BL: sender_blacklisted?
    BL-->>Hook: false
    
    Hook->>BL: receiver_blacklisted?
    BL-->>Hook: false
    
    Hook-->>T22: ✅ Allow
    T22-->>User: Transfer Complete
```

## Initialization

```typescript
import { SSSClient, Preset, BackingType, BankingRail } from '@sss/sdk';

const { mint, configPda } = await client.initialize({
  name: 'Compliant USD',
  symbol: 'CUSD',
  decimals: 6,
  preset: Preset.Sss2,
  supplyCap: 0n, // Unlimited
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Swift,
  uri: 'https://example.com/metadata.json',
  hookProgramId: TRANSFER_HOOK_PROGRAM_ID, // Required for SSS-2
});
```

## Operations

### Blacklisting

The key differentiator of SSS-2 is automatic transfer blocking:

```mermaid
flowchart LR
    subgraph Before["Before Blacklist"]
        A1["User A"] -->|"✅ Can send"| B1["User B"]
        B1 -->|"✅ Can send"| A1
    end

    subgraph After["After Blacklist(A)"]
        A2["User A 🚫"] -->|"❌ Blocked"| B2["User B"]
        B2 -->|"❌ Blocked"| A2
        C2["User C"] -->|"❌ Blocked"| A2
    end
```

```typescript
// Add to blacklist
await client.addToBlacklist({
  address: badActor,
  config: configPda,
});

// Now ANY transfer involving this address will fail automatically!

// Remove from blacklist
await client.removeFromBlacklist({
  address: clearedAddress,
  config: configPda,
});
```

### Seizure

```mermaid
sequenceDiagram
    participant Seizer as ⚡ Seizer
    participant SSS as SSS Protocol
    participant BadActor as 🚫 Bad Actor
    participant Treasury as 🏦 Treasury

    Seizer->>SSS: seize(bad_actor, amount)
    SSS->>SSS: Verify seizer role
    SSS->>SSS: Verify blacklisted
    SSS->>BadActor: Transfer via PermanentDelegate
    BadActor-->>Treasury: Tokens seized
    SSS-->>Seizer: ✅ Seizure complete
```

```typescript
// Seize tokens from a blacklisted account
await client.seize({
  address: badActor,
  amount: 1_000_000_000n,
  config: configPda,
});
```

### Banking Rails

SSS-2 supports full banking integration:

```typescript
// Create a mint request (after receiving bank wire)
await client.createMintRequest({
  depositor: bankCustomer,
  recipient: tokenRecipient,
  amount: 10_000_000_000n,
  fiatAmount: 10000_00n, // $10,000.00 in cents
  fiatCurrency: FiatCurrency.Usd,
  referenceId: wireReference,
});

// Confirm and mint after bank verification
await client.confirmAndMint({
  requestPda: mintRequestPda,
});
```

## Roles Configuration

```mermaid
flowchart TB
    AUTH["🔑 Authority"] --> MINTER["💰 Minter"]
    AUTH --> FREEZER["❄️ Freezer"]
    AUTH --> BLACKLISTER["🚫 Blacklister"]
    AUTH --> SEIZER["⚡ Seizer"]
    AUTH --> PAUSER["⏸️ Pauser"]
    
    style AUTH fill:#FF5722,color:#fff
```

| Role | Permissions |
|------|-------------|
| **Minter** | `mint_tokens`, `burn_tokens` |
| **Freezer** | `freeze_account`, `thaw_account` |
| **Blacklister** | `add_to_blacklist`, `remove_from_blacklist` |
| **Seizer** | `seize` |
| **Pauser** | `pause`, `unpause` |

```typescript
// Grant compliance role
await client.updateRoles({
  target: complianceOfficer,
  role: Role.Blacklister,
  active: true,
  config: configPda,
});
```

## Compliance Workflow

```mermaid
flowchart TB
    subgraph Detection["1️⃣ Detection"]
        D1["Suspicious activity detected"]
        D2["Regulatory request received"]
        D3["Sanctions list match"]
    end

    subgraph Action["2️⃣ Action"]
        A1["Add to blacklist"]
        A2["Freeze account"]
        A3["Seize tokens"]
    end

    subgraph Resolution["3️⃣ Resolution"]
        R1["Investigation complete"]
        R2["Remove from blacklist"]
        R3["Return funds if appropriate"]
    end

    D1 & D2 & D3 --> A1
    A1 --> A2
    A2 --> A3
    A3 --> R1
    R1 --> R2
    R2 --> R3
```

## Minter Quotas

Limit how much each minter can mint per day:

```typescript
// Set a 1M daily quota
await client.updateMinterConfig({
  minter: minterPubkey,
  quota: 1_000_000_000_000n, // 1M tokens per 24-hour epoch
  config: configPda,
});
```

The quota resets every 24 hours automatically.

## Reserve Attestation

Provide proof of reserves:

```typescript
await client.submitAttestation({
  totalReserves: 100_000_000_000_000n, // $100M in reserves
  validForSeconds: 86400, // Valid for 24 hours
  ipfsHash: auditReportHash,
  config: configPda,
});
```

## Audit Trail

All SSS-2 operations maintain an audit trail:

```typescript
// BlacklistEntry stores:
{
  address: Pubkey,
  is_blacklisted: bool,
  reason: [u8; 32],
  blacklisted_by: Pubkey,
  blacklisted_at: i64,
  removed_by: Option<Pubkey>,
  removed_at: Option<i64>,
}

// RolesConfig stores:
{
  granted_by: Pubkey,
  granted_at: i64,
  last_action_at: i64,
  active: bool,
}
```

---

Next: [SSS-3 Preset](./sss-3.md) - Privacy-preserving with confidential transfers
