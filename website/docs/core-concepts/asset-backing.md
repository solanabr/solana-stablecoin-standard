---
sidebar_position: 2
title: Asset Backing
description: Multi-asset backing support for diverse stablecoin types
---

# Multi-Asset Backing

SSS supports multiple asset backing types, enabling the creation of various stablecoin configurations from traditional fiat-backed to innovative commodity and mixed-asset backed tokens.

## Overview

```mermaid
flowchart TB
    subgraph BackingTypes["🏦 Asset Backing Types"]
        direction TB
        FIAT["💵 Fiat Currency<br/>USD, EUR, BRL, etc."]
        COMMODITY["🥇 Commodities<br/>Gold, Silver, Platinum"]
        CRYPTO["₿ Cryptocurrency<br/>BTC, ETH, SOL"]
        TREASURY["🏛️ Treasury Bonds<br/>Government Securities"]
        MIXED["📊 Mixed Portfolio<br/>Diversified Assets"]
    end

    subgraph Stablecoins["🪙 Stablecoin Examples"]
        USDS["USD Stablecoin"]
        GLDS["Gold-backed Token"]
        BTCS["BTC-backed Stable"]
        BNDS["Bond-backed Token"]
        DIVS["Diversified Stable"]
    end

    FIAT --> USDS
    COMMODITY --> GLDS
    CRYPTO --> BTCS
    TREASURY --> BNDS
    MIXED --> DIVS

    style FIAT fill:#4CAF50,color:#fff
    style COMMODITY fill:#FFD700,color:#000
    style CRYPTO fill:#FF9800,color:#fff
    style TREASURY fill:#2196F3,color:#fff
    style MIXED fill:#9C27B0,color:#fff
```

## BackingType Enum

The `BackingType` enum is defined in the on-chain program:

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BackingType {
    /// Backed by fiat currency reserves (USD, EUR, BRL)
    Fiat,
    
    /// Backed by physical commodities (gold, silver, platinum)
    Commodity,
    
    /// Backed by cryptocurrency collateral (BTC, ETH, SOL)
    Crypto,
    
    /// Backed by government treasury bonds
    TreasuryBond,
    
    /// Backed by a mix of multiple asset types
    Mixed,
}
```

## Backing Types Explained

### 💵 Fiat Currency Backing

Traditional stablecoin model where tokens are backed 1:1 by fiat currency reserves held in bank accounts.

```mermaid
flowchart LR
    subgraph Reserve["Bank Reserve"]
        USD["$1,000,000 USD"]
        EUR["€500,000 EUR"]
        BRL["R$2,000,000 BRL"]
    end

    subgraph Tokens["Issued Tokens"]
        USDT["1,000,000 USDS"]
        EURT["500,000 EURS"]
        BRLT["2,000,000 BRLS"]
    end

    USD <-->|1:1| USDT
    EUR <-->|1:1| EURT
    BRL <-->|1:1| BRLT

    style USD fill:#4CAF50,color:#fff
    style EUR fill:#2196F3,color:#fff
    style BRL fill:#FFD700,color:#000
```

**Use Cases:**
- Traditional stablecoins (USDC, USDT style)
- Regional currency tokens
- Cross-border payment tokens

**Example:**
```typescript
const { mint, config } = await client.initialize({
  name: 'USD Stablecoin',
  symbol: 'USDS',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Swift,
});
```

---

### 🥇 Commodity Backing

Tokens backed by physical commodities stored in secure vaults. Each token represents fractional ownership of the underlying commodity.

```mermaid
flowchart TB
    subgraph Vault["🏦 Secure Vault"]
        GOLD["🥇 Gold<br/>10,000 oz"]
        SILVER["🥈 Silver<br/>500,000 oz"]
        PLATINUM["⚪ Platinum<br/>1,000 oz"]
    end

    subgraph Tokens["🪙 Commodity Tokens"]
        GLDS["GLDS Token<br/>1 token = 0.001 oz gold"]
        SLVS["SLVS Token<br/>1 token = 0.01 oz silver"]
        PLTS["PLTS Token<br/>1 token = 0.0001 oz platinum"]
    end

    subgraph Value["💵 Current Value"]
        GV["$2,000/oz"]
        SV["$25/oz"]
        PV["$1,000/oz"]
    end

    GOLD --> GLDS
    SILVER --> SLVS
    PLATINUM --> PLTS

    GV -.->|price feed| GLDS
    SV -.->|price feed| SLVS
    PV -.->|price feed| PLTS

    style GOLD fill:#FFD700,color:#000
    style SILVER fill:#C0C0C0,color:#000
    style PLATINUM fill:#E5E4E2,color:#000
```

**Supported Commodities:**
| Commodity | Symbol | Standard Unit | Oracle |
|-----------|--------|---------------|--------|
| Gold | XAU | Troy Ounce | Pyth |
| Silver | XAG | Troy Ounce | Pyth |
| Platinum | XPT | Troy Ounce | Pyth |
| Palladium | XPD | Troy Ounce | Pyth |

**Example - Gold-Backed Token:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Digital Gold',
  symbol: 'DGLD',
  decimals: 8,  // More decimals for fractional gold
  preset: Preset.Sss2,
  backingType: BackingType.Commodity,
  bankingRail: BankingRail.None,  // Physical delivery
  uri: 'https://vault.example.com/gold/metadata.json',
});

// Configure oracle for gold price
await client.configureOracle({
  priceFeed: PYTH_GOLD_PRICE_FEED,
  maxStalenessSecs: 300,
  maxDeviationBps: 100,  // 1% max deviation
  targetPrice: 2000_00000000,  // $2000.00 in 8 decimals
});
```

**Reserve Attestation for Commodities:**
```typescript
// Submit monthly reserve attestation
await client.submitAttestation({
  config: configPda,
  reserveAmount: 10_000_00000000n,  // 10,000 oz
  attestationUri: 'https://auditor.example.com/gold-audit-2024-03.pdf',
  auditor: auditorPubkey,
});
```

---

### ₿ Cryptocurrency Backing

Tokens backed by cryptocurrency collateral, similar to DAI's model but with configurable collateralization ratios.

```mermaid
flowchart TB
    subgraph Collateral["🔒 Crypto Collateral"]
        BTC["₿ Bitcoin<br/>100 BTC"]
        ETH["Ξ Ethereum<br/>1,000 ETH"]
        SOL["◎ Solana<br/>50,000 SOL"]
    end

    subgraph Oracle["📊 Price Oracle"]
        BTCP["BTC/USD<br/>$65,000"]
        ETHP["ETH/USD<br/>$3,500"]
        SOLP["SOL/USD<br/>$150"]
    end

    subgraph Tokens["🪙 Backed Stablecoins"]
        STABLE["Crypto-Backed USD<br/>$10,000,000 supply"]
    end

    subgraph Ratio["📈 Collateral Ratio"]
        CR["150% Over-collateralized"]
    end

    BTC --> BTCP
    ETH --> ETHP
    SOL --> SOLP
    BTCP --> STABLE
    ETHP --> STABLE
    SOLP --> STABLE
    CR --> STABLE

    style BTC fill:#F7931A,color:#fff
    style ETH fill:#627EEA,color:#fff
    style SOL fill:#14F195,color:#000
```

**Collateral Configuration:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Crypto-Backed USD',
  symbol: 'CUSD',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Crypto,
  bankingRail: BankingRail.None,
});

// Configure with over-collateralization
await client.configureOracle({
  priceFeed: PYTH_BTC_USD,
  maxStalenessSecs: 60,  // Faster updates for volatile assets
  maxDeviationBps: 200,  // 2% max deviation
  targetPrice: 1_000000,  // $1.00 peg
});
```

---

### 🏛️ Treasury Bond Backing

Tokens backed by government securities, enabling yield-bearing stablecoins.

```mermaid
flowchart LR
    subgraph Treasury["🏛️ Treasury Holdings"]
        TBILL["T-Bills<br/>$50M"]
        TNOTE["T-Notes<br/>$30M"]
        TBOND["T-Bonds<br/>$20M"]
    end

    subgraph Yield["📈 Yield Generation"]
        Y1["4.5% APY"]
        Y2["4.8% APY"]
        Y3["5.0% APY"]
    end

    subgraph Token["🪙 Bond-Backed Token"]
        USDY["USDY<br/>$100M Supply<br/>~4.7% Yield"]
    end

    TBILL --> Y1 --> USDY
    TNOTE --> Y2 --> USDY
    TBOND --> Y3 --> USDY

    style USDY fill:#2196F3,color:#fff
    style Y1 fill:#4CAF50,color:#fff
    style Y2 fill:#4CAF50,color:#fff
    style Y3 fill:#4CAF50,color:#fff
```

**Yield Distribution:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Yield USD',
  symbol: 'USDY',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.TreasuryBond,
  bankingRail: BankingRail.Fedwire,  // US Treasury settlement
});

// Yield is distributed through rebasing or reward mechanism
```

---

### 📊 Mixed Asset Backing

Diversified backing with multiple asset types for reduced risk and enhanced stability.

```mermaid
pie showData
    title Mixed Asset Portfolio
    "Fiat (USD)" : 40
    "Gold" : 25
    "T-Bills" : 20
    "Bitcoin" : 10
    "Ethereum" : 5
```

```mermaid
flowchart TB
    subgraph Portfolio["📊 Diversified Reserve"]
        FIAT["💵 40% Fiat"]
        GOLD["🥇 25% Gold"]
        TBILLS["🏛️ 20% T-Bills"]
        BTC["₿ 10% Bitcoin"]
        ETH["Ξ 5% Ethereum"]
    end

    subgraph Benefits["✨ Benefits"]
        B1["Reduced volatility"]
        B2["Multiple yield sources"]
        B3["Hedge against inflation"]
        B4["Improved liquidity"]
    end

    FIAT --> B4
    GOLD --> B3
    TBILLS --> B2
    BTC --> B1
    ETH --> B1

    style FIAT fill:#4CAF50,color:#fff
    style GOLD fill:#FFD700,color:#000
    style TBILLS fill:#2196F3,color:#fff
    style BTC fill:#F7931A,color:#fff
    style ETH fill:#627EEA,color:#fff
```

**Example:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Diversified Stable',
  symbol: 'DSTB',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Mixed,
  bankingRail: BankingRail.Swift,
  uri: 'https://reserve.example.com/portfolio.json',
});

// Multiple attestations for each asset class
await client.submitAttestation({
  config: configPda,
  reserveAmount: 40_000_000_000000n,  // $40M fiat
  attestationUri: 'ipfs://Qm.../fiat-audit.pdf',
  auditor: fiatAuditor,
});
```

## Backing Type Selection Guide

```mermaid
flowchart TD
    START["What backing type<br/>should I use?"] --> Q1{"Need yield?"}
    
    Q1 -->|Yes| TREASURY["🏛️ TreasuryBond"]
    Q1 -->|No| Q2{"Regulated market?"}
    
    Q2 -->|Yes| FIAT["💵 Fiat"]
    Q2 -->|No| Q3{"Hedge inflation?"}
    
    Q3 -->|Yes| COMMODITY["🥇 Commodity"]
    Q3 -->|No| Q4{"Decentralized?"}
    
    Q4 -->|Yes| CRYPTO["₿ Crypto"]
    Q4 -->|No| MIXED["📊 Mixed"]

    style FIAT fill:#4CAF50,color:#fff
    style COMMODITY fill:#FFD700,color:#000
    style CRYPTO fill:#FF9800,color:#fff
    style TREASURY fill:#2196F3,color:#fff
    style MIXED fill:#9C27B0,color:#fff
```

| Criteria | Fiat | Commodity | Crypto | Treasury | Mixed |
|----------|:----:|:---------:|:------:|:--------:|:-----:|
| **Stability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Yield** | ⭐ | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Decentralization** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Inflation Hedge** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Regulatory Clarity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

## Integration with Oracles

Each backing type can be validated using price oracles:

```mermaid
sequenceDiagram
    participant User
    participant SSS as SSS Protocol
    participant Oracle as Pyth Oracle
    participant Reserve as Reserve Account

    User->>SSS: mint_with_oracle(amount)
    SSS->>Oracle: get_price(asset)
    Oracle-->>SSS: price = $2000/oz
    SSS->>Reserve: validate_backing()
    Reserve-->>SSS: reserve = 10,000 oz
    SSS->>SSS: Calculate: 10000 * 2000 = $20M
    SSS->>SSS: Validate: supply <= $20M
    SSS-->>User: Mint approved
```

## Next Steps

- [Banking Rails](./banking-rails) - Learn about fiat integration
- [Reserve Attestations](../operations/compliance.md#attestations) - Proof of reserves
- [Oracle Configuration](../api-reference/instructions.md#configure_oracle) - Price feed setup
