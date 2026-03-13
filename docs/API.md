# API Reference

## Program Instructions

### Core (SSS-1)

| Instruction | Args | Access |
|-------------|------|--------|
| `initialize` | `InitializeParams` | Authority (creates mint + config) |
| `mint_tokens` | `amount: u64` | Minter (with quota) |
| `burn_tokens` | `amount: u64` | Burner |
| `freeze_account` | — | Master authority or pauser |
| `thaw_account` | — | Master authority only |
| `pause` | — | Master authority or pauser |
| `unpause` | — | Master authority only |
| `update_minter` | `minter: Pubkey, quota: u64` | Master authority |
| `remove_minter` | `minter: Pubkey` | Master authority |
| `update_roles` | `UpdateRolesParams` | Master authority |
| `transfer_authority` | `new_authority: Pubkey` | Master authority |

### Compliance (SSS-2)

| Instruction | Args | Access |
|-------------|------|--------|
| `add_to_blacklist` | `reason: String` | Blacklister or master auth |
| `remove_from_blacklist` | — | Blacklister or master auth |
| `seize` | — | Seizer or master auth |

## Account Layouts

### StablecoinConfig (Config PDA)

| Field | Type | Offset |
|-------|------|--------|
| _discriminator_ | `[u8; 8]` | 0 |
| `authority` | `Pubkey` | 8 |
| `mint` | `Pubkey` | 40 |
| `name` | `String` | 72 |
| `symbol` | `String` | variable |
| `uri` | `String` | variable |
| `decimals` | `u8` | variable |
| `is_paused` | `bool` | variable |
| `total_minted` | `u64` | variable |
| `total_burned` | `u64` | variable |
| `enable_permanent_delegate` | `bool` | variable |
| `enable_transfer_hook` | `bool` | variable |
| `enable_confidential_transfers` | `bool` | variable |
| `default_account_frozen` | `bool` | variable |
| `bump` | `u8` | variable |

### RoleManager (Roles PDA)

| Field | Type | Offset |
|-------|------|--------|
| _discriminator_ | `[u8; 8]` | 0 |
| `config` | `Pubkey` | 8 |
| `master_authority` | `Pubkey` | 40 |
| `pauser` | `Pubkey` | 72 |
| `minters` | `Vec<MinterEntry>` | 104 |
| `burners` | `Vec<Pubkey>` | variable |
| `blacklister` | `Pubkey` | variable |
| `seizer` | `Pubkey` | variable |
| `bump` | `u8` | variable |

### MinterEntry

| Field | Type | Size |
|-------|------|------|
| `address` | `Pubkey` | 32 |
| `quota` | `u64` | 8 |
| `minted` | `u64` | 8 |

### BlacklistEntry (Blacklist PDA)

| Field | Type | Offset |
|-------|------|--------|
| _discriminator_ | `[u8; 8]` | 0 |
| `config` | `Pubkey` | 8 |
| `address` | `Pubkey` | 40 |
| `reason` | `String` | 72 |
| `blacklisted_at` | `i64` | variable |
| `blacklisted_by` | `Pubkey` | variable |
| `bump` | `u8` | variable |

## PDA Seeds

| PDA | Seeds | Description |
|-----|-------|-------------|
| Config | `["config", mint]` | Stablecoin configuration |
| Roles | `["roles", config]` | Role assignments |
| Blacklist | `["blacklist", config, address]` | Per-address blacklist entry |

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | `Unauthorized` | Signer lacks required role |
| 6001 | `Paused` | Operations are paused |
| 6002 | `MinterQuotaExceeded` | Mint amount exceeds remaining quota |
| 6003 | `MinterNotFound` | Address not in minters list |
| 6004 | `AlreadyBlacklisted` | Address already on blacklist |
| 6005 | `NotBlacklisted` | Address not on blacklist |
| 6006 | `ComplianceNotEnabled` | SSS-2 feature not enabled at init |
| 6007 | `AccountNotFrozen` | Seize requires frozen account |
| 6008 | `InvalidTokenProgram` | Must use Token-2022 |

## Events

| Event | Fields | When |
|-------|--------|------|
| `StablecoinInitialized` | `mint, name, symbol, decimals` | After init |
| `TokensMinted` | `mint, recipient, amount, minter` | After mint |
| `TokensBurned` | `mint, amount, burner` | After burn |
| `AccountFrozen` | `mint, account` | After freeze |
| `AccountThawed` | `mint, account` | After thaw |
| `OperationsPaused` | `mint` | After pause |
| `OperationsUnpaused` | `mint` | After unpause |
| `MinterUpdated` | `mint, minter, quota` | After update_minter |
| `MinterRemoved` | `mint, minter` | After remove_minter |
| `AuthorityTransferred` | `mint, old, new` | After transfer_authority |
| `AddressBlacklisted` | `mint, address, reason, by` | After blacklist add |
| `AddressUnblacklisted` | `mint, address` | After blacklist remove |
| `TokensSeized` | `mint, from, treasury, amount` | After seize |
