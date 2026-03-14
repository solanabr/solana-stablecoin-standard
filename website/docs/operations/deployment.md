---
sidebar_position: 1
title: Deployment
description: Complete deployment guide for SSS stablecoins
---

# Deployment Guide

This guide covers deploying SSS programs and creating production stablecoins.

## Deployment Overview

```mermaid
flowchart TB
    subgraph Phase1["📦 Phase 1: Build"]
        B1[Clone Repo]
        B2[Install Deps]
        B3[Build Programs]
        B4[Run Tests]
    end
    
    subgraph Phase2["🚀 Phase 2: Deploy"]
        D1[Configure Network]
        D2[Fund Wallet]
        D3[Deploy sss-token]
        D4[Deploy transfer-hook]
    end
    
    subgraph Phase3["⚙️ Phase 3: Initialize"]
        I1[Create Stablecoin]
        I2[Configure Roles]
        I3[Set Up Banking]
        I4[Enable Oracle]
    end
    
    subgraph Phase4["✅ Phase 4: Verify"]
        V1[Verify Programs]
        V2[Test Mint/Burn]
        V3[Test Compliance]
        V4[Go Live]
    end
    
    Phase1 --> Phase2 --> Phase3 --> Phase4
    
    style Phase1 fill:#3498db,stroke:#fff
    style Phase2 fill:#9b59b6,stroke:#fff
    style Phase3 fill:#f39c12,stroke:#fff
    style Phase4 fill:#27ae60,stroke:#fff
```

## Prerequisites

```mermaid
flowchart LR
    subgraph Requirements["Requirements"]
        RUST["Rust 1.75+"]
        ANCHOR["Anchor 0.29+"]
        SOLANA["Solana CLI 1.18+"]
        NODE["Node.js 18+"]
    end
```

- **Rust**: 1.75 or higher
- **Anchor**: 0.29.0 or higher
- **Solana CLI**: 1.18.0 or higher
- **Node.js**: 18.0 or higher

## Program Deployment

### 1. Build Programs

```bash
# Clone repository
git clone https://github.com/solanabr/solana-stablecoin-standard
cd solana-stablecoin-standard

# Install dependencies
npm install

# Build Anchor programs
anchor build
```

### 2. Configure Network

```bash
# For devnet
solana config set --url devnet

# For mainnet
solana config set --url mainnet-beta

# Check configuration
solana config get
```

### 3. Deploy Programs

```bash
# Deploy sss-token program
anchor deploy --program-name sss-token

# Deploy sss-transfer-hook program
anchor deploy --program-name sss-transfer-hook
```

:::caution Mainnet Deployment
Mainnet deployment requires significant SOL for rent (~4-5 SOL per program). Ensure your wallet is funded.
:::

### 4. Verify Deployment

```bash
# Check program is deployed
solana program show <PROGRAM_ID>

# Verify program data
anchor verify <PROGRAM_ID>
```

## Stablecoin Initialization

### Using SDK

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { SSSClient, Preset, BackingType, BankingRail } from '@sss/sdk';

// Connect to network
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Load authority keypair
const authority = Keypair.fromSecretKey(/* your secret key */);

// Create client
const client = new SSSClient(connection, authority.publicKey);

// Initialize stablecoin
const { mint, configPda, signature } = await client.initialize({
  name: 'USD Stablecoin',
  symbol: 'USDS',
  decimals: 6,
  preset: Preset.Sss2,
  supplyCap: 1_000_000_000_000_000n, // 1 billion
  backingType: BackingType.Fiat,
  bankingRail: BankingRail.Swift,
  uri: 'https://example.com/metadata.json',
  hookProgramId: TRANSFER_HOOK_PROGRAM_ID,
});

console.log('Stablecoin deployed!');
console.log('Mint:', mint.toBase58());
console.log('Config:', configPda.toBase58());
```

### Using CLI

```bash
# Initialize with CLI
sss init \
  --name "USD Stablecoin" \
  --symbol "USDS" \
  --decimals 6 \
  --preset sss2 \
  --supply-cap 1000000000 \
  --backing-type fiat \
  --banking-rail swift \
  --uri "https://example.com/metadata.json"
```

## Deployment Checklist

```mermaid
flowchart TB
    subgraph PreDeploy["Pre-Deployment"]
        P1["✅ Audit completed"]
        P2["✅ Test coverage >90%"]
        P3["✅ security_txt configured"]
        P4["✅ Multi-sig wallet ready"]
    end

    subgraph Deploy["Deployment"]
        D1["✅ Deploy programs"]
        D2["✅ Verify on-chain"]
        D3["✅ Initialize stablecoin"]
        D4["✅ Configure roles"]
    end

    subgraph PostDeploy["Post-Deployment"]
        PD1["✅ Set up monitoring"]
        PD2["✅ Document program IDs"]
        PD3["✅ Test all operations"]
        PD4["✅ Announce deployment"]
    end

    P1 & P2 & P3 & P4 --> D1
    D1 --> D2 --> D3 --> D4
    D4 --> PD1 & PD2 & PD3 & PD4
```

## Security Considerations

### Multi-Signature Setup

For production, use a multi-sig wallet as the authority:

```typescript
// Use Squads multi-sig as authority
const { mint, configPda } = await client.initialize({
  // ... config
  authority: squadsMultisigPda, // Multi-sig authority
});
```

### Role Assignment

```mermaid
flowchart TB
    subgraph BestPractice["Role Best Practices"]
        A["Authority<br/>Multi-sig only"]
        M["Minters<br/>Separate keys per operator"]
        C["Compliance<br/>Dedicated compliance team"]
        P["Pausers<br/>Emergency response team"]
    end
```

Assign minimal permissions:

```typescript
// Grant minter role with quota
await client.updateRoles({
  target: minterPubkey,
  role: Role.Minter,
  active: true,
});

await client.updateMinterConfig({
  minter: minterPubkey,
  quota: 100_000_000000n, // Conservative daily limit
});
```

## Environment Configuration

### Development

```env
# .env.development
SOLANA_RPC_URL=https://api.devnet.solana.com
SSS_TOKEN_PROGRAM_ID=<devnet-program-id>
SSS_HOOK_PROGRAM_ID=<devnet-hook-id>
```

### Production

```env
# .env.production
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SSS_TOKEN_PROGRAM_ID=<mainnet-program-id>
SSS_HOOK_PROGRAM_ID=<mainnet-hook-id>
```

## Monitoring Setup

### Event Logging

```typescript
// Subscribe to program events
const subscriptionId = connection.onProgramAccountChange(
  SSS_PROGRAM_ID,
  (accountInfo, context) => {
    // Handle account changes
    console.log('Account updated:', accountInfo);
  },
  'confirmed'
);
```

### Alerting

Set up alerts for:
- Large mint/burn operations
- Authority changes
- Pause events
- Blacklist additions
- Quota approaching limits

## Devnet vs Mainnet

| Aspect | Devnet | Mainnet |
|--------|--------|---------|
| **SOL Cost** | Free (airdrop) | Real SOL |
| **Program Deploy** | ~2 SOL | ~4-5 SOL |
| **Persistence** | May reset | Permanent |
| **Oracles** | Test feeds | Production feeds |
| **Use Case** | Testing | Production |

## Upgrade Path

SSS programs can be upgraded if deployed as upgradeable:

```bash
# Deploy as upgradeable (default)
anchor deploy --program-name sss-token

# Upgrade existing program
anchor upgrade target/deploy/sss_token.so --program-id <PROGRAM_ID>
```

:::warning Authority Control
Only the upgrade authority can upgrade programs. Consider transferring upgrade authority to a DAO or multi-sig for production.
:::

## Next Steps

- [Operations](./operations.md) - Day-to-day operations
- [Compliance](./compliance.md) - Regulatory setup
- [SDK Guide](../api-reference/sdk-guide.md) - Full SDK documentation

