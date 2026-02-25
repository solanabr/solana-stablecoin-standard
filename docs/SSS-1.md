# SSS-1: Minimal Stablecoin Preset

## Overview

SSS-1 is the minimal preset of the Solana Stablecoin Standard. It provides a
role-gated mint/burn/freeze/pause lifecycle with no compliance extensions. There
is no permanent delegate, no transfer hook, and no default-frozen state. All
token accounts start unfrozen and transfers are unrestricted at the protocol
level.

SSS program ID: `E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP`

## Token-2022 Extensions (SSS-1)

When `enablePermanentDelegate=false` and `enableTransferHook=false`, `initialize`
allocates a mint with exactly the following extensions:

| Extension            | Purpose                                                |
|----------------------|--------------------------------------------------------|
| `MetadataPointer`    | Points the mint to itself as its own metadata account  |
| `TokenMetadata`      | Stores `name`, `symbol`, `uri` inline in the mint      |

`PermanentDelegate`, `TransferHook`, and `DefaultAccountState` are NOT added.

The `StablecoinConfig` PDA is set as both mint authority and freeze authority.
The deploying wallet (`authority`) is set as the metadata update authority.

## PDA Seeds

All seeds are ASCII byte literals matching the constants in `constants.rs`.

| Account            | Seeds                                              | Program         |
|--------------------|----------------------------------------------------|-----------------|
| `StablecoinConfig` | `["stablecoin", mint]`                             | `sss-token`     |
| `RoleManager`      | `["roles", stablecoin_config]`                     | `sss-token`     |
| `MinterInfo`       | `["minter", stablecoin_config, minter_wallet]`     | `sss-token`     |

## State Accounts

### `StablecoinConfig`

Anchor account. Space: computed from `StablecoinConfig::LEN`.

| Field                    | Type      | Description                                           |
|--------------------------|-----------|-------------------------------------------------------|
| `authority`              | `Pubkey`  | Sole admin; required signer for privileged operations |
| `mint`                   | `Pubkey`  | The Token-2022 mint address                           |
| `name`                   | `String`  | Token name (max 32 chars)                             |
| `symbol`                 | `String`  | Token symbol (max 10 chars)                           |
| `uri`                    | `String`  | Metadata URI (max 200 chars)                          |
| `decimals`               | `u8`      | Mint decimal places                                   |
| `enable_permanent_delegate` | `bool` | Set at init; false for SSS-1                         |
| `enable_transfer_hook`   | `bool`    | Set at init; false for SSS-1                         |
| `enable_default_frozen`  | `bool`    | Set at init; false for SSS-1                         |
| `paused`                 | `bool`    | Global pause flag; blocks mint and burn when true     |
| `total_minted`           | `u64`     | Cumulative tokens minted (never decremented)          |
| `total_burned`           | `u64`     | Cumulative tokens burned                              |
| `bump`                   | `u8`      | PDA canonical bump                                    |
| `_reserved`              | `[u8; 64]`| Reserved for future fields                           |

### `RoleManager`

Anchor account. Space: computed from `RoleManager::LEN`.

| Field          | Type          | Max entries | Description                          |
|----------------|---------------|-------------|--------------------------------------|
| `stablecoin`   | `Pubkey`      | —           | Key of the `StablecoinConfig`        |
| `minters`      | `Vec<Pubkey>` | 10          | Addresses allowed to mint            |
| `burners`      | `Vec<Pubkey>` | 10          | Addresses allowed to burn            |
| `pausers`      | `Vec<Pubkey>` | 5           | Addresses allowed to pause/freeze    |
| `blacklisters` | `Vec<Pubkey>` | 5           | Empty for SSS-1 (compliance flag off)|
| `seizers`      | `Vec<Pubkey>` | 5           | Empty for SSS-1 (compliance flag off)|
| `bump`         | `u8`          | —           | PDA canonical bump                   |
| `_reserved`    | `[u8; 32]`    | —           | Reserved                             |

### `MinterInfo`

Anchor account. Space: `MinterInfo::LEN` = 89 bytes. One PDA per minter address.

| Field        | Type     | Description                                         |
|--------------|----------|-----------------------------------------------------|
| `minter`     | `Pubkey` | Wallet address of the minter                        |
| `stablecoin` | `Pubkey` | Key of the `StablecoinConfig`                       |
| `quota`      | `u64`    | Max lifetime mint amount; 0 means unlimited         |
| `minted`     | `u64`    | Running total minted by this minter                 |
| `bump`       | `u8`     | PDA canonical bump                                  |

## Role Model

| Role        | Stored in        | Max | Granted by  | Capabilities                       |
|-------------|------------------|-----|-------------|------------------------------------|
| `authority` | `StablecoinConfig.authority` | 1 | Itself (transfer) | All admin operations     |
| `minter`    | `RoleManager.minters` + `MinterInfo` | 10 | `authority` | `mint_tokens`         |
| `burner`    | `RoleManager.burners`        | 10  | `authority` | `burn_tokens`              |
| `pauser`    | `RoleManager.pausers`        | 5   | `authority` | `pause`, `unpause`, `freeze_account`, `thaw_account` |

Adding a minter requires the dedicated `add_minter` instruction (creates the
`MinterInfo` PDA). Burners and pausers use `add_role` / `remove_role`.
Attempting to add a minter via `add_role` returns `UseDedicatedAddMinter`.

## Instructions

| Instruction          | Required Signer      | Key Checks                                         |
|----------------------|----------------------|----------------------------------------------------|
| `initialize`         | `authority`, `mint`  | Both must sign; `mint` is a fresh keypair          |
| `add_minter`         | `authority`          | `has_one = authority` on `StablecoinConfig`        |
| `remove_role`        | `authority`          | `has_one = authority` on `StablecoinConfig`        |
| `update_minter_quota`| `authority`          | `has_one = authority` on `StablecoinConfig`        |
| `mint_tokens`        | `minter`             | `minter` must be in `RoleManager.minters`; not paused; quota check |
| `burn_tokens`        | `burner`             | `burner` must be in `RoleManager.burners`; not paused; burns from `burner`'s own ATA |
| `freeze_account`     | `authority` or pauser| Signer must be `authority` OR in `pausers`         |
| `thaw_account`       | `authority` or pauser| Signer must be `authority` OR in `pausers`         |
| `pause`              | `authority` or pauser| Signer must be `authority` OR in `pausers`         |
| `unpause`            | `authority` or pauser| Signer must be `authority` OR in `pausers`         |
| `transfer_authority` | `authority`          | `has_one = authority`; atomically sets new authority|

### `mint_tokens` — detailed flow

1. Require `amount > 0`; require `!paused`.
2. Require `minter` is in `RoleManager.minters`.
3. Load `MinterInfo`; compute `new_minted = minted + amount` (checked add).
4. If `quota > 0`, require `new_minted <= quota`; else unlimited.
5. CPI `mint_to` signed by `StablecoinConfig` PDA seeds `["stablecoin", mint, bump]`.
6. Increment `minter_info.minted` and `stablecoin_config.total_minted`.

### `burn_tokens` — detailed flow

1. Require `amount > 0`; require `!paused`.
2. Require `burner` is in `RoleManager.burners`.
3. CPI `burn` — authority is the `burner` wallet (not the config PDA).
4. Increment `stablecoin_config.total_burned`.

## Error Codes

| Code                  | Message                                                    |
|-----------------------|------------------------------------------------------------|
| `Paused`              | Token operations are paused                                |
| `Unauthorized`        | Caller does not have the required role                     |
| `QuotaExceeded`       | Minter quota exceeded                                      |
| `ComplianceNotEnabled`| Compliance module not enabled for this token               |
| `AlreadyBlacklisted`  | Address is already blacklisted                             |
| `NotBlacklisted`      | Address is not blacklisted                                 |
| `InvalidPreset`       | Invalid preset configuration                               |
| `RoleCapacityReached` | Maximum role capacity reached                              |
| `AccountNotFrozen`    | Cannot seize from an account that is not frozen            |
| `NameTooLong`         | Token name too long (max 32 chars)                         |
| `SymbolTooLong`       | Token symbol too long (max 10 chars)                       |
| `UriTooLong`          | Token URI too long (max 200 chars)                         |
| `ReasonTooLong`       | Blacklist reason too long (max 64 chars)                   |
| `ZeroAmount`          | Amount must be greater than zero                           |
| `MathOverflow`        | Arithmetic overflow                                        |
| `RoleNotFound`        | Role not found                                             |
| `UseDedicatedAddMinter`| Use add_minter instruction to add minters                 |
| `AlreadyHasRole`      | Address already holds this role                            |

## Lifecycle Example

```
1. initialize(name, symbol, uri, decimals,
              enablePermanentDelegate=false,
              enableTransferHook=false,
              enableDefaultFrozen=false)
   -> creates StablecoinConfig PDA, RoleManager PDA, Token-2022 mint

2. add_minter(minter=<wallet>, quota=1_000_000_000)
   -> creates MinterInfo PDA; appends to RoleManager.minters

3. add_role(role=Burner, address=<wallet>)
   -> appends to RoleManager.burners

4. add_role(role=Pauser, address=<wallet>)
   -> appends to RoleManager.pausers

5. mint_tokens(amount=500_000_000, recipient=<user>)
   -> CPIs mint_to signed by StablecoinConfig PDA

6. burn_tokens(amount=100_000_000)
   -> CPIs burn signed by burner wallet

7. freeze_account(token_account=<user_ata>)
   -> CPIs freeze_account signed by StablecoinConfig PDA

8. thaw_account(token_account=<user_ata>)
   -> CPIs thaw_account signed by StablecoinConfig PDA

9. pause()
   -> sets StablecoinConfig.paused = true; mint/burn revert with Paused

10. unpause()
    -> sets StablecoinConfig.paused = false

11. transfer_authority(new_authority=<new_admin>)
    -> atomically updates StablecoinConfig.authority
```

## What SSS-1 Does NOT Have

- No `PermanentDelegate` extension — the config PDA cannot move tokens without
  the owner's signature.
- No `TransferHook` — transfers are not intercepted; no blacklist check occurs.
- No `DefaultAccountState(Frozen)` — newly created ATAs start in the unfrozen
  (normal) state.
- No `BlacklistEntry` accounts — the `add_to_blacklist` and `remove_from_blacklist`
  instructions revert with `ComplianceNotEnabled` if called against an SSS-1 mint.
- No `seize` instruction path — `enable_permanent_delegate` is false, so `seize`
  reverts with `ComplianceNotEnabled`.
