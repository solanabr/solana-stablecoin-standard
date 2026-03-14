# SSS-1: Minimal Stablecoin Specification

**Status:** Draft
**Version:** 1.0
**Program:** `sss-core` (`G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL`)

---

## Overview

SSS-1 is the minimal stablecoin preset. It provides core issuance functionality -- minting, burning, freezing, metadata -- without compliance features such as blacklists, transfer hooks, or default-frozen accounts.

SSS-1 is suitable for stablecoins that do not require on-chain transfer restrictions, internal-use tokens, or projects that want the simplest possible setup.

### Token-2022 Extensions Enabled

| Extension | Purpose |
|-----------|---------|
| MetadataPointer | Points mint to itself as the metadata account |
| TokenMetadata | Stores name, symbol, URI on the mint |

Extensions **not** enabled in SSS-1: PermanentDelegate, TransferHook, DefaultAccountState.

### What SSS-1 Can Do

- Mint tokens with role-based access and per-minter quotas
- Burn tokens (any holder can burn their own tokens)
- Freeze and thaw individual token accounts
- Pause and unpause all minting/burning
- Two-step authority transfer
- Update token metadata (name, symbol, URI, custom fields)
- Grant and revoke roles

### What SSS-1 Cannot Do

- Block transfers of a blacklisted address
- Seize tokens from an account
- Default-freeze new token accounts (KYC gating)
- Enforce compliance rules on transfers

---

## Initialization

The `initialize` instruction creates the mint and config PDA in a single transaction.

### Parameters

```rust
pub struct StablecoinConfigInput {
    pub name: String,          // max 32 chars
    pub symbol: String,        // max 10 chars
    pub uri: String,           // max 200 chars
    pub decimals: u8,          // 0-9 (default: 6)
    pub compliance_enabled: bool, // false for SSS-1
}
```

### Accounts Required

| Account | Type | Description |
|---------|------|-------------|
| authority | Signer (mut) | Pays for account creation, becomes the authority |
| mint | Signer (mut) | Fresh keypair generated client-side |
| config | PDA (init) | Derived from `["config", mint]` |
| system_program | Program | System program |
| token_2022_program | Program | Token-2022 program |
| rent | Sysvar | Rent sysvar |

### SDK Example

```typescript
import { SolanaStablecoin, Presets } from "@sss/core";

const { stablecoin, txSignature, mintKeypair } = await SolanaStablecoin.create(
  program,
  {
    preset: Presets.SSS_1,
    name: "USD Stablecoin",
    symbol: "USDS",
    decimals: 6,
    uri: "https://example.com/metadata.json",
  },
);

console.log("Mint:", mintKeypair.publicKey.toBase58());
console.log("Tx:", txSignature);
```

### CLI Example

```bash
sss-token init \
  --preset sss-1 \
  --name "USD Stablecoin" \
  --symbol USDS \
  --decimals 6 \
  --uri "https://example.com/metadata.json"
```

---

## Instructions

### mint_tokens

Mint new tokens to a recipient's token account.

**Required role:** Minter
**Paused check:** Yes

| Parameter | Type | Description |
|-----------|------|-------------|
| amount | u64 | Number of base units to mint |

| Account | Description |
|---------|-------------|
| minter | Signer with minter role |
| config | StablecoinConfig PDA |
| minter_role | RoleAssignment PDA for minter |
| minter_quota | MinterQuota PDA for minter |
| mint | Token-2022 mint |
| recipient_token_account | Recipient's token account |
| token_program | Token-2022 program |

**Quota enforcement:** Before minting, the instruction checks `minted_amount + amount <= quota_limit`. If `quota_limit == u64::MAX`, no limit is enforced.

```typescript
const tx = await stablecoin.mint({
  recipient: recipientTokenAccount,
  amount: new BN(1_000_000), // 1.0 USDS (6 decimals)
});
```

### burn_tokens

Burn tokens from the caller's own token account.

**Required role:** None (any holder can burn)
**Paused check:** Yes

| Parameter | Type | Description |
|-----------|------|-------------|
| amount | u64 | Number of base units to burn |

```typescript
const tx = await stablecoin.burn({
  amount: new BN(500_000),
});
```

### freeze_account

Freeze a specific token account, preventing it from sending or receiving tokens.

**Required role:** Freezer
**Paused check:** Yes

```typescript
const tx = await stablecoin.freezeAccount(targetTokenAccount);
```

### thaw_account

Thaw a previously frozen token account, restoring transfer capability.

**Required role:** Freezer
**Paused check:** Yes

```typescript
const tx = await stablecoin.thawAccount(targetTokenAccount);
```

### pause

Pause the stablecoin globally. Blocks minting, burning, freezing, thawing, and (for SSS-2) all transfers.

**Required role:** Authority only
**Precondition:** Must not already be paused

```typescript
const tx = await stablecoin.pause();
```

### unpause

Unpause the stablecoin.

**Required role:** Authority only
**Precondition:** Must be paused

```typescript
const tx = await stablecoin.unpause();
```

### set_metadata

Update a metadata field on the mint.

**Required role:** Authority only

| Parameter | Type | Description |
|-----------|------|-------------|
| field | String | Field name ("name", "symbol", "uri", or custom key) |
| value | String | New value |

```typescript
const tx = await stablecoin.setMetadata("name", "Updated Stablecoin Name");
```

---

## Role System

SSS-1 uses the following roles:

| Role | Byte | Used In SSS-1 |
|------|------|---------------|
| Admin | 0 | Reserved |
| Minter | 1 | Yes -- required for `mint_tokens` |
| Pauser | 2 | Reserved |
| Freezer | 3 | Yes -- required for `freeze_account`, `thaw_account` |
| Blacklister | 4 | No (SSS-2 only) |
| Seizer | 5 | No (SSS-2 only) |

Attempting to grant Blacklister (4) or Seizer (5) on an SSS-1 mint returns `ComplianceNotEnabled`.

### Granting a Role

```typescript
import { ROLE_MINTER, ROLE_FREEZER } from "@sss/core";

// Grant minter role
await stablecoin.roles.grantRole(ROLE_MINTER, minterAddress);

// Grant freezer role
await stablecoin.roles.grantRole(ROLE_FREEZER, freezerAddress);
```

### Revoking a Role

```typescript
await stablecoin.roles.revokeRole(ROLE_MINTER, minterAddress);
```

Revoking a role closes the RoleAssignment PDA and returns the rent to the authority.

### Checking a Role

```typescript
const hasMinterRole = await stablecoin.roles.hasRole(ROLE_MINTER, address);
```

---

## Quota Enforcement

Every minter has a quota tracked by a MinterQuota PDA. The authority must set a quota before the minter can mint.

### Setting a Quota

```typescript
await stablecoin.roles.setQuota(
  minterAddress,
  new BN(10_000_000_000), // 10,000 USDS (6 decimals)
);
```

### Checking a Quota

```typescript
const quota = await stablecoin.roles.getQuota(minterAddress);
if (quota) {
  console.log("Limit:", quota.quotaLimit.toString());
  console.log("Used:", quota.mintedAmount.toString());
  console.log("Remaining:", quota.quotaLimit.sub(quota.mintedAmount).toString());
}
```

### Unlimited Quota

Set `quota_limit` to `u64::MAX` (18446744073709551615) for unlimited minting:

```typescript
await stablecoin.roles.setQuota(minterAddress, new BN("18446744073709551615"));
```

### Quota Lifecycle

1. Authority grants minter role: `grant_role(ROLE_MINTER, minter)`
2. Authority sets quota: `set_quota(minter, limit)`
3. Minter mints tokens: `mint_tokens(amount)` -- quota checked
4. Quota can be updated without resetting `minted_amount`
5. Authority revokes minter role: `revoke_role(ROLE_MINTER, minter)`

---

## Two-Step Authority Transfer

Authority transfer requires two transactions to prevent accidental loss.

### Step 1: Propose

The current authority proposes a new authority:

```typescript
await stablecoin.proposeAuthority(newAuthorityPubkey);
```

### Step 2: Accept

The proposed authority accepts (must sign the transaction):

```typescript
// Called by the new authority's wallet
await stablecoin.acceptAuthority();
```

### Cancel

The current authority can cancel a pending transfer:

```typescript
await stablecoin.cancelAuthorityTransfer();
```

---

## Account Structures (SSS-1)

### StablecoinConfig (187 bytes)

For SSS-1 mints:
- `compliance_enabled = false`
- `transfer_hook_program = Pubkey::default()` (all zeros)
- `paused` controls minting/burning but not transfers (no transfer hook)

### RoleAssignment (106 bytes)

Only roles 0-3 are valid for SSS-1.

### MinterQuota (121 bytes)

Identical for SSS-1 and SSS-2.

---

## Events

SSS-1 operations emit the following events:

| Event | Fields |
|-------|--------|
| `StablecoinInitialized` | config, authority, mint, name, symbol, decimals, compliance_enabled |
| `TokensMinted` | config, minter, recipient, amount |
| `TokensBurned` | config, burner, amount |
| `AccountFrozen` | config, target, freezer |
| `AccountThawed` | config, target, freezer |
| `StablecoinPaused` | config, pauser |
| `StablecoinUnpaused` | config, pauser |
| `AuthorityTransferred` | config, previous_authority, new_authority |
| `RoleGranted` | config, role, holder, grantor |
| `RoleRevoked` | config, role, holder, revoker |
| `QuotaSet` | config, minter, quota_limit |

---

## Error Codes

| Error | Code | Meaning |
|-------|------|---------|
| Paused | 6000 | Stablecoin is paused |
| Unauthorized | 6001 | Caller lacks the required role |
| QuotaExceeded | 6002 | Mint amount would exceed minter's quota |
| ZeroAmount | 6003 | Amount must be > 0 |
| ComplianceNotEnabled | 6004 | SSS-2 feature used on SSS-1 mint |
| NameTooLong | 6008 | Name exceeds 32 characters |
| SymbolTooLong | 6009 | Symbol exceeds 10 characters |
| UriTooLong | 6010 | URI exceeds 200 characters |
| InvalidDecimals | 6011 | Decimals must be <= 9 |
| MathOverflow | 6012 | Arithmetic overflow |
| InvalidRole | 6013 | Role byte not in range 0-5 |
| AlreadyPaused | 6014 | Already paused |
| NotPaused | 6015 | Not paused |
| NoPendingAuthority | 6019 | No pending authority transfer |
