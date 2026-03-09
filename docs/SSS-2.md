# SSS-2: Compliant Stablecoin Specification

SSS-2 is the compliance tier of the Solana Stablecoin Standard. It extends SSS-1 with permanent delegate authority, transfer hook enforcement, per-address blacklisting, asset seizure, and GENIUS Act reserve attestation. SSS-2 is designed for regulated stablecoin issuers operating under frameworks like the GENIUS Act.

## Overview

SSS-2 activates three additional Token-2022 extensions on top of the MetadataPointer used by SSS-1: PermanentDelegate, TransferHook, and optionally DefaultAccountState. These extensions give the issuer programmatic enforcement tools that operate at the protocol level, making compliance transparent and on-chain.

**Target use cases:**

- Regulated payment stablecoins (USD, EUR, BRL-backed)
- GENIUS Act-compliant issuers requiring reserve attestation
- Tokens subject to OFAC sanctions screening
- Stablecoins used in DeFi that require freeze-and-seize
- Cross-border remittance tokens with compliance requirements

## Feature Flags

```
enable_permanent_delegate:       true
enable_transfer_hook:            true
default_account_frozen:          false (configurable)
enable_confidential_transfers:   false
```

## Token-2022 Extensions

| Extension | Status | Purpose |
|-----------|--------|---------|
| MetadataPointer | Enabled | Points to the mint as metadata source |
| PermanentDelegate | Enabled | Allows Config PDA to burn from any account (seizure) |
| TransferHook | Enabled | Registers sss-transfer-hook for per-transfer blacklist checks |
| DefaultAccountState | Optional | When enabled, new accounts start frozen (requires KYC thaw) |
| ConfidentialTransferMint | Disabled | Not available in SSS-2 |

## Initialization

### Parameters

```rust
InitializeParams {
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    preset: StablecoinPreset::SSS2,
}
```

### Two-Step Setup

SSS-2 requires an additional setup step after initialization. The `sss-transfer-hook` program needs its ExtraAccountMetaList PDA to be initialized before any transfers can succeed.

**Step 1: Initialize the stablecoin**

```typescript
const mintKeypair = Keypair.generate();
await client.initialize(
  {
    name: "USD Coin",
    symbol: "USDC",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    preset: getPresetAnchorEnum(StablecoinPreset.SSS2),
  },
  mintKeypair,
  client.hookProgramId  // Required for SSS-2
);
```

**Step 2: Initialize the ExtraAccountMetaList**

```typescript
await client.initializeExtraAccountMetaList(mintKeypair.publicKey);
```

Without this step, all `transfer_checked` calls will fail because Token-2022 cannot resolve the extra accounts needed by the hook.

### CLI

```bash
sss init --preset sss-2 --name "USD Coin" --symbol USDC --decimals 6
```

The CLI handles both steps automatically.

## Full Instruction Reference

SSS-2 supports all 14 sss-token instructions plus the ExtraAccountMetaList initialization.

| Instruction | Role Required | SSS-2 Specific | Description |
|-------------|---------------|:-:|-------------|
| `initialize` | Deployer | | Create mint with PermanentDelegate + TransferHook extensions |
| `mint_tokens` | Active minter | | Mint tokens to a recipient |
| `burn_tokens` | Token holder | | Burn tokens from own account |
| `freeze_account` | Master authority / pauser | | Freeze a token account |
| `thaw_account` | Master authority / pauser | | Thaw a frozen token account |
| `pause` | Master authority / pauser | | Pause all mint/burn operations |
| `unpause` | Master authority / pauser | | Resume operations |
| `update_roles` | Master authority | | Assign pauser, blacklister, or seizer |
| `update_minter` | Master authority | | Configure minter wallets and quotas |
| `transfer_authority` | Current master authority | | Transfer master authority |
| `blacklist_add` | Master authority / blacklister | Yes | Add address to blacklist, freeze their account |
| `blacklist_remove` | Master authority / blacklister | Yes | Remove address from blacklist, thaw their account |
| `seize` | Master authority / seizer | Yes | Seize tokens from blacklisted address via burn+mint |
| `attest_reserve` | Master authority | | Record GENIUS Act reserve attestation |
| `initializeExtraAccountMetaList` | Any payer | Yes | One-time setup for transfer hook resolution |

## Role-Based Access Control

SSS-2 activates all four roles:

```
Master Authority
   |
   +-- Pauser (pause/unpause, freeze/thaw)
   |
   +-- Blacklister (blacklist_add, blacklist_remove)
   |
   +-- Seizer (seize tokens from blacklisted addresses)
   |
   +-- Minters (mint tokens, per-wallet quotas)
```

### Role Assignment at Initialization

| Role | Initial Holder |
|------|---------------|
| Master authority | Deployer wallet |
| Pauser | Deployer wallet |
| Blacklister | Deployer wallet |
| Seizer | Deployer wallet |

In production, these should be reassigned to separate wallets immediately after deployment for proper segregation of duties. See [COMPLIANCE.md](COMPLIANCE.md) for recommended role separation.

## Transfer Hook Flow

When any user calls `transfer_checked` on an SSS-2 mint, Token-2022 automatically invokes the `sss-transfer-hook` program. The hook checks whether the source or destination address is blacklisted.

### Account Resolution

Token-2022 resolves the ExtraAccountMetaList PDA to determine which additional accounts to pass to the hook:

| Index | Account | Source |
|-------|---------|--------|
| 0 | Source token account | Standard transfer_checked |
| 1 | Mint | Standard transfer_checked |
| 2 | Destination token account | Standard transfer_checked |
| 3 | Source authority (signer) | Standard transfer_checked |
| 4 | ExtraAccountMetaList PDA | Resolved from `["extra-account-metas", mint]` |
| 5 | sss-token program | Literal pubkey in ExtraAccountMetaList |
| 6 | StablecoinConfig PDA | External PDA: sss-token `["config", mint]` |
| 7 | Source BlacklistEntry PDA | External PDA: sss-token `["blacklist", config, authority]` |
| 8 | Dest BlacklistEntry PDA | External PDA: sss-token `["blacklist", config, dest_owner]` |

The destination owner is extracted from the destination token account's on-chain data at byte offset 32 (the `owner` field in the SPL Token account layout).

### Hook Execution Logic

```
Token-2022 invokes sss-transfer-hook::transfer_hook
    |
    v
Is authority == StablecoinConfig PDA?
  YES --> ALLOW (program-initiated transfer)
  NO  --> continue
    |
    v
Does source BlacklistEntry PDA exist?
(non-empty data, owned by sss-token)
  YES --> REJECT: SourceBlacklisted
  NO  --> continue
    |
    v
Does dest BlacklistEntry PDA exist?
(non-empty data, owned by sss-token)
  YES --> REJECT: DestinationBlacklisted
  NO  --> ALLOW transfer
```

The hook uses PDA existence checks. If a BlacklistEntry PDA is initialized and owned by sss-token, that address is blacklisted. If the PDA does not exist or has no data, the address is clean.

### Program-Initiated Transfers

When the StablecoinConfig PDA is the transfer authority (as it would be during a seize operation), the hook allows the transfer without blacklist checks. This prevents the hook from blocking privileged program operations.

## Blacklist Lifecycle

### Adding to Blacklist

```
blacklister calls blacklist_add(address, reason)
    |
    v
1. Validate: blacklister role, address != master authority
    |
    v
2. Create BlacklistEntry PDA: ["blacklist", config, address]
   Store: blocked_address, reason, blacklisted_by, timestamp
    |
    v
3. Freeze target's token account via Token-2022 CPI
   (Config PDA signs as freeze authority)
    |
    v
4. Emit BlacklistAdded event
5. Create AuditLogEntry
```

**Result:** The target address cannot send or receive tokens. The transfer hook rejects any transfer involving this address. The token account is frozen as an additional safeguard.

### Removing from Blacklist

```
blacklister calls blacklist_remove(address)
    |
    v
1. Validate: blacklister role
    |
    v
2. Close BlacklistEntry PDA (rent returned to authority)
    |
    v
3. Thaw target's token account via Token-2022 CPI
    |
    v
4. Emit BlacklistRemoved event
5. Create AuditLogEntry
```

**Result:** The address can transact normally again.

## Seize Mechanism

Seize recovers tokens from a blacklisted address. It cannot use `transfer_checked` because the transfer hook would reject the transfer (the source is blacklisted). Instead, seize uses a **burn+mint** pattern:

```
seizer calls seize(amount, from_account, to_account)
    |
    v
1. Validate: seizer role, target is blacklisted, amount > 0
    |
    v
2. Thaw the from_account (blacklisted accounts are frozen)
   Config PDA signs as freeze authority
    |
    v
3. Burn `amount` from from_account
   Config PDA signs as permanent delegate
    |
    v
4. Mint `amount` to to_account (treasury)
   Config PDA signs as mint authority
    |
    v
5. Re-freeze the from_account (still blacklisted)
    |
    v
6. Emit TokensSeized event
7. Create AuditLogEntry
```

### Why Burn+Mint Instead of Transfer

- `transfer_checked` would invoke the transfer hook, which blocks blacklisted sources
- The permanent delegate authority allows burning from any account without the holder's signature
- Burn increments `total_burned`, mint increments `total_minted`, so the net circulating supply is unchanged
- The full operation is atomic within a single transaction

### Accounts Required

| Account | Purpose |
|---------|---------|
| `authority` | Signer with seizer role |
| `config` | StablecoinConfig PDA |
| `role_registry` | RoleRegistry PDA (role verification) |
| `blacklist_entry` | BlacklistEntry PDA (proves target is blacklisted) |
| `mint` | Token-2022 mint account |
| `from_token_account` | Blacklisted address's token account |
| `to_token_account` | Treasury/destination token account |
| `token_program` | Token-2022 program |

## ExtraAccountMetaList Setup

The ExtraAccountMetaList is a PDA owned by the `sss-transfer-hook` program. It tells Token-2022 which additional accounts to resolve and pass when invoking the transfer hook.

### PDA

**Seeds:** `["extra-account-metas", mint.key()]`

**Program:** sss-transfer-hook (`FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy`)

### Contents (4 Extra Accounts)

| Index | Type | Account | Derivation |
|-------|------|---------|------------|
| 5 | Literal pubkey | sss-token program | `5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4` |
| 6 | External PDA | StablecoinConfig | sss-token: `["config", mint]` |
| 7 | External PDA | Source BlacklistEntry | sss-token: `["blacklist", config, authority]` |
| 8 | External PDA | Dest BlacklistEntry | sss-token: `["blacklist", config, dest_owner]` |

### Initialization

Call once per mint, after `initialize`:

```typescript
await client.initializeExtraAccountMetaList(mintKeypair.publicKey);
```

## GENIUS Act Reserve Attestation

SSS-2 includes on-chain reserve attestation for GENIUS Act compliance. The master authority submits attestations containing a hash of the off-chain reserve proof, the total reserves in USD, total outstanding tokens, and a URI to the full audit report.

### Attestation Data

| Field | Type | Description |
|-------|------|-------------|
| `reserve_hash` | `[u8; 32]` | SHA-256 hash of the off-chain reserve proof document |
| `total_reserves_usd` | `u64` | Total reserves in USD cents |
| `total_outstanding` | `u64` | Total outstanding stablecoins (base units) |
| `attestation_uri` | `String` (max 200) | URI to the full audit report |

### Verification

Anyone can verify an attestation on-chain:

1. Fetch the ReserveAttestation PDA by index
2. Compare `reserve_hash` to an independent hash of the off-chain document
3. Verify `attested_by` is a trusted authority
4. Check `total_reserves_usd >= total_outstanding` for adequate collateralization

See [COMPLIANCE.md](COMPLIANCE.md) for the recommended attestation schedule.

## Compliance Workflow

A typical SSS-2 compliance workflow:

### Day 0: Deployment

1. Initialize SSS-2 mint with master authority
2. Initialize ExtraAccountMetaList
3. Assign dedicated wallets for pauser, blacklister, seizer roles
4. Configure minters with appropriate quotas

### Ongoing: Sanctions Screening

1. Screen recipients against OFAC SDN list before minting
2. Monitor on-chain transfers for flagged addresses
3. Blacklist flagged addresses immediately upon identification
4. Seize tokens if required by court order or regulatory directive

### Monthly: Reserve Attestation

1. Obtain third-party audit of reserve assets
2. Compute SHA-256 hash of the audit report
3. Submit attestation via `attest_reserve`
4. Publish the audit report at the attestation URI

See [COMPLIANCE.md](COMPLIANCE.md) for the full compliance checklist and [OPERATIONS.md](OPERATIONS.md) for the operational runbook.

## Error Codes

In addition to the SSS-1 error codes, SSS-2 operations can produce:

| Code | Name | Trigger |
|------|------|---------|
| 6010 | BlacklistNotEnabled | Blacklist instruction on non-SSS-2 mint |
| 6011 | TransferHookNotEnabled | Transfer hook instruction on non-SSS-2 mint |
| 6013 | AlreadyBlacklisted | Address already has a BlacklistEntry |
| 6014 | NotBlacklisted | Trying to remove non-blacklisted address |
| 6015 | CannotBlacklistAuthority | Attempt to blacklist the master authority |

**Transfer hook errors** (from sss-transfer-hook):

| Code | Name | Trigger |
|------|------|---------|
| 6000 | SourceBlacklisted | Transfer from a blacklisted address |
| 6001 | DestinationBlacklisted | Transfer to a blacklisted address |

## Events

SSS-2 emits all SSS-1 events plus:

| Event | Trigger | Fields |
|-------|---------|--------|
| `BlacklistAdded` | `blacklist_add` | config, blocked_address, reason, blacklisted_by, timestamp |
| `BlacklistRemoved` | `blacklist_remove` | config, unblocked_address, removed_by, timestamp |
| `TokensSeized` | `seize` | config, from, amount, seized_by, timestamp |

## PDA Schema

SSS-2 uses all six PDA types from sss-token plus the ExtraAccountMetaList from sss-transfer-hook:

| PDA | Seeds | Program | SSS-2 Specific |
|-----|-------|---------|:-:|
| StablecoinConfig | `["config", mint]` | sss-token | |
| RoleRegistry | `["roles", config]` | sss-token | |
| MinterInfo | `["minter", config, wallet]` | sss-token | |
| BlacklistEntry | `["blacklist", config, address]` | sss-token | Yes |
| ReserveAttestation | `["reserve", config, index]` | sss-token | |
| AuditLogEntry | `["audit", config, index]` | sss-token | |
| ExtraAccountMetaList | `["extra-account-metas", mint]` | sss-transfer-hook | Yes |

## Comparison with SSS-1

| Capability | SSS-1 | SSS-2 |
|-----------|:---:|:---:|
| Mint / Burn | Yes | Yes |
| Freeze / Thaw | Yes | Yes |
| Pause / Unpause | Yes | Yes |
| Minter quotas | Yes | Yes |
| Role management | Yes | Yes |
| Reserve attestation | Yes | Yes |
| Audit log | Yes | Yes |
| Per-transfer blacklist enforcement | No | Yes |
| Permanent delegate (burn from any account) | No | Yes |
| Blacklist add/remove | No | Yes |
| Seize tokens | No | Yes |
| Default-frozen accounts (optional) | No | Yes |
| Programs required | 1 (sss-token) | 2 (sss-token + sss-transfer-hook) |
