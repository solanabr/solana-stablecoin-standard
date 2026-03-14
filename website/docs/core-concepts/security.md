---
sidebar_position: 4
title: Security
description: Enterprise security features including security_txt!, two-step authority, and audit trails
---

# Enterprise Security

SSS implements comprehensive security measures designed for institutional-grade stablecoin deployments.

## Security Architecture Overview

```mermaid
flowchart TB
    subgraph Security["🛡️ Security Layers"]
        L1["Layer 1: On-Chain Security"]
        L2["Layer 2: Access Control"]
        L3["Layer 3: Operational Security"]
        L4["Layer 4: Audit & Compliance"]
    end

    subgraph Features["Security Features"]
        SEC_TXT["security_txt!"]
        TWO_STEP["Two-Step Authority"]
        RBAC["Role-Based Access"]
        QUOTAS["Minter Quotas"]
        AUDIT["Audit Trails"]
        PAUSE["Emergency Pause"]
    end

    L1 --> SEC_TXT
    L2 --> TWO_STEP & RBAC
    L3 --> QUOTAS & PAUSE
    L4 --> AUDIT

    style L1 fill:#f44336,color:#fff
    style L2 fill:#FF9800,color:#fff
    style L3 fill:#2196F3,color:#fff
    style L4 fill:#4CAF50,color:#fff
```

## 🛡️ security_txt! Macro

The `security_txt!` macro embeds standardized security contact information directly on-chain, following the [security.txt](https://securitytxt.org/) standard.

### Purpose

```mermaid
flowchart LR
    subgraph Discovery["Bug Discovery"]
        RESEARCHER["🔍 Security<br/>Researcher"]
        BUG["🐛 Vulnerability<br/>Found"]
    end

    subgraph OnChain["On-Chain Info"]
        SEC_TXT["📄 security_txt!<br/>Contact Info"]
    end

    subgraph Response["Response"]
        CONTACT["📧 Contact Team"]
        FIX["🔧 Patch Deployed"]
        REWARD["💰 Bug Bounty"]
    end

    RESEARCHER --> BUG
    BUG --> SEC_TXT
    SEC_TXT --> CONTACT
    CONTACT --> FIX
    FIX --> REWARD

    style SEC_TXT fill:#14F195,color:#000
```

### Implementation

```rust
use solana_security_txt::security_txt;

security_txt! {
    // Required fields
    name: "Solana Stablecoin Standard",
    project_url: "https://sss.solana.com",
    contacts: "email:security@sss.solana.com,discord:sss-security",
    policy: "https://sss.solana.com/security",
    
    // Optional fields
    preferred_languages: "en",
    source_code: "https://github.com/solanabr/solana-stablecoin-standard",
    source_revision: env!("GIT_SHA"),
    encryption: "https://sss.solana.com/pgp-key.txt",
    auditors: "OtterSec, Neodyme",
    acknowledgements: "https://sss.solana.com/hall-of-fame"
}
```

### Fields Explained

| Field | Description | Example |
|-------|-------------|---------|
| `name` | Project name | "Solana Stablecoin Standard" |
| `project_url` | Main website | "https://sss.solana.com" |
| `contacts` | Security contacts | "email:security@sss.solana.com" |
| `policy` | Security policy URL | "https://sss.solana.com/security" |
| `preferred_languages` | Languages for reports | "en,pt" |
| `source_code` | Source repository | GitHub URL |
| `auditors` | Security auditors | "OtterSec, Neodyme" |
| `acknowledgements` | Hall of fame | Researcher credits |

---

## 🔑 Two-Step Authority Transfer

Prevents accidental or hostile takeover of stablecoin authority through a nominate-accept pattern.

### Flow Diagram

```mermaid
stateDiagram-v2
    [*] --> Active: initialize()
    
    state Active {
        [*] --> CurrentAuthority
        CurrentAuthority --> Nominated: nominate_authority(new)
        Nominated --> CurrentAuthority: cancel_nomination()
        Nominated --> NewAuthority: accept_authority()
        NewAuthority --> [*]
    }

    note right of Nominated
        pending_authority set
        Old authority still active
    end note

    note right of NewAuthority
        authority updated
        pending_authority cleared
    end note
```

### Sequence Diagram

```mermaid
sequenceDiagram
    participant OldAuth as 🔑 Current Authority
    participant Config as 📄 Config PDA
    participant NewAuth as 🆕 New Authority

    Note over OldAuth,NewAuth: Step 1: Nomination
    OldAuth->>Config: nominate_authority(new_auth)
    Config->>Config: pending_authority = new_auth
    Config-->>OldAuth: ✅ Nominated

    Note over OldAuth,NewAuth: Step 2: Acceptance (Required)
    NewAuth->>Config: accept_authority()
    Config->>Config: authority = pending_authority
    Config->>Config: pending_authority = None
    Config-->>NewAuth: ✅ Authority Transferred

    Note over OldAuth,NewAuth: Old authority can no longer act
```

### Implementation

```typescript
// Step 1: Current authority nominates new authority
await client.nominateAuthority({
  newAuthority: newAuthorityPubkey,
  config: configPda,
});

console.log('New authority nominated. They must accept.');

// Step 2: New authority accepts (signed by new authority)
const newClient = new SSSClient(connection, newAuthority.publicKey);
await newClient.acceptAuthority({
  config: configPda,
});

console.log('Authority transfer complete!');
```

### Security Benefits

| Threat | Protection |
|--------|------------|
| **Private key theft** | Attacker can't immediately take over |
| **Social engineering** | Requires action from two parties |
| **Insider threat** | Creates audit trail of transfer |
| **Accidental transfer** | Easy to cancel before acceptance |

---

## 👥 Role-Based Access Control (RBAC)

Fine-grained permissions system with complete audit trails.

### Role Hierarchy

```mermaid
flowchart TB
    subgraph Roles["Role Permissions"]
        AUTH["🔑 Authority<br/>━━━━━━━━━━━<br/>• All permissions<br/>• Grant/revoke roles<br/>• Set supply cap<br/>• Transfer authority"]
        
        MINTER["💰 Minter<br/>━━━━━━━━━━━<br/>• mint_tokens<br/>• burn_tokens<br/>• mint_with_oracle<br/>• Quota limited"]
        
        PAUSER["⏸️ Pauser<br/>━━━━━━━━━━━<br/>• pause<br/>• unpause<br/>• Emergency control"]
        
        FREEZER["❄️ Freezer<br/>━━━━━━━━━━━<br/>• freeze_account<br/>• thaw_account<br/>• Individual control"]
        
        BLACKLISTER["🚫 Blacklister<br/>━━━━━━━━━━━<br/>• add_to_blacklist<br/>• remove_from_blacklist<br/>• Compliance"]
        
        SEIZER["⚡ Seizer<br/>━━━━━━━━━━━<br/>• seize<br/>• Asset recovery<br/>• Court orders"]
    end

    AUTH --> MINTER & PAUSER & FREEZER & BLACKLISTER & SEIZER

    style AUTH fill:#FF5722,color:#fff
    style MINTER fill:#4CAF50,color:#fff
    style PAUSER fill:#FF9800,color:#fff
    style FREEZER fill:#2196F3,color:#fff
    style BLACKLISTER fill:#9C27B0,color:#fff
    style SEIZER fill:#E91E63,color:#fff
```

### RolesConfig PDA

```rust
pub struct RolesConfig {
    pub stablecoin: Pubkey,
    pub target: Pubkey,
    
    // Role flags
    pub is_minter: bool,
    pub is_burner: bool,
    pub is_pauser: bool,
    pub is_freezer: bool,
    pub is_blacklister: bool,
    pub is_seizer: bool,
    
    // Minter limits
    pub mint_quota: u64,
    pub minted_this_epoch: u64,
    pub epoch_start: i64,
    
    // Audit fields ✨
    pub granted_by: Pubkey,    // Who granted this role
    pub granted_at: i64,       // When it was granted
    pub last_action_at: i64,   // Last role action
    
    pub active: bool,
    pub bump: u8,
}
```

### Audit Trail Benefits

```mermaid
flowchart LR
    subgraph Audit["📝 Audit Trail"]
        GB["granted_by<br/>Who granted role"]
        GA["granted_at<br/>Timestamp"]
        LA["last_action_at<br/>Activity tracking"]
    end

    subgraph Compliance["✅ Compliance"]
        WHO["Who has access?"]
        WHEN["When granted?"]
        WHAT["What did they do?"]
    end

    GB --> WHO
    GA --> WHEN
    LA --> WHAT

    style GB fill:#9C27B0,color:#fff
    style GA fill:#2196F3,color:#fff
    style LA fill:#4CAF50,color:#fff
```

---

## 📊 Minter Quotas

Epoch-based minting limits to control supply risk.

### Quota Flow

```mermaid
flowchart TB
    subgraph Quota["Minter Quota System"]
        MINTER["💰 Minter"]
        QUOTA["📊 mint_quota<br/>1,000,000 tokens"]
        MINTED["📈 minted_this_epoch<br/>750,000 tokens"]
        REMAINING["✅ remaining<br/>250,000 tokens"]
    end

    subgraph Epoch["⏰ Epoch System"]
        START["epoch_start<br/>Day 1, 00:00 UTC"]
        RESET["Epoch Reset<br/>Day 2, 00:00 UTC"]
    end

    MINTER -->|"mint 100K"| QUOTA
    QUOTA --> MINTED
    MINTED --> REMAINING
    RESET -->|"resets to 0"| MINTED

    style QUOTA fill:#4CAF50,color:#fff
    style REMAINING fill:#2196F3,color:#fff
```

### Implementation

```typescript
// Set minter quota
await client.updateMinterConfig({
  minter: minterPubkey,
  quota: 1_000_000_000000n,  // 1M tokens per epoch
  epochDuration: 86400,       // 24 hours
  config: configPda,
});

// Minting respects quota
await client.mintTokens({
  amount: 100_000_000000n,
  recipient: recipientPubkey,
  config: configPda,
});
// Remaining quota: 900,000 tokens
```

### Quota Exceeded

```mermaid
sequenceDiagram
    participant Minter
    participant SSS as SSS Protocol
    participant Config

    Minter->>SSS: mint_tokens(500K)
    SSS->>Config: Check quota
    Config-->>SSS: quota: 1M, minted: 750K
    SSS->>SSS: 750K + 500K > 1M ❌
    SSS-->>Minter: Error: QuotaExceeded
```

---

## ⏸️ Emergency Pause

Global pause mechanism for emergency response.

### Pause Flow

```mermaid
stateDiagram-v2
    [*] --> Active: initialize()
    
    Active --> Paused: pause()
    Paused --> Active: unpause()
    
    state Active {
        ✅ All operations allowed
    }
    
    state Paused {
        ❌ Transfers blocked
        ❌ Minting blocked
        ❌ Burning blocked
        ✅ Admin operations only
    }
```

### What Gets Paused?

| Operation | Paused State |
|-----------|:------------:|
| `transfer` | ❌ Blocked |
| `mint_tokens` | ❌ Blocked |
| `burn_tokens` | ❌ Blocked |
| `freeze_account` | ✅ Allowed |
| `thaw_account` | ✅ Allowed |
| `add_to_blacklist` | ✅ Allowed |
| `seize` | ✅ Allowed |
| `unpause` | ✅ Allowed |

---

## 🔒 Transfer Hook Security

The transfer hook provides an additional security layer:

```mermaid
sequenceDiagram
    participant User
    participant T22 as Token-2022
    participant Hook as Transfer Hook
    participant Config as SSS Config

    User->>T22: transfer(100 tokens)
    T22->>Hook: execute_hook()
    
    Hook->>Config: is_paused?
    Config-->>Hook: false
    
    Hook->>Config: sender_blacklisted?
    Config-->>Hook: false
    
    Hook->>Config: receiver_blacklisted?
    Config-->>Hook: false
    
    Hook-->>T22: ✅ Allow
    T22-->>User: Transfer complete
```

### Fallback Handler

```rust
/// Fallback handler for TransferHook interface dispatch
pub fn fallback<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> Result<()> {
    let instruction = TransferHookInstruction::unpack(data)?;
    
    match instruction {
        TransferHookInstruction::Execute { amount } => {
            __private::__global::transfer_hook(program_id, accounts, amount)
        }
        _ => Err(ProgramError::InvalidInstructionData.into()),
    }
}
```

---

## Security Checklist

```mermaid
flowchart TB
    subgraph Deployment["🚀 Before Deployment"]
        D1["✅ Run all tests"]
        D2["✅ Audit completed"]
        D3["✅ security_txt! configured"]
        D4["✅ Multi-sig setup"]
    end

    subgraph Operations["⚙️ Operations"]
        O1["✅ Role least-privilege"]
        O2["✅ Quota limits set"]
        O3["✅ Monitor events"]
        O4["✅ Incident response plan"]
    end

    subgraph Monitoring["👁️ Monitoring"]
        M1["✅ Large mint alerts"]
        M2["✅ Authority change alerts"]
        M3["✅ Pause events"]
        M4["✅ Blacklist activity"]
    end

    D1 & D2 & D3 & D4 --> O1 & O2 & O3 & O4
    O1 & O2 & O3 & O4 --> M1 & M2 & M3 & M4
```

## Best Practices

| Category | Recommendation |
|----------|----------------|
| **Authority** | Use multi-sig wallet |
| **Roles** | Grant minimum necessary permissions |
| **Quotas** | Set conservative daily limits |
| **Monitoring** | Alert on all admin operations |
| **Incident Response** | Have pause procedure documented |
| **Key Management** | Use hardware wallets |
| **Audits** | Regular security reviews |

## Next Steps

- [Architecture](./architecture.md) - Full system design
- [Operations](../operations/operations.md) - Deployment guide
- [Compliance](../operations/compliance.md) - Regulatory considerations
