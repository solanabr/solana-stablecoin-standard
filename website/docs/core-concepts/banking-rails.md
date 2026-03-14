---
sidebar_position: 3
title: Banking Rails
description: Fiat integration with SWIFT, SEPA, Fedwire, Wire, and ACH banking networks
---

# Banking Rails Integration

SSS provides comprehensive banking rails integration for seamless fiat on/off ramps, supporting major global payment networks.

## Overview

```mermaid
flowchart TB
    subgraph Rails["🏦 Banking Rail Options"]
        SWIFT["🌍 SWIFT<br/>Global"]
        SEPA["🇪🇺 SEPA<br/>Europe"]
        FEDWIRE["🇺🇸 Fedwire<br/>USA High-Value"]
        WIRE["🔗 Wire<br/>Regional"]
        ACH["📋 ACH<br/>USA Batch"]
        NONE["❌ None<br/>Crypto Only"]
    end

    subgraph Flow["Token Flow"]
        DEPOSIT["💵 Fiat Deposit"]
        MINT["🪙 Token Mint"]
        BURN["🔥 Token Burn"]
        WITHDRAW["💸 Fiat Withdrawal"]
    end

    DEPOSIT --> SWIFT & SEPA & FEDWIRE & WIRE & ACH
    SWIFT & SEPA & FEDWIRE & WIRE & ACH --> MINT
    BURN --> SWIFT & SEPA & FEDWIRE & WIRE & ACH
    SWIFT & SEPA & FEDWIRE & WIRE & ACH --> WITHDRAW

    style SWIFT fill:#2196F3,color:#fff
    style SEPA fill:#3F51B5,color:#fff
    style FEDWIRE fill:#4CAF50,color:#fff
    style WIRE fill:#FF9800,color:#fff
    style ACH fill:#9C27B0,color:#fff
```

## BankingRail Enum

The `BankingRail` enum is defined in the on-chain program:

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum BankingRail {
    /// No banking integration (crypto-only)
    None,
    
    /// SWIFT international wire transfers
    Swift,
    
    /// Single Euro Payments Area (EU transfers)
    Sepa,
    
    /// Federal Reserve Wire Network (US high-value)
    Fedwire,
    
    /// Standard bank wire transfer
    Wire,
    
    /// Automated Clearing House (US batch)
    Ach,
}
```

## Banking Rails Comparison

| Rail | Network | Settlement | Fees | Min Amount | Max Amount |
|------|---------|------------|------|------------|------------|
| **SWIFT** | Global | 1-5 days | $15-50 | $100 | Unlimited |
| **SEPA** | EU/EEA | 1-2 days | €0-1 | €0.01 | €999,999 |
| **Fedwire** | USA | Same day | $25-30 | $1,000 | Unlimited |
| **Wire** | Regional | 1-3 days | $10-35 | $100 | Varies |
| **ACH** | USA | 2-3 days | $0-1 | $0.01 | $100,000 |

## Mint Request Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Bank as 🏦 Bank
    participant Backend as 🖥️ Backend
    participant SSS as 📜 SSS Protocol
    participant Mint as 🪙 Token Mint

    Note over User,Mint: Step 1: Initiate Deposit
    User->>Backend: Request mint (amount, rail)
    Backend->>User: Wire instructions + Reference ID
    
    Note over User,Mint: Step 2: Bank Transfer
    User->>Bank: Wire transfer $10,000
    Bank->>Bank: Process payment
    Bank-->>Backend: Webhook: Payment received
    
    Note over User,Mint: Step 3: Create Mint Request
    Backend->>SSS: create_mint_request()
    SSS->>SSS: Create MintRequest PDA
    Note right of SSS: Stores: depositor, amount,<br/>fiat_amount, reference_id
    SSS-->>Backend: MintRequest created
    
    Note over User,Mint: Step 4: Confirm and Mint
    Backend->>SSS: confirm_and_mint()
    SSS->>SSS: Validate request
    SSS->>Mint: Mint tokens to recipient
    Mint-->>User: 10,000 USSD received
    
    Note over User,Mint: Complete ✅
```

## Redemption Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant SSS as 📜 SSS Protocol
    participant Backend as 🖥️ Backend
    participant Bank as 🏦 Bank
    participant Recipient as 💰 Bank Account

    Note over User,Recipient: Step 1: Request Redemption
    User->>SSS: create_redemption()
    Note right of User: Includes IBAN/Account details
    SSS->>SSS: Burn tokens
    SSS->>SSS: Create Redemption PDA
    SSS-->>Backend: RedemptionCreated event
    
    Note over User,Recipient: Step 2: Process Wire
    Backend->>Backend: Validate redemption
    Backend->>Bank: Initiate wire transfer
    Bank->>Bank: Process outgoing wire
    
    Note over User,Recipient: Step 3: Complete Redemption
    Bank-->>Backend: Wire confirmed
    Backend->>SSS: complete_redemption()
    SSS->>SSS: Update Redemption status
    Bank-->>Recipient: $10,000 received
    
    Note over User,Recipient: Complete ✅
```

## 🌍 SWIFT Integration

SWIFT (Society for Worldwide Interbank Financial Telecommunication) enables global transfers.

```mermaid
flowchart LR
    subgraph SWIFT_Network["SWIFT Network"]
        SENDER["🏦 Sender Bank"]
        SWIFT["📨 SWIFT Messages"]
        CORRESPONDENT["🏛️ Correspondent Bank"]
        RECEIVER["🏦 Receiver Bank"]
    end

    SENDER -->|MT103| SWIFT
    SWIFT -->|MT103| CORRESPONDENT
    CORRESPONDENT -->|MT103| RECEIVER

    style SWIFT fill:#00629B,color:#fff
```

**Configuration:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Global USD',
  symbol: 'GUSD',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Swift,
});

// Create mint request with SWIFT details
await client.createMintRequest({
  depositor: userPubkey,
  recipient: userTokenAccount,
  amount: 10_000_000000n,
  fiatAmount: 10000_00n,  // $10,000.00 in cents
  fiatCurrency: FiatCurrency.Usd,
  referenceId: 'SWIFT-REF-2024-001',
  bankReference: 'MT103-20240315-ABCDUS33',
});
```

**Wire Instructions:**
```json
{
  "beneficiary": "SSS Treasury LLC",
  "accountNumber": "1234567890",
  "swiftCode": "SSSBUS33XXX",
  "bankName": "SSS Partner Bank",
  "bankAddress": "123 Finance Street, New York, NY 10001",
  "reference": "SSS-MINT-{userId}-{timestamp}"
}
```

---

## 🇪🇺 SEPA Integration

SEPA (Single Euro Payments Area) enables fast, low-cost EUR transfers across Europe.

```mermaid
flowchart TB
    subgraph SEPA_Zone["🇪🇺 SEPA Zone"]
        direction LR
        EU["EU Countries"]
        EEA["EEA Countries"]
        SPECIAL["CH, UK, MC, etc."]
    end

    subgraph Transfer["SEPA Transfer Types"]
        SCT["SCT<br/>Credit Transfer"]
        SDD["SDD<br/>Direct Debit"]
        INST["SCT Inst<br/>Instant (10 sec)"]
    end

    EU --> SCT & SDD & INST
    EEA --> SCT & SDD & INST
    SPECIAL --> SCT & INST

    style SCT fill:#003399,color:#fff
    style INST fill:#4CAF50,color:#fff
```

**Configuration:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Euro Stablecoin',
  symbol: 'EURS',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Sepa,
});

// Create redemption with IBAN
await client.createRedemption({
  amount: 5_000_000000n,
  fiatCurrency: FiatCurrency.Eur,
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
  beneficiaryName: 'John Doe',
});
```

---

## 🇺🇸 Fedwire Integration

Fedwire is the Federal Reserve's real-time gross settlement system for high-value USD transfers.

```mermaid
flowchart LR
    subgraph Fedwire["Fedwire System"]
        FRB["🏛️ Federal Reserve"]
        CHIPS["CHIPS<br/>Clearing House"]
    end

    SENDER["🏦 Sender Bank<br/>(Fed Member)"] --> FRB
    FRB --> RECEIVER["🏦 Receiver Bank<br/>(Fed Member)"]
    
    FRB <-->|Settlement| CHIPS

    style FRB fill:#4CAF50,color:#fff
```

**Use Cases:**
- High-value institutional transfers ($1M+)
- Same-day settlement requirements
- Treasury operations
- Corporate payroll

**Configuration:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Institutional USD',
  symbol: 'IUSD',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.TreasuryBond,
  bankingRail: BankingRail.Fedwire,
});
```

---

## 📋 ACH Integration

ACH (Automated Clearing House) handles batch processing for lower-value, high-volume transfers.

```mermaid
flowchart TB
    subgraph ACH_Network["ACH Network"]
        ODFI["🏦 ODFI<br/>Originating Bank"]
        ACH_OP["⚙️ ACH Operator<br/>(Fed/EPN)"]
        RDFI["🏦 RDFI<br/>Receiving Bank"]
    end

    subgraph Batch["Batch Processing"]
        B1["📋 Batch 1<br/>Morning"]
        B2["📋 Batch 2<br/>Afternoon"]
        B3["📋 Batch 3<br/>Evening"]
    end

    ODFI --> ACH_OP
    ACH_OP --> RDFI
    B1 & B2 & B3 --> ODFI

    style ACH_OP fill:#9C27B0,color:#fff
```

**Configuration:**
```typescript
const { mint, config } = await client.initialize({
  name: 'Retail USD',
  symbol: 'RUSD',
  decimals: 6,
  preset: Preset.Sss2,
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Ach,
});

// ACH redemption
await client.createRedemption({
  amount: 500_000000n,
  fiatCurrency: FiatCurrency.Usd,
  routingNumber: '021000021',
  accountNumber: '1234567890',
  accountType: AccountType.Checking,
  beneficiaryName: 'Jane Smith',
});
```

---

## MintRequest PDA Structure

```mermaid
classDiagram
    class MintRequest {
        +Pubkey stablecoin
        +Pubkey depositor
        +Pubkey recipient
        +u64 token_amount
        +u64 fiat_amount
        +FiatCurrency fiat_currency
        +BankingRail banking_rail
        +String reference_id
        +String bank_reference
        +MintRequestStatus status
        +i64 created_at
        +i64 confirmed_at
        +Pubkey confirmed_by
        +u8 bump
    }

    class MintRequestStatus {
        <<enumeration>>
        Pending
        Confirmed
        Minted
        Cancelled
        Expired
    }

    MintRequest --> MintRequestStatus
```

**PDA Seeds:**
```rust
seeds = [
    b"mint_request",
    config.key().as_ref(),
    reference_id.as_bytes(),
]
```

## RedemptionRequest PDA Structure

```mermaid
classDiagram
    class RedemptionRequest {
        +Pubkey stablecoin
        +Pubkey redeemer
        +u64 token_amount
        +u64 fiat_amount
        +FiatCurrency fiat_currency
        +BankingRail banking_rail
        +String bank_account
        +String bank_routing
        +String beneficiary_name
        +RedemptionStatus status
        +i64 created_at
        +i64 completed_at
        +String wire_reference
        +u8 bump
    }

    class RedemptionStatus {
        <<enumeration>>
        Pending
        Processing
        Completed
        Cancelled
        Failed
    }

    RedemptionRequest --> RedemptionStatus
```

## Banking Rail Selection Guide

```mermaid
flowchart TD
    START["Which banking rail<br/>should I use?"] --> Q1{"Region?"}
    
    Q1 -->|Global| SWIFT["🌍 SWIFT"]
    Q1 -->|Europe| SEPA["🇪🇺 SEPA"]
    Q1 -->|USA| Q2{"Amount?"}
    
    Q2 -->|">$100K"| FEDWIRE["🇺🇸 Fedwire"]
    Q2 -->|"<$100K"| Q3{"Speed?"}
    
    Q3 -->|Same day| WIRE["🔗 Wire"]
    Q3 -->|2-3 days OK| ACH["📋 ACH"]

    style SWIFT fill:#2196F3,color:#fff
    style SEPA fill:#3F51B5,color:#fff
    style FEDWIRE fill:#4CAF50,color:#fff
    style WIRE fill:#FF9800,color:#fff
    style ACH fill:#9C27B0,color:#fff
```

## Compliance Considerations

```mermaid
flowchart TB
    subgraph Compliance["🔒 Banking Compliance"]
        KYC["KYC/AML<br/>Know Your Customer"]
        SANCTIONS["Sanctions Screening<br/>OFAC/EU Lists"]
        LIMITS["Transaction Limits<br/>Daily/Monthly"]
        REPORTING["Reporting<br/>CTR/SAR"]
    end

    subgraph Integration["Integration Points"]
        API["Banking API"]
        WEBHOOK["Webhooks"]
        BATCH["Batch Files"]
    end

    KYC --> API
    SANCTIONS --> API
    LIMITS --> WEBHOOK
    REPORTING --> BATCH

    style KYC fill:#f44336,color:#fff
    style SANCTIONS fill:#FF9800,color:#fff
```

## Next Steps

- [Asset Backing](./asset-backing) - Configure backing types
- [Reserve Attestations](../operations/compliance.md#attestations) - Proof of reserves
- [SDK Guide](../api-reference/sdk-guide) - Full SDK documentation
