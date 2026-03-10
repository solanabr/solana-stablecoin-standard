# SSS-1: Minimal Preset Specification

**Preset ID:** `1`
**Name:** Minimal
**Constant:** `PRESET_MINIMAL`

## Overview

SSS-1 is the baseline stablecoin preset. It provides minting with quota enforcement, burning, account freeze/thaw, a global pause mechanism, role-based access control, and on-chain token metadata. It does not include compliance features such as a transfer-level blacklist or token seizure.

SSS-1 is appropriate for stablecoins operating in environments where transfer-level enforcement is not required, or where compliance is handled entirely off-chain.

## Token-2022 Extensions

| Extension | Purpose |
|---|---|
| `MetadataPointer` | Points the mint to itself as the metadata account. The update authority is the `mint_authority` PDA. |
| `MintCloseAuthority` | Allows closing the mint account and reclaiming rent if the token supply reaches zero. The close authority is the `mint_authority` PDA. |

## Capabilities

### Minting

Tokens are minted by configured minters. Each minter has a lifetime quota set by the `master_minter`. Minting is blocked when the contract is paused.

- Signer: any enabled minter with remaining quota
- Blocked by: pause
- Quota: monotonically consumed; not restored by burning

### Burning

Any token holder can burn tokens from their own ATA. Burning is blocked when the contract is paused. Burning does not restore a minter's quota.

- Signer: any token holder
- Blocked by: pause

### Freeze / Thaw

The `authority` or `blacklister` can freeze or thaw any token account. A frozen account cannot send or receive tokens. Freeze and thaw are not blocked by the pause flag — they are intentionally available as emergency powers even during a pause.

- Signer: `authority` or `blacklister`
- Not blocked by: pause

### Pause / Unpause

The `pauser` can halt all minting and burning globally. This is a single atomic flag on the `StablecoinConfig` account.

- Signer: `pauser`
- Effect: blocks `mint_tokens`, `burn_tokens`

### Role Management

The `authority` can reassign the three delegatable roles (`master_minter`, `pauser`, `blacklister`) to any public key. The `authority` itself is transferred via the two-step `transfer_authority` / `accept_authority` pattern.

- All roles default to the `authority` address at initialization.
- Roles can be set to any public key, including multi-sig programs or hardware wallet addresses.

### On-Chain Metadata

Token metadata (name, symbol, URI) is stored directly on the mint account using the Token-2022 `MetadataPointer` + `token_metadata_initialize` pattern. Metadata is set at initialization and is signed by the `mint_authority` PDA.

## Limitations

The following features are NOT available in SSS-1:

- **Blacklist:** No per-wallet transfer blocking. Any unfrozen account can send and receive.
- **Seize:** No token clawback. The `seize` instruction returns `PresetFeatureUnavailable` for SSS-1 mints.
- **Default frozen accounts:** New token accounts start in the default (unfrozen) state. There is no KYC gate.
- **Transfer hook:** No on-chain enforcement on every transfer beyond the standard Token-2022 checks.

## State Accounts

| Account | PDA Seeds | Description |
|---|---|---|
| `StablecoinConfig` | `["config", mint]` | Global config, roles, pause state, audit counters |
| `MintAuthority` | `["mint-authority", mint]` | Keyless PDA holding mint + freeze authority |
| `MinterState` | `["minter", config, minter_wallet]` | Per-minter quota and usage |

## Instruction Set

| Instruction | Authorized Signer | Pause Blocked |
|---|---|---|
| `initialize` | `authority` (payer) | N/A |
| `configure_minter` | `master_minter` | No |
| `remove_minter` | `master_minter` | No |
| `mint_tokens` | enabled minter | Yes |
| `burn_tokens` | any holder | Yes |
| `freeze_account` | `authority` or `blacklister` | No |
| `thaw_account` | `authority` or `blacklister` | No |
| `pause` | `pauser` | No |
| `unpause` | `pauser` | No |
| `update_role` | `authority` | No |
| `transfer_authority` | `authority` | No |
| `accept_authority` | `pending_authority` | No |
| `seize` | — | Returns `PresetFeatureUnavailable` |

## Events Emitted

- `StablecoinInitialized`
- `MinterConfigured`
- `MinterRemoved`
- `TokensMinted`
- `TokensBurned`
- `AccountFrozen`
- `AccountThawed`
- `Paused`
- `Unpaused`
- `RoleUpdated`
- `AuthorityTransferInitiated`
- `AuthorityTransferAccepted`

## Example Deployment

```bash
sss-token init \
  --preset 1 \
  --name "Example USD" \
  --symbol "XUSD" \
  --uri "https://example.com/xusd.json" \
  --decimals 6
```

See [OPERATIONS.md](OPERATIONS.md) for the full deployment runbook.
