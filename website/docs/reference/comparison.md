---
sidebar_position: 2
title: Comparison
description: SSS vs other stablecoin implementations
---

# Competitive Comparison

How does SSS compare to existing stablecoin solutions?

## Feature Comparison Matrix

```mermaid
quadrantChart
    title SSS Feature Coverage vs Competitors
    x-axis Low Features --> High Features
    y-axis Closed Source --> Open Source
    quadrant-1 SSS Territory
    quadrant-2 Emerging
    quadrant-3 Legacy
    quadrant-4 Enterprise
    SSS: [0.95, 0.95]
    USDC: [0.7, 0.1]
    USDT: [0.6, 0.05]
    PYUSD: [0.65, 0.1]
    DAI: [0.5, 0.9]
```

## Comprehensive Feature Matrix

| Feature | SSS | USDC | USDT | PYUSD | DAI |
|---------|:---:|:----:|:----:|:-----:|:---:|
| **Open Source** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Self-Custody** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Token-2022** | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| **Confidential Transfers** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Transfer Hooks** | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| **Multi-Asset Backing** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **On-Chain Attestations** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Custom Banking Rails** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **security_txt!** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Two-Step Authority** | ✅ | ❓ | ❓ | ❓ | ✅ |
| **Minter Quotas** | ✅ | ❓ | ❓ | ❓ | ✅ |
| **Audit Trail (granted_by)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Oracle Integration** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Oracle Fallback** | ✅ | ❌ | ❌ | ❌ | ⚠️ |

**Legend:** ✅ Full Support | ⚠️ Partial | ❌ Not Available | ❓ Unknown/Private

## Architecture Comparison

### SSS Architecture

```mermaid
flowchart TB
    subgraph SSS["SSS Architecture"]
        SDK["TypeScript SDK"]
        CLI["CLI + TUI"]
        TOKEN["sss-token Program"]
        HOOK["Transfer Hook"]
        T22["Token-2022"]
        ORACLE["Pyth + Switchboard"]
    end

    SDK --> TOKEN
    CLI --> SDK
    TOKEN --> T22
    TOKEN --> HOOK
    TOKEN --> ORACLE

    style TOKEN fill:#14F195,color:#000
    style HOOK fill:#9945FF,color:#fff
```

### Traditional Stablecoin Architecture

```mermaid
flowchart TB
    subgraph Traditional["Traditional Architecture"]
        ISSUER["Centralized Issuer"]
        CONTRACT["Smart Contract"]
        SPLTOKEN["SPL Token"]
    end

    ISSUER --> CONTRACT --> SPLTOKEN
    
    style ISSUER fill:#f44336,color:#fff
```

## Unique SSS Features

### 1. Multi-Asset Backing

```mermaid
pie title Asset Backing Support
    "Fiat Currency" : 20
    "Gold/Silver" : 20
    "Crypto Collateral" : 20
    "Treasury Bonds" : 20
    "Mixed Portfolio" : 20
```

**Only SSS supports:**
- Gold-backed stablecoins (PAXG-style)
- Treasury bond yield tokens
- Mixed asset portfolios
- On-chain reserve attestations

### 2. Banking Rails Integration

```mermaid
flowchart LR
    subgraph SSS_Rails["SSS Banking Rails"]
        SWIFT["🌍 SWIFT"]
        SEPA["🇪🇺 SEPA"]
        FEDWIRE["🇺🇸 Fedwire"]
        ACH["📋 ACH"]
        WIRE["🔗 Wire"]
    end

    subgraph Others["Other Stablecoins"]
        MANUAL["Manual Process<br/>No Standard"]
    end

    style SWIFT fill:#2196F3,color:#fff
    style SEPA fill:#3F51B5,color:#fff
    style FEDWIRE fill:#4CAF50,color:#fff
```

### 3. Confidential Transfers (SSS-3)

```mermaid
flowchart TB
    subgraph SSS3["SSS-3 Privacy"]
        ZK["Zero-Knowledge Proofs"]
        CT["Encrypted Balances"]
        AUDIT["Auditor Access"]
    end

    subgraph Others2["Other Stablecoins"]
        PUBLIC["100% Public<br/>All Balances Visible"]
    end

    ZK --> CT --> AUDIT
    
    style ZK fill:#9C27B0,color:#fff
    style PUBLIC fill:#f44336,color:#fff
```

### 4. Enterprise Security

| Security Feature | SSS | Others |
|-----------------|:---:|:------:|
| `security_txt!` on-chain | ✅ | ❌ |
| Two-step authority transfer | ✅ | ⚠️ |
| `granted_by` audit field | ✅ | ❌ |
| Epoch-based minter quotas | ✅ | ⚠️ |
| Transfer hook fallback | ✅ | ❌ |

## Use Case Comparison

### Regulated Stablecoin

| Requirement | SSS-2 | USDC |
|-------------|:-----:|:----:|
| Blacklist enforcement | ✅ Automatic via hook | ⚠️ Manual |
| Seizure capability | ✅ Permanent delegate | ⚠️ Admin-only |
| Audit trail | ✅ On-chain | ❌ Off-chain |
| Custom compliance | ✅ Configurable | ❌ Fixed |

### Privacy-Preserving

| Requirement | SSS-3 | All Others |
|-------------|:-----:|:----------:|
| Hidden balances | ✅ | ❌ |
| Hidden transfer amounts | ✅ | ❌ |
| Compliance compatible | ✅ | N/A |
| Auditor access | ✅ | N/A |

### Multi-Asset Backing

| Requirement | SSS | DAI | Others |
|-------------|:---:|:---:|:------:|
| Fiat backing | ✅ | ❌ | ✅ |
| Crypto collateral | ✅ | ✅ | ❌ |
| Gold backing | ✅ | ❌ | ❌ |
| Treasury bonds | ✅ | ❌ | ❌ |
| Mixed portfolio | ✅ | ⚠️ | ❌ |

## Technical Comparison

### Token Standard

| Aspect | SSS | USDC/USDT |
|--------|-----|-----------|
| **Standard** | Token-2022 | SPL Token (legacy) |
| **Extensions** | Full support | Limited |
| **Transfer Hooks** | Native | Not available |
| **Metadata** | On-chain | Off-chain |
| **Confidential** | Supported | Not possible |

### Program Architecture

| Aspect | SSS | Typical Stablecoin |
|--------|-----|-------------------|
| **Programs** | 2 (token + hook) | 1 |
| **Modularity** | High | Low |
| **Upgradability** | Configurable | Fixed |
| **Extensions** | Plugin system | Monolithic |

## Migration Path

### From USDC/USDT

```mermaid
flowchart LR
    subgraph Current["Current State"]
        OLD["Legacy SPL Token"]
    end

    subgraph Migration["Migration"]
        WRAP["Wrap/Unwrap Bridge"]
        CONVERT["Direct Conversion"]
    end

    subgraph Target["SSS"]
        NEW["Token-2022 + Extensions"]
    end

    OLD --> WRAP --> NEW
    OLD --> CONVERT --> NEW

    style NEW fill:#14F195,color:#000
```

### Benefits of Migration

1. **Enhanced Compliance** - Automatic blacklist enforcement
2. **Privacy Option** - Confidential transfers available
3. **Better Auditing** - On-chain audit trails
4. **Modern Standard** - Token-2022 extensions
5. **Custom Logic** - Transfer hooks for business rules

## Conclusion

SSS provides the most comprehensive stablecoin framework available:

```mermaid
flowchart TB
    subgraph Why["Why Choose SSS?"]
        F1["✅ Open Source"]
        F2["✅ Self-Custody"]
        F3["✅ Multi-Asset"]
        F4["✅ Privacy Option"]
        F5["✅ Enterprise Security"]
        F6["✅ Banking Rails"]
        F7["✅ Full Compliance"]
    end

    F1 & F2 & F3 & F4 & F5 & F6 & F7 --> BEST["🏆 Best Choice for<br/>Institutional Stablecoins"]

    style BEST fill:#14F195,color:#000
```

## Next Steps

- [Getting Started](../getting-started/quickstart) - Build your first stablecoin
- [Presets](../presets/sss-1) - Choose the right configuration
- [Architecture](../core-concepts/architecture) - Deep dive into design
