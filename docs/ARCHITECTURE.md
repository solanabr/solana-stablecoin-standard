# Architecture

## Three-Layer Model

### Layer 1: Base SDK
- Token-2022 creation and management
- PDA derivation for all state accounts
- Role-based access control
- TypeScript SDK with full API
- Admin CLI

### Layer 2: Modules
- **Compliance Module**: Blacklist management, seizure, audit logs
- **Privacy Module**: Cloak integration for shielded transactions

### Layer 3: Presets
- **SSS-1**: Basic stablecoin (mint/burn, pause, freeze)
- **SSS-2**: Compliant stablecoin (+ blacklist, seizure, transfer hook)
- **SSS-3**: Private stablecoin (+ Cloak privacy)

## Data Flow

### Mint Flow
```
User -> SDK.mint() -> Program Instruction -> Token-2022 Mint
                                              ↓
                                         Update Config
                                              ↓
                                         Emit Event
```

### Transfer Hook Flow (SSS-2)
```
User Transfer -> Token-2022 Program -> Transfer Hook Program
                                              ↓
                                    Check Blacklist PDAs
                                              ↓
                              Allow ✓  or  Reject ✗
```

### Privacy Flow (SSS-3)
```
Shield: User -> Relay -> Generate UTXO -> Shield Pool Program
Transfer: UTXO Pool (encrypted)
Unshield: Relay Check -> Shield Pool -> User
```

## PDA Derivation

| Account | Seeds | Program |
|---------|-------|---------|
| Config | `["stablecoin", authority, symbol]` | sss-stablecoin |
| Role Registry | `["role_registry", config]` | sss-stablecoin |
| Blacklist Entry | `["blacklist", config, address]` | sss-stablecoin |

## Security Model

1. **Authority**: Master key with full control
2. **Roles**: Minters (with quota), Burners, Pausers, Blacklisters, Seizers
3. **Two-Step Authority Transfer**: Propose → Accept
4. **Pause Capability**: Emergency stop for all operations
5. **Transfer Hook**: SSS-2 compliance enforcement at protocol level

## On-Chain vs Off-Chain Boundaries

### On-Chain (Program)
- Token operations (mint, burn, freeze)
- Role management
- Blacklist state
- Compliance enforcement (transfer hook)

### Off-Chain (SDK/Services)
- Transaction construction
- Event indexing
- Compliance service (sanctions screening)
- Webhook notifications
