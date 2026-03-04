# Architecture

## Overview

The Solana Stablecoin Standard is built around a single configurable Anchor program (`sss-token`) that manages Token-2022 mints with different feature sets based on the selected preset. A separate transfer hook program (`sss-transfer-hook`) handles compliance checks for SSS-2 tokens.

## On-Chain Components

### sss-token Program

The core program. Every SSS token has three on-chain PDAs:

1. **TokenConfig** — `seeds: [b"sss_config", mint.key()]`
   - Stores preset, supply cap, pause state, deployer, transfer hook reference
   - Acts as mint authority, freeze authority, and (SSS-2) permanent delegate
   - One per mint

2. **RoleAccount** — `seeds: [b"sss_role", config.key(), authority.key()]`
   - Per-authority bitmask of roles
   - Roles: ADMIN (1), MINTER (2), BURNER (4), FREEZER (8), BLACKLISTER (16), SEIZER (32)
   - Multiple roles can be combined on a single authority

3. **Blacklist** — `seeds: [b"sss_blacklist", config.key()]` (SSS-2 only)
   - Vec of blacklisted addresses, up to 256 entries
   - Checked by the transfer hook before every transfer

### Transfer Hook Program

SSS-2 tokens have a transfer hook installed via Token-2022's TransferHook extension. On every `transfer_checked`, Token-2022 invokes our hook, which:

1. Reads the TokenConfig to check if the token is paused
2. Reads the Blacklist to check if source or destination owner is blacklisted
3. Rejects the transfer if either check fails

The hook uses an ExtraAccountMetaList PDA to tell Token-2022 which additional accounts to pass.

## Token-2022 Extensions Used

| Extension | SSS-1 | SSS-2 | Purpose |
|-----------|-------|-------|---------|
| MintCloseAuthority | Yes | Yes | Allow closing the mint if supply reaches 0 |
| MetadataPointer | Yes | Yes | On-chain metadata (name, symbol, URI) |
| PermanentDelegate | No | Yes | Enables seizure from any account |
| TransferHook | No | Yes | Compliance checks on every transfer |

## PDA Authority Model

The TokenConfig PDA is the central authority. It holds:
- Mint authority → can mint tokens
- Freeze authority → can freeze/thaw accounts
- Permanent delegate (SSS-2) → can transfer/burn from any account
- MintCloseAuthority → can close the mint

This design means no single wallet holds these authorities directly. Instead, the program logic mediates access through role checks.

## Instruction Flow

### Mint Tokens
```
Signer (MINTER role) → sss-token::mint_tokens
  → Check role bitmask
  → Check pause state
  → Check supply cap
  → CPI: Token-2022::mint_to (signed by config PDA)
```

### Transfer (SSS-2)
```
User → Token-2022::transfer_checked
  → Token-2022 invokes transfer hook
    → sss-transfer-hook::execute
      → Read config: check paused
      → Read blacklist: check source and destination
      → Return OK or error
```

### Seizure (SSS-2)
```
Signer (SEIZER role) → sss-token::seize
  → Verify target owner is blacklisted
  → CPI: Token-2022::burn_checked (permanent delegate burns from source)
  → CPI: Token-2022::mint_to (mint equivalent to treasury)
```

Note: Seizure uses burn+mint instead of transfer_checked to avoid the transfer hook blocking the operation (since the source is blacklisted).

## Off-Chain Architecture

```
                    ┌─────────────┐
                    │  REST API   │
                    │  (Express)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──────┐ ┌──▼──────┐ ┌──▼──────────┐
     │  Lifecycle    │ │ Webhook │ │  Compliance  │
     │  (mint/burn)  │ │ Service │ │  Service     │
     └───────────────┘ └─────────┘ └──────────────┘
              │                         │
              └─────────┬───────────────┘
                        │
                 ┌──────▼──────┐
                 │   Indexer   │
                 │  (WS logs)  │
                 └──────┬──────┘
                        │
                 ┌──────▼──────┐
                 │   Solana    │
                 │   RPC/WS    │
                 └─────────────┘
```

### Event Indexer
Subscribes to program logs via WebSocket. Parses structured events from `msg!()` log output and dispatches to registered handlers.

### Webhook Service
Delivers events to registered HTTP endpoints with HMAC-SHA256 signatures. Supports retry with exponential backoff.

### Compliance Service
Monitors events against configurable rules. Generates alerts for large mints/burns, seizures, pause events, and blacklist changes.

### Mint/Burn Lifecycle
Optional approval workflow for mint and burn operations. Supports dual-control (requester + approver) for regulated deployments.
