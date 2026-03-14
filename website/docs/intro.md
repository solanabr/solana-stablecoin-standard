---
sidebar_position: 1
slug: /
title: Introduction
description: The definitive framework for building regulated, institutional-grade stablecoins on Solana
---

# Solana Stablecoin Standard

<div className="hero-banner">

**SSS** is the most comprehensive, production-ready SDK for creating regulated stablecoins on Solana using Token-2022.

</div>

## 🎯 What is SSS?

SSS (Solana Stablecoin Standard) provides a complete framework for building **institutional-grade stablecoins** with:

- **Three preset standards** (SSS-1, SSS-2, SSS-3) covering minimal to privacy-preserving configurations
- **Full compliance toolkit** with blacklisting, seizure, and role-based access control
- **Multi-asset backing** support for Fiat, Gold, Silver, Crypto, Treasury Bonds, and Mixed assets
- **Banking rails integration** with SWIFT, SEPA, Fedwire, Wire, and ACH support
- **Enterprise security** with two-step authority transfer, supply caps, and comprehensive audit trails

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend Applications"]
        WEB["🌐 Web Dashboard"]
        CLI["⌨️ CLI Tool"]
        TUI["📊 TUI Dashboard"]
    end

    subgraph SDK["@sss/sdk Layer"]
        CLIENT["SSSClient"]
        CT["CTClient"]
        PDA["PDA Utils"]
    end

    subgraph Programs["On-Chain Programs"]
        TOKEN["sss-token<br/>Core Program"]
        HOOK["sss-transfer-hook<br/>Transfer Logic"]
    end

    subgraph Solana["Solana Runtime"]
        T22["Token-2022<br/>SPL Token"]
    end

    subgraph Oracle["Price Oracle"]
        PYTH["Pyth Network"]
        SWITCH["Switchboard<br/>Fallback"]
    end

    WEB --> CLIENT
    CLI --> CLIENT
    TUI --> CLIENT
    CLIENT --> TOKEN
    CLIENT --> HOOK
    CT --> T22
    TOKEN --> T22
    TOKEN --> PYTH
    TOKEN --> SWITCH
    HOOK --> TOKEN
    T22 --> HOOK
    
    style TOKEN fill:#14F195,color:#000
    style HOOK fill:#9945FF,color:#fff
    style T22 fill:#00D1FF,color:#000
```

## 📋 Preset Comparison

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---------|:-----:|:-----:|:-----:|
| **Mint/Burn** | ✅ | ✅ | ✅ |
| **Freeze/Thaw** | ✅ | ✅ | ✅ |
| **Pause/Unpause** | ✅ | ✅ | ✅ |
| **Supply Caps** | ✅ | ✅ | ✅ |
| **Metadata** | ✅ | ✅ | ✅ |
| **Permanent Delegate** | ✅ | ✅ | ✅ |
| **Transfer Hook** | ❌ | ✅ | ✅ |
| **Blacklist** | ❌ | ✅ | ✅ |
| **Seize** | ❌ | ✅ | ✅ |
| **Confidential Transfer** | ❌ | ❌ | ✅ |

## 🚀 Quick Start

```bash
# Install the SDK
npm install @sss/sdk
```

```typescript
import { SSSClient, Preset, BackingType, BankingRail } from '@sss/sdk';

const client = new SSSClient(connection, authority);

// Create a gold-backed stablecoin with SWIFT banking
const { mint, config } = await client.initialize({
  name: 'Digital Gold Dollar',
  symbol: 'DGLD',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Commodity,  // Gold backing
  bankingRail: BankingRail.Swift,      // SWIFT integration
  supplyCap: 1_000_000_000_000_000n,
});
```

## 🎁 Unique Differentiators

Unlike other implementations, SSS includes exclusive features that set it apart:

### 💰 Multi-Asset Backing Types

```mermaid
flowchart LR
    subgraph BackingTypes["Asset Backing Types"]
        FIAT["💵 Fiat<br/>USD, EUR, BRL"]
        COMMODITY["🥇 Commodity<br/>Gold, Silver, Platinum"]
        CRYPTO["₿ Crypto<br/>BTC, ETH, SOL"]
        TREASURY["🏛️ Treasury Bonds<br/>Government Securities"]
        MIXED["📊 Mixed<br/>Portfolio of Assets"]
    end
    
    STABLECOIN["🪙 SSS Stablecoin"] --> FIAT
    STABLECOIN --> COMMODITY
    STABLECOIN --> CRYPTO
    STABLECOIN --> TREASURY
    STABLECOIN --> MIXED
    
    style FIAT fill:#4CAF50,color:#fff
    style COMMODITY fill:#FFD700,color:#000
    style CRYPTO fill:#FF9800,color:#fff
    style TREASURY fill:#2196F3,color:#fff
    style MIXED fill:#9C27B0,color:#fff
```

| Backing Type | Description | Use Case |
|--------------|-------------|----------|
| **Fiat** | Traditional bank reserves (USD, EUR, BRL) | USDC/USDT-style stablecoins |
| **Commodity** | Gold, silver, platinum reserves | Precious metal-backed tokens (PAXG) |
| **Crypto** | BTC, ETH, SOL collateral | Crypto-collateralized stables (DAI) |
| **TreasuryBond** | Government securities | Yield-bearing stablecoins |
| **Mixed** | Portfolio of multiple assets | Diversified reserve stables |

### 🏦 Banking Rails Integration

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Bank as 🏦 Bank
    participant SSS as 📜 SSS Protocol
    participant Mint as 🪙 Token Mint

    rect rgb(240, 248, 255)
        Note over User,Mint: Mint Request Flow
        User->>Bank: Wire Transfer ($10,000)
        Bank->>SSS: Confirm Deposit
        SSS->>SSS: Create Mint Request PDA
        SSS->>Mint: Mint 10,000 USSD
        Mint-->>User: Tokens Received
    end

    rect rgb(255, 245, 238)
        Note over User,Mint: Redemption Flow
        User->>SSS: Burn 5,000 USSD
        SSS->>SSS: Create Redemption Request
        SSS->>Bank: Wire Instruction
        Bank-->>User: $5,000 Received
    end
```

| Banking Rail | Network | Settlement | Use Case |
|--------------|---------|------------|----------|
| **SWIFT** | Global | 1-5 days | International transfers |
| **SEPA** | Europe | 1-2 days | EU zone transfers |
| **Fedwire** | USA | Same day | US domestic high-value |
| **Wire** | Regional | 1-3 days | Standard bank wire |
| **ACH** | USA | 2-3 days | US batch processing |

### 📋 Reserve Attestations

```mermaid
flowchart TB
    subgraph Attestation["Reserve Attestation System"]
        AUDITOR["🔍 Auditor"]
        ATTEST["📄 Attestation PDA"]
        CONFIG["⚙️ Config"]
        ORACLE["📊 Oracle"]
    end
    
    AUDITOR -->|Submit Proof| ATTEST
    ATTEST -->|Update Reserve| CONFIG
    ORACLE -->|Price Feed| ATTEST
    
    ATTEST -->|"reserve_amount: u64"| VERIFY[/"✅ On-Chain Verification"/]
    ATTEST -->|"attestation_uri: String"| PROOF[/"🔗 Off-Chain Proof"/]
    
    style ATTEST fill:#14F195,color:#000
    style VERIFY fill:#4CAF50,color:#fff
```

### 🔐 Enterprise Security

```mermaid
flowchart LR
    subgraph Security["Security Features"]
        SEC_TXT["🛡️ security_txt!<br/>On-chain disclosure"]
        TWO_STEP["🔑 Two-Step Authority<br/>Nominate → Accept"]
        AUDIT["📝 Audit Trail<br/>granted_by + granted_at"]
        QUOTA["📊 Minter Quotas<br/>Epoch-based limits"]
    end
    
    subgraph Impact["Security Impact"]
        CVE["Bug Bounty Discovery"]
        PREVENT["Prevent Takeover"]
        COMPLIANCE["Regulatory Compliance"]
        RISK["Risk Mitigation"]
    end
    
    SEC_TXT --> CVE
    TWO_STEP --> PREVENT
    AUDIT --> COMPLIANCE
    QUOTA --> RISK
    
    style SEC_TXT fill:#f44336,color:#fff
    style TWO_STEP fill:#2196F3,color:#fff
    style AUDIT fill:#9C27B0,color:#fff
    style QUOTA fill:#FF9800,color:#fff
```

## 🔄 Token Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Uninitialized
    
    Uninitialized --> Active: initialize()
    
    state Active {
        [*] --> Ready
        Ready --> Minting: mint_tokens()
        Minting --> Ready: ✅ Success
        Ready --> Burning: burn_tokens()
        Burning --> Ready: ✅ Success
    }
    
    Active --> Paused: pause()
    Paused --> Active: unpause()
    
    Active --> [*]: close_mint() [supply=0]
```

## 📊 Role-Based Access Control

```mermaid
flowchart TB
    AUTH["🔑 Authority<br/>Full Admin Control"]
    
    AUTH --> MINTER["💰 Minter<br/>Supply Management"]
    AUTH --> BURNER["🔥 Burner<br/>Token Destruction"]
    AUTH --> PAUSER["⏸️ Pauser<br/>Emergency Control"]
    AUTH --> FREEZER["❄️ Freezer<br/>Account Control"]
    AUTH --> BLACKLISTER["🚫 Blacklister<br/>Compliance"]
    AUTH --> SEIZER["⚡ Seizer<br/>Asset Recovery"]
    
    MINTER --> USER["👤 User"]
    BURNER --> USER
    PAUSER --> USER
    FREEZER --> USER
    BLACKLISTER --> USER
    SEIZER --> USER
    
    style AUTH fill:#FF5722,color:#fff
    style MINTER fill:#4CAF50,color:#fff
    style BURNER fill:#f44336,color:#fff
    style PAUSER fill:#FF9800,color:#fff
    style FREEZER fill:#2196F3,color:#fff
    style BLACKLISTER fill:#9C27B0,color:#fff
    style SEIZER fill:#E91E63,color:#fff
```

## 🏆 Why Choose SSS?

| Feature | SSS | USDC | USDT | PYUSD |
|---------|:---:|:----:|:----:|:-----:|
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Self-Custody | ✅ | ❌ | ❌ | ❌ |
| Multi-Asset Backing | ✅ | ❌ | ❌ | ❌ |
| Confidential Transfers | ✅ | ❌ | ❌ | ❌ |
| On-Chain Attestations | ✅ | ❌ | ❌ | ❌ |
| Custom Banking Rails | ✅ | ❌ | ❌ | ❌ |
| Transfer Hooks | ✅ | ⚠️ | ⚠️ | ⚠️ |
| security_txt! | ✅ | ❌ | ❌ | ❌ |

## 📚 Documentation Structure

### Getting Started
- [Quick Start](./getting-started/quickstart) - Create your first stablecoin in 5 minutes
- [Installation](./getting-started/installation) - Full installation guide

### Core Concepts
- [Architecture](./core-concepts/architecture) - System design deep dive
- [Asset Backing](./core-concepts/asset-backing) - Multi-asset support
- [Banking Rails](./core-concepts/banking-rails) - Fiat integration
- [Security](./core-concepts/security) - Enterprise security features

### Standards
- [SSS-1: Basic](./presets/sss-1) - Minimal compliance
- [SSS-2: Compliant](./presets/sss-2) - Full compliance with hooks
- [SSS-3: Private](./presets/sss-3) - Confidential transfers

### Reference
- [SDK Guide](./api-reference/sdk-guide) - TypeScript SDK usage
- [Instructions](./api-reference/instructions) - All program instructions
- [Visual Diagrams](./reference/diagrams) - Mermaid diagrams library

## 🔗 Quick Links

- 📦 [GitHub Repository](https://github.com/solanabr/solana-stablecoin-standard)
- 📚 [npm Package](https://www.npmjs.com/package/@sss/sdk)
- 🔍 [Devnet Explorer](https://explorer.solana.com/?cluster=devnet)
- 💬 [Discord Community](https://discord.gg/solana)

---

:::tip Ready to Build?
Jump to [Quick Start](./getting-started/quickstart) to create your first stablecoin in 5 minutes!
:::
