# SSS-1: Minimal Stablecoin Standard

**Version:** 1.0
**Status:** Final

## Overview

SSS-1 defines the minimal viable stablecoin on Solana. It includes only what every stablecoin needs: the ability to mint, burn, and freeze accounts, with on-chain metadata.

**Use cases:**
- Internal settlement tokens
- DAO treasury tokens
- Ecosystem utility tokens
- Development and testing
- Stablecoins where on-chain compliance enforcement is not required

Compliance in SSS-1 is reactive: the issuer can freeze accounts but there is no automatic enforcement on every transfer.

## Token-2022 Extensions

| Extension | Role |
|-----------|------|
| `MintCloseAuthority` | Authority to close the mint when supply reaches zero |
| `MetadataPointer` | Points to inline (on-mint) metadata account |
| `TokenMetadata` | Stores name, symbol, URI on-chain |
| `FreezeAuthority` | Stored on the standard `Mint` state |

## Accounts

### StablecoinConfig PDA
Seeds: `["config", mint]`

| Field | Type | Description |
|-------|------|-------------|
| `authority` | `Pubkey` | Master authority |
| `mint` | `Pubkey` | Token-2022 mint |
| `name` | `String` | Token name (max 32 bytes) |
| `symbol` | `String` | Token symbol (max 10 bytes) |
| `uri` | `String` | Metadata URI (max 200 bytes) |
| `decimals` | `u8` | Token decimals (0–9) |
| `paused` | `bool` | Global pause flag |
| `preset` | `u8` | `1` for SSS-1 |
| `burner` | `Option<Pubkey>` | Optional burner role |
| `pauser` | `Option<Pubkey>` | Optional pauser role |
| `bump` | `u8` | PDA bump |

### MinterInfo PDA
Seeds: `["minter", mint, minter_pubkey]`

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Associated mint |
| `minter` | `Pubkey` | Minter address |
| `quota` | `u64` | Max tokens (0 = unlimited) |
| `minted` | `u64` | Lifetime minted amount |
| `active` | `bool` | Whether minter is active |

## Instructions

### `initialize`
Creates the Token-2022 mint with all SSS-1 extensions and the `StablecoinConfig` PDA.

**Signers:** `authority`, `mint` (fresh keypair)

**Key effects:**
- Mint authority = `StablecoinConfig` PDA
- Freeze authority = `StablecoinConfig` PDA
- On-chain metadata written to mint

### `mint_tokens(amount: u64)`
Mints tokens to a recipient. Caller must be an active authorized minter.

**Signers:** `minter`

**Guards:**
- `!config.paused`
- `minter_info.active`
- `minted + amount <= quota` (if quota > 0)

### `burn_tokens(amount: u64)`
Burns tokens. Caller must hold the burner role (or be master authority). Token account owner must also sign.

**Signers:** `burner`, `token_account_owner`

**Guards:**
- `!config.paused`
- `has_burn_authority(burner)`

### `freeze_token_account`
Freezes a token account. Only master authority.

**Signers:** `authority`

### `thaw_token_account`
Thaws a frozen token account. Only master authority.

**Signers:** `authority`

### `pause`
Sets `config.paused = true`. Disables mint and burn.

**Signers:** `authority` or `config.pauser`

### `unpause`
Sets `config.paused = false`.

**Signers:** `authority` or `config.pauser`

### `update_minter(params)`
Add, update, or deactivate a minter. Only master authority.

### `update_roles(params)`
Update secondary roles (burner, pauser). Only master authority.

### `transfer_authority(new_authority)`
Transfer master authority immediately.

**Signers:** current `authority`

## CLI Quick Reference

```bash
sss-token init --preset sss-1 --name "My Stable" --symbol MYUSD --decimals 6
sss-token minters add <address> --quota 1000000
sss-token mint <recipient> <amount>
sss-token burn <token-account> <amount>
sss-token freeze <token-account>
sss-token thaw <token-account>
sss-token pause
sss-token unpause
sss-token status
sss-token supply
```
