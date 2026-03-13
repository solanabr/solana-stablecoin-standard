# Architecture

## Overview

The Solana Stablecoin Standard (SSS) uses a single on-chain program (`sss-1`) with a configurable surface:
- Core stablecoin operations are always available.
- Transfer-hook compliance is an optional module initialized per mint.

## Program Layout

```
programs/
└── sss-1/
    └── src/
        ├── lib.rs              # Program entry
        ├── state.rs            # StablecoinConfig, Role, HookConfig, Blacklist
        ├── instructions/       # Core + optional hook/compliance instructions
        ├── error.rs            # Unified error enum
        ├── events.rs           # Core + hook events
        └── constants.rs        # PDA seeds
```

## PDA Structure

| Account | Seeds |
|---------|-------|
| Config | `['config', mint]` |
| Role | `['role', config, authority, role_type]` |
| HookConfig | `['hook_config', mint]` |
| Blacklist | `['blacklist', hook_config, address]` |
| ExtraAccountMetaList | `['extra-account-metas', mint]` |

## Module Model

- **SSS-1 Core**: Initialize, roles, mint/burn, freeze/thaw, metadata updates, pause, admin transfer, seizure.
- **SSS-2 Module (optional inside `sss-1`)**:
  - `initialize_hook_module`
  - `initialize_extra_account_meta_list`
  - `add_to_blacklist` / `remove_from_blacklist`
  - `set_compliance_mode`
  - `transfer_hook_authority`
  - `transfer_hook`

The hook module is opt-in per mint and does not require a second deployed program.

## Backend Services

| Service | Port | Purpose |
|---------|------|---------|
| Mint/Burn | 3001 | API for minting, burning, pause, seizure, role/admin operations |
| Indexer | 3002 | Event indexing and query |
| Compliance | 3003 | Blacklist/compliance and authority controls |
