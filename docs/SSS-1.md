# SSS-1: Minimal Stablecoin Specification

SSS-1 is the base tier of the Solana Stablecoin Standard. It provides a complete stablecoin lifecycle -- mint, burn, freeze, thaw, pause, minter quotas, role management, reserve attestation, and audit logging -- without transfer restrictions, blacklisting, or asset seizure.

## Overview

SSS-1 creates a Token-2022 mint with only the MetadataPointer extension. The StablecoinConfig PDA serves as both the mint authority and freeze authority. All core program features are available. Compliance enforcement features (permanent delegate, transfer hook, blacklist, seize) are disabled at initialization and cannot be enabled afterwards.

**Target use cases:**

- Internal stablecoins and testnet tokens
- Low-regulation or single-jurisdiction environments
- Simple payment tokens without transfer restrictions
- Prototyping before graduating to SSS-2
- Tokens where the issuer does not need to freeze-and-seize

## Feature Flags

```
enable_permanent_delegate:       false
enable_transfer_hook:            false
default_account_frozen:          false
enable_confidential_transfers:   false
```

These flags are set at initialization and are immutable. To upgrade from SSS-1 to SSS-2, a new mint must be deployed.

## Token-2022 Extensions

| Extension | Status | Purpose |
|-----------|--------|---------|
| MetadataPointer | Enabled | Points to the mint account as metadata source |
| PermanentDelegate | Disabled | Not needed without seizure capability |
| TransferHook | Disabled | Not needed without blacklist enforcement |
| DefaultAccountState | Disabled | New token accounts start unfrozen |
| ConfidentialTransferMint | Disabled | Not available in SSS-1 |

## Initialization Parameters

```rust
InitializeParams {
    name: String,      // max 32 characters, e.g. "USD Coin"
    symbol: String,    // max 10 characters, e.g. "USDC"
    uri: String,       // max 200 characters, metadata URI
    decimals: u8,      // 0-18, typically 6 for USD stablecoins
    preset: StablecoinPreset::SSS1,
}
```

### SDK Example

```typescript
import { SSSClient, StablecoinPreset, getPresetAnchorEnum } from "@solana-stablecoin-standard/sdk";

const mintKeypair = Keypair.generate();
await client.initialize(
  {
    name: "Test Dollar",
    symbol: "TUSD",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    preset: getPresetAnchorEnum(StablecoinPreset.SSS1),
  },
  mintKeypair
  // No hookProgramId needed for SSS-1
);
```

### CLI Example

```bash
sss init --preset sss-1 --name "Test Dollar" --symbol TUSD --decimals 6
```

## Instruction Reference

SSS-1 supports 10 of the 14 sss-token instructions. The four compliance instructions (`blacklist_add`, `blacklist_remove`, `seize`, and `initializeExtraAccountMetaList`) will fail with `BlacklistNotEnabled` or `TransferHookNotEnabled`.

| Instruction | Role Required | Description |
|-------------|---------------|-------------|
| `initialize` | Deployer (becomes master authority) | Create mint, config PDA, and role registry |
| `mint_tokens` | Active minter with quota | Mint tokens to a recipient token account |
| `burn_tokens` | Token holder | Burn tokens from the caller's own account |
| `freeze_account` | Master authority or pauser | Freeze a token account |
| `thaw_account` | Master authority or pauser | Thaw a frozen token account |
| `pause` | Master authority or pauser | Pause all mint/burn operations globally |
| `unpause` | Master authority or pauser | Resume mint/burn operations |
| `update_roles` | Master authority | Assign pauser role to a new holder |
| `update_minter` | Master authority | Create or update a minter wallet and quota |
| `transfer_authority` | Current master authority | Transfer master authority to a new address |
| `attest_reserve` | Master authority | Record an on-chain reserve attestation |

### Disabled Instructions (SSS-2 only)

| Instruction | Error if Called |
|-------------|---------------|
| `blacklist_add` | `BlacklistNotEnabled` (6010) |
| `blacklist_remove` | `BlacklistNotEnabled` (6010) |
| `seize` | `FeatureNotEnabled` (6009) |

## PDA Schema

SSS-1 uses four PDA types. BlacklistEntry PDAs are never created.

### StablecoinConfig

The central configuration account. Serves as mint authority and freeze authority.

**Seeds:** `["config", mint.key()]`

| Field | Type | SSS-1 Value |
|-------|------|-------------|
| `preset` | `StablecoinPreset` | `SSS1` |
| `enable_permanent_delegate` | `bool` | `false` |
| `enable_transfer_hook` | `bool` | `false` |
| `default_account_frozen` | `bool` | `false` |
| `enable_confidential_transfers` | `bool` | `false` |

See [architecture.md](architecture.md) for the full field list.

### RoleRegistry

Stores operational role assignments. For SSS-1, the `blacklister` and `seizer` fields are set to `Pubkey::default()` (the zero address) since those roles have no effect.

**Seeds:** `["roles", config.key()]`

| Field | SSS-1 Behavior |
|-------|----------------|
| `master_authority` | Active -- root admin for all operations |
| `pauser` | Active -- can pause/unpause and freeze/thaw |
| `blacklister` | Set to zero address -- no blacklist functionality |
| `seizer` | Set to zero address -- no seize functionality |

### MinterInfo

Per-minter quota tracking. Created by `update_minter`.

**Seeds:** `["minter", config.key(), minter_wallet.key()]`

### ReserveAttestation

Immutable reserve proof records. Created by `attest_reserve`.

**Seeds:** `["reserve", config.key(), index.to_le_bytes()]`

### AuditLogEntry

Append-only audit trail. Created on each significant operation.

**Seeds:** `["audit", config.key(), index.to_le_bytes()]`

## Role-Based Access Control

SSS-1 uses two active roles:

```
Master Authority
   |
   +-- Pauser (pause/unpause, freeze/thaw)
   |
   +-- Minters (mint tokens, independent quota per wallet)
```

The master authority has implicit access to all operations. Role assignment is done via `update_roles`. Minter management is done via `update_minter`.

### Role Assignment at Initialization

All roles are initially assigned to the deploying wallet:

| Role | Initial Holder |
|------|---------------|
| Master authority | Deployer wallet |
| Pauser | Deployer wallet |
| Blacklister | `Pubkey::default()` (inactive) |
| Seizer | `Pubkey::default()` (inactive) |

## Operational Workflow

### 1. Initialize

Deploy the SSS-1 mint. This creates the Token-2022 mint with MetadataPointer, the StablecoinConfig PDA, and the RoleRegistry PDA.

### 2. Configure Minters

Add one or more minters with quotas:

```bash
sss minter update --mint <MINT> --wallet <WALLET> --active --quota 10000000000
```

### 3. Assign Pauser

Optionally delegate the pauser role to an operations key:

```bash
sss roles update --mint <MINT> --role pauser --new-holder <OPS_KEY>
```

### 4. Operate

Minters mint tokens. Token holders burn tokens. The pauser can freeze individual accounts or pause global operations.

### 5. Attest Reserves

Record periodic reserve attestations:

```bash
sss attest --mint <MINT> --hash <SHA256> --reserves-usd 100000000 --outstanding 100000000 --uri "https://example.com/audit.pdf"
```

## Error Codes

SSS-1 operations can produce the following errors:

| Code | Name | Trigger |
|------|------|---------|
| 6000 | Unauthorized | Caller lacks the required role |
| 6001 | InvalidAuthority | Wrong authority for the operation |
| 6002 | ProgramPaused | Mint/burn called while paused |
| 6003 | ProgramNotPaused | Unpause called when not paused |
| 6004 | MinterNotActive | Minter is deactivated |
| 6005 | MintQuotaExceeded | Amount exceeds remaining quota |
| 6006 | MintAmountZero | Mint amount is zero |
| 6007 | BurnAmountZero | Burn amount is zero |
| 6008 | InsufficientBalance | Not enough tokens to burn |
| 6009 | FeatureNotEnabled | SSS-2 feature called on SSS-1 |
| 6010 | BlacklistNotEnabled | Blacklist instruction on SSS-1 |
| 6016-6021 | Validation errors | Name/symbol/URI/decimals too long or invalid |
| 6022 | SameAuthority | Transfer authority to same address |
| 6023 | ZeroAuthority | Transfer authority to zero address |
| 6024 | Overflow | Arithmetic overflow in counters |

## Events

SSS-1 emits the following events:

| Event | Trigger |
|-------|---------|
| `StablecoinInitialized` | `initialize` |
| `TokensMinted` | `mint_tokens` |
| `TokensBurned` | `burn_tokens` |
| `AccountFrozen` | `freeze_account` |
| `AccountThawed` | `thaw_account` |
| `ProgramPaused` | `pause` |
| `ProgramUnpaused` | `unpause` |
| `RoleUpdated` | `update_roles` |
| `MinterUpdated` | `update_minter` |
| `AuthorityTransferred` | `transfer_authority` |
| `AuditLogRecorded` | All write operations |

## Limitations

- **No transfer restrictions.** Anyone holding tokens can transfer freely. There is no per-transfer validation.
- **No blacklist/seize.** The issuer cannot prevent specific addresses from transacting or recover tokens from malicious actors.
- **No in-place upgrade.** Feature flags are immutable. Upgrading to SSS-2 requires deploying a new mint and migrating token holders.
- **Freeze is account-level only.** Freezing blocks all operations on a specific token account but does not create a persistent blacklist record or trigger transfer hook enforcement.
