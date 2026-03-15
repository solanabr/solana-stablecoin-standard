# API Reference

## On-Chain Program Instructions

### Program ID

- **Stablecoin Program:** `SSS1111111111111111111111111111111111111111`
- **Transfer Hook Program:** `HOOK111111111111111111111111111111111111111`

> Replace with actual program IDs after deployment.

---

### `initialize`

Create a new stablecoin mint with the specified preset.

**Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `preset` | `Preset` | SSS1, SSS2, or Custom |
| `custom_features` | `Option<FeatureFlags>` | Feature flags (Custom only) |
| `name` | `String` | Token name (max 32 bytes) |
| `symbol` | `String` | Token symbol (max 10 bytes) |
| `uri` | `String` | Metadata URI |
| `decimals` | `u8` | Decimal places (0-18) |
| `transfer_hook_program` | `Option<Pubkey>` | Hook program (required for SSS-2) |

**Accounts:**
| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| `authority` | ✓ | ✓ | Payer and initial master authority |
| `config` | ✗ | ✓ | StablecoinConfig PDA (init) |
| `mint` | ✓ | ✓ | New Token-2022 mint keypair |
| `authority_role` | ✗ | ✓ | RoleAssignment PDA (init) |
| `token_program` | ✗ | ✗ | Token-2022 program |
| `system_program` | ✗ | ✗ | System program |
| `rent` | ✗ | ✗ | Rent sysvar |

---

### `mint_tokens`

Mint new tokens. Requires `Minter` role.

**Parameters:** `amount: u64`

**Accounts:**
| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| `minter` | ✓ | ✓ | Minter signing the tx |
| `config` | ✗ | ✓ | StablecoinConfig PDA |
| `role_assignment` | ✗ | ✓ | Minter's RoleAssignment PDA |
| `mint` | ✗ | ✓ | Token-2022 mint |
| `destination` | ✗ | ✓ | Destination token account |
| `token_program` | ✗ | ✗ | Token-2022 program |

---

### `burn_tokens`

Burn tokens. Requires `Burner` role.

**Parameters:** `amount: u64`

**Accounts:**
| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| `burner` | ✓ | ✗ | Burner signing the tx |
| `config` | ✗ | ✓ | StablecoinConfig PDA |
| `role_assignment` | ✗ | ✗ | Burner's RoleAssignment PDA |
| `mint` | ✗ | ✓ | Token-2022 mint |
| `source` | ✗ | ✓ | Source token account |
| `source_authority` | ✗ | ✗ | Owner of source account |
| `token_program` | ✗ | ✗ | Token-2022 program |

---

### `freeze_account` / `thaw_account`

Freeze or thaw a token account. Requires `Pauser` role or master authority.

**Accounts:**
| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| `authority` | ✓ | ✗ | Pauser or master authority |
| `config` | ✗ | ✗ | StablecoinConfig PDA |
| `role_assignment` | ✗ | ✗ | Authority's RoleAssignment PDA |
| `mint` | ✗ | ✗ | Token-2022 mint |
| `token_account` | ✗ | ✓ | Account to freeze/thaw |
| `token_program` | ✗ | ✗ | Token-2022 program |

---

### `pause` / `unpause`

Pause or unpause all operations. Pause requires `Pauser` or master authority. Unpause requires master authority only.

---

### `manage_role`

Grant or revoke a role. Master authority only.

**Parameters:**
| Field | Type | Description |
|-------|------|-------------|
| `role` | `Role` | Minter, Burner, Pauser, ComplianceOfficer |
| `action` | `RoleAction` | Grant or Revoke |
| `mint_quota` | `Option<u64>` | Mint quota (Minter only) |

---

### `add_to_blacklist` (SSS-2)

Add an address to the blacklist. Requires `ComplianceOfficer` role.

**Parameters:** `address: Pubkey`

---

### `remove_from_blacklist` (SSS-2)

Remove an address from the blacklist. Requires `ComplianceOfficer` role.

**Parameters:** `address: Pubkey`

---

### `seize` (SSS-2)

Seize tokens from a blacklisted account. Requires `ComplianceOfficer` role.

**Parameters:** `amount: u64`

**Accounts:**
| Account | Signer | Mutable | Description |
|---------|--------|---------|-------------|
| `compliance_officer` | ✓ | ✗ | ComplianceOfficer signing |
| `config` | ✗ | ✓ | StablecoinConfig PDA (permanent delegate) |
| `role_assignment` | ✗ | ✗ | Officer's RoleAssignment PDA |
| `blacklist_entry` | ✗ | ✗ | BlacklistEntry PDA (proves blacklisted) |
| `mint` | ✗ | ✓ | Token-2022 mint |
| `source` | ✗ | ✓ | Blacklisted token account |
| `destination` | ✗ | ✓ | Treasury token account |
| `token_program` | ✗ | ✗ | Token-2022 program |

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | `Unauthorized` | Missing required role |
| 6001 | `NotMasterAuthority` | Only master authority allowed |
| 6002 | `Paused` | Operations are paused |
| 6003 | `NotPaused` | Operations are not paused |
| 6004 | `ZeroAmount` | Amount must be > 0 |
| 6005 | `InsufficientBalance` | Not enough tokens |
| 6006 | `MintQuotaExceeded` | Minter quota exceeded |
| 6007 | `ComplianceNotEnabled` | Requires SSS-2 |
| 6008 | `AlreadyBlacklisted` | Address already blacklisted |
| 6009 | `NotBlacklisted` | Address not blacklisted |
| 6010 | `SeizeRequiresBlacklist` | Must be blacklisted to seize |
| 6011 | `NoPermanentDelegate` | Delegate not configured |
| 6012 | `InvalidPreset` | Invalid preset config |
| 6013 | `NameTooLong` | Name exceeds 32 bytes |
| 6014 | `SymbolTooLong` | Symbol exceeds 10 bytes |
| 6015 | `InvalidDecimals` | Decimals must be 0-18 |
| 6016 | `TransferHookRequired` | SSS-2 needs hook program |
| 6017 | `AlreadyFrozen` | Account already frozen |
| 6018 | `NotFrozen` | Account not frozen |
| 6019 | `Overflow` | Arithmetic overflow |
