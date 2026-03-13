# SSS-1: Minimal Stablecoin Standard

> **Status**: Stable  
> **Program**: `sss_token`  
> **Extensions**: Mint Authority + Freeze Authority + Metadata (Token-2022)

## Overview

SSS-1 is the base standard for simple stablecoins on Solana. It provides mint/burn/freeze capabilities with role-based access control. No compliance modules — if you need blacklists or token seizure, use [SSS-2](./SSS-2.md).

**Use cases**: Internal tokens, DAO treasuries, ecosystem settlement, test stablecoins.

## Feature Matrix

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---------|-------|-------|-------|
| Mint/Burn with quotas | ✅ | ✅ | ✅ |
| Freeze/Thaw accounts | ✅ | ✅ | ✅ |
| Pause/Unpause | ✅ | ✅ | ✅ |
| Role-based access control | ✅ | ✅ | ✅ |
| Permanent Delegate | ❌ | ✅ | ❌ |
| Transfer Hook (blacklist) | ❌ | ✅ | ❌ |
| Blacklist/Seize | ❌ | ✅ | ❌ |
| Confidential Transfers | ❌ | ❌ | ✅ |

## On-Chain State

### StablecoinConfig PDA

Seeds: `["config", mint_pubkey]`

```rust
pub struct StablecoinConfig {
    pub authority: Pubkey,      // Master authority
    pub mint: Pubkey,           // Token-2022 mint
    pub name: String,           // Token name
    pub symbol: String,         // Token symbol
    pub uri: String,            // Metadata URI
    pub decimals: u8,           // Token decimals
    pub is_paused: bool,        // Global pause flag
    pub total_minted: u64,      // Cumulative minted
    pub total_burned: u64,      // Cumulative burned
    // SSS-2/3 feature flags (false for SSS-1)
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub enable_confidential_transfers: bool,
    pub default_account_frozen: bool,
    pub bump: u8,
}
```

The config PDA is the **mint authority** and **freeze authority** — only the program can mint/freeze, and it checks roles before allowing it.

### RoleManager PDA

Seeds: `["roles", config_pubkey]`

```rust
pub struct RoleManager {
    pub config: Pubkey,
    pub master_authority: Pubkey,   // Admin — can do everything
    pub pauser: Pubkey,             // Can pause (but NOT unpause)
    pub minters: Vec<MinterEntry>,  // Per-minter quotas
    pub burners: Vec<Pubkey>,       // Authorized burners
    pub blacklister: Pubkey,        // SSS-2: manages blacklist
    pub seizer: Pubkey,             // SSS-2: can seize tokens
    pub bump: u8,
}

pub struct MinterEntry {
    pub address: Pubkey,
    pub quota: u64,     // Maximum allowed to mint
    pub minted: u64,    // How much already minted
}
```

## Instructions

### `initialize`

Creates the mint, config PDA, and role manager. The config PDA becomes the mint authority.

```
initialize(params: InitializeParams)
  params.name: String
  params.symbol: String
  params.uri: String
  params.decimals: u8
  params.enable_permanent_delegate: bool  // false for SSS-1
  params.enable_transfer_hook: bool       // false for SSS-1
  params.enable_confidential_transfers: bool
  params.default_account_frozen: bool
  params.pauser: Pubkey
  params.blacklister: Option<Pubkey>
  params.seizer: Option<Pubkey>
```

### `mint_tokens`

Mint tokens to a recipient. The signer must be an authorized minter with remaining quota.

```
mint_tokens(amount: u64)
  Accounts: minter (signer), config, role_manager, mint, recipient_token_account, token_program
  Checks: minter in role_manager.minters, minted + amount <= quota, !is_paused
  Effects: mints via CPI, updates total_minted + minter.minted
```

### `burn_tokens`

Burn tokens from the signer's account.

```
burn_tokens(amount: u64)
  Accounts: burner (signer), config, role_manager, mint, burner_token_account, token_program
  Checks: burner in role_manager.burners, !is_paused
  Effects: burns via CPI, updates total_burned
```

### `freeze_account` / `thaw_account`

Freeze or thaw a token account. Freeze can be done by master authority or pauser. Thaw is master authority only.

### `pause` / `unpause`

Pause halts all mint/burn operations. The pauser can pause, but only the master authority can unpause (safety measure).

### `update_minter` / `remove_minter`

Add/update/remove minters and their quotas. Master authority only.

### `update_roles`

Update role assignments (pauser, blacklister, seizer, add/remove burners). Master authority only.

### `transfer_authority`

⚠️ **Irreversible.** Transfer master authority to a new address.

## Events

Every state change emits a typed Anchor event for off-chain indexing:

- `StablecoinInitialized { mint, name, symbol, decimals }`
- `TokensMinted { mint, recipient, amount, minter }`
- `TokensBurned { mint, amount, burner }`
- `AccountFrozen { mint, account }`
- `AccountThawed { mint, account }`
- `OperationsPaused { mint }`
- `OperationsUnpaused { mint }`
- `MinterUpdated { mint, minter, quota }`
- `MinterRemoved { mint, minter }`
- `AuthorityTransferred { mint, old_authority, new_authority }`

## Security Model

1. **No single key controls everything** — roles are separated
2. **Minter quotas** — even compromised minters can only mint up to their quota
3. **Pause is asymmetric** — pauser can stop, only admin can restart
4. **Config PDA is mint authority** — no external key can mint directly
