# SSS Token Architecture

## Overview

Solana Stablecoin Standards (SSS) is a modular framework for creating compliant stablecoins on Solana. It consists of three progressive standards that build upon each other.

```mermaid
graph TB
    subgraph "SSS Framework"
        SSS1[SSS-1: Basic RBAC]
        SSS2[SSS-2: Transfer Hook]
        SSS3[SSS-3: Governance]
    end
    
    subgraph "Features"
        F1[Mint/Burn/Freeze]
        F2[Role-Based Access]
        F3[Transfer Fees]
        F4[Blacklist/Whitelist]
        F5[Seizure]
    end
    
    SSS1 --> F1
    SSS1 --> F2
    SSS1 --> SSS2
    SSS2 --> F3
    SSS2 --> F4
    SSS2 --> F5
    SSS2 --> SSS3
```

## System Components

### 1. On-Chain Programs

#### SSS-1: RBAC Stablecoin
- **Purpose**: Basic stablecoin with role-based access control
- **Features**: Mint, burn, freeze, role management
- **Accounts**: Mint, Token accounts, Role assignments

#### SSS-2: Transfer Hook
- **Purpose**: Advanced compliance with transfer hooks
- **Features**: Fees, blacklist, whitelist, permanent delegate, seizure
- **Program ID**: `FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD` (Devnet)
- **PDAs**:
  - Config: `["config", authority]`
  - Whitelist: `["whitelist", authority, address]`
  - Blacklist: `["blacklist", authority, address]`

### 2. TypeScript SDK

```mermaid
graph LR
    subgraph "SDK Layer"
        A[SolanaStablecoin] --> B[SSS1Stablecoin]
        A --> C[SSS2Hook]
        C --> D[ComplianceModule]
    end
    
    subgraph "Blockchain"
        E[SSS-1 Program]
        F[SSS-2 Program]
    end
    
    B --> E
    C --> F
    D --> F
```

**Core Classes**:
- `SolanaStablecoin`: Main entry point, factory pattern
- `SSS1Stablecoin`: RBAC operations
- `SSS2Hook`: Transfer hook compliance

### 3. Backend Services

```mermaid
graph TB
    subgraph "Client"
        Web[Web App]
        CLI[CLI Tool]
    end
    
    subgraph "Backend"
        API[API Service :3000]
        IDX[Indexer]
        COMP[Compliance :3001]
    end
    
    subgraph "Data"
        PG[(PostgreSQL)]
        RD[(Redis)]
    end
    
    subgraph "Blockchain"
        SOL[Solana]
    end
    
    Web --> API
    CLI --> API
    API --> SOL
    SOL --> IDX
    IDX --> PG
    IDX --> RD
    COMP --> PG
    COMP --> RD
    API --> RD
```

#### API Service (Port 3000)
- **Purpose**: Mint/burn operations with rate limiting
- **Stack**: Express.js, Solana web3
- **Endpoints**:
  - `POST /api/mint` - Queue mint transaction
  - `POST /api/burn` - Queue burn transaction
  - `GET /api/mint/queue` - View pending operations

#### Indexer Service
- **Purpose**: Event listener and database sync
- **Syncs**: Transfers, fee updates, blacklist/whitelist changes
- **Tables**: `transfers`, `fee_updates`, `blacklist_events`, `whitelist_events`

#### Compliance Service (Port 3001)
- **Purpose**: Pre-transaction compliance checks
- **Endpoints**:
  - `POST /check/blacklist` - Check blacklist status
  - `POST /check/whitelist` - Check whitelist status
  - `POST /check/transfer` - Full compliance check
  - `POST /check/batch` - Batch compliance check

### 4. Admin CLI

```mermaid
graph LR
    CLI[sss-token CLI] --> Config[Config File]
    CLI --> State[State File]
    CLI --> Solana[Solana RPC]
    
    subgraph "Commands"
        Init[init]
        Mint[mint]
        Burn[burn]
        Freeze[freeze]
        Pause[pause]
        BL[blacklist add/remove]
        Seize[seize]
    end
    
    CLI --> Init
    CLI --> Mint
    CLI --> Burn
    CLI --> Freeze
    CLI --> Pause
    CLI --> BL
    CLI --> Seize
```

## Data Flow

### Transfer Flow (SSS-2)

```mermaid
sequenceDiagram
    participant User
    participant Token as Token-2022
    participant Hook as SSS-2 Hook
    participant Compliance as Compliance Service
    participant DB as PostgreSQL
    
    User->>Token: transfer()
    Token->>Hook: execute_transfer_hook
    Hook->>Compliance: Check blacklist
    Compliance->>DB: SELECT blacklist
    DB-->>Compliance: Result
    Compliance-->>Hook: Cleared
    Hook->>Hook: Calculate fee
    Hook->>Hook: Check whitelist
    Hook->>Token: Continue transfer
    Token-->>User: Success
    Hook->>DB: Log transfer event
```

### Mint Flow

```mermaid
sequenceDiagram
    participant CLI as Admin CLI
    participant API as API Service
    participant Redis as Redis Queue
    participant Worker as Worker Process
    participant Solana as Solana
    participant PG as PostgreSQL
    
    CLI->>API: POST /api/mint
    API->>API: Rate limit check
    API->>Redis: Queue mint job
    API-->>CLI: Job ID
    Worker->>Redis: Poll queue
    Redis-->>Worker: Mint job
    Worker->>Solana: Execute mint
    Solana-->>Worker: Signature
    Worker->>PG: Record mint
```

## Security Model

### Role Hierarchy

```mermaid
graph TB
    Admin[Admin Authority]
    MintAuth[Mint Authority]
    FreezeAuth[Freeze Authority]
    Compliance[Compliance Service]
    
    Admin --> MintAuth
    Admin --> FreezeAuth
    Admin --> Compliance
    
    subgraph "Permissions"
        P1[Update Fee Config]
        P2[Add/Remove Blacklist]
        P3[Pause/Unpause]
        P4[Set Permanent Delegate]
    end
    
    Admin --> P1
    Admin --> P2
    Admin --> P3
    Admin --> P4
```

### Compliance Checks

1. **Blacklist**: Source/destination must not be blacklisted
2. **Whitelist**: Whitelisted addresses bypass fees
3. **Permanent Delegate**: Bypasses all restrictions
4. **Pause**: Emergency stop all transfers
5. **Fee Limits**: Max 10% fee cap

## Deployment Architecture

### Devnet

```
┌─────────────────────────────────────┐
│           Devnet Cluster            │
│  ┌───────────────────────────────┐  │
│  │  SSS-2 Program                │  │
│  │  FSkkSmrThcLp...              │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              │
              │ RPC
              ▼
┌─────────────────────────────────────┐
│         Backend Services            │
│  ┌─────┐ ┌─────┐ ┌─────────────┐  │
│  │ API │ │ IDX │ │ Compliance  │  │
│  │ :3000  │ │     │ │     :3001   │  │
│  └─────┘ └─────┘ └─────────────┘  │
│  ┌─────┐ ┌─────────────────────┐ │
│  │Redis│ │     PostgreSQL       │ │
│  └─────┘ └─────────────────────┘ │
└─────────────────────────────────────┘
```

### Mainnet (Future)

- Multi-sig authority
- Timelock for critical operations
- Monitoring and alerting

## Technology Stack

| Layer | Technology |
|-------|------------|
| Blockchain | Solana, Token-2022 |
| Program | Rust, Anchor 0.30.1 |
| SDK | TypeScript, @coral-xyz/anchor |
| CLI | Node.js, Commander.js |
| API | Express.js, Solana Web3 |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Container | Docker, Docker Compose |

## Scaling Considerations

### Current (Devnet)
- Single authority
- SQLite/file-based state (CLI)
- In-memory rate limiting

### Future (Mainnet)
- Multi-sig governance
- Distributed database
- Redis Cluster
- Horizontal scaling with load balancers

## References

- [SSS-1 Specification](./SSS-1.md)
- [SSS-2 Specification](./SSS-2.md)
- [SDK Documentation](./SDK.md)
- [Operations Guide](./OPERATIONS.md)
- [Compliance Guide](./COMPLIANCE.md)
- [API Reference](./API.md)
