# SSS-3: Allowlist Stablecoin Specification

**Status:** Draft
**Version:** 1.0
**Programs:**
- `sss-core` (`G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL`)
- `sss-transfer-hook` (`EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389`)

---

## Overview

SSS-3 extends SSS-2 with allowlist enforcement. It is designed for issuers who require explicit approval before any address can hold or transfer tokens. This is the most restrictive tier, suitable for securities tokens, permissioned stablecoins, or any asset where the issuer must maintain a strict registry of approved participants.

### How It Differs From SSS-2

SSS-3 includes everything in SSS-2 (permanent delegate, transfer hook, blacklist, seize, default frozen accounts) **plus** an allowlist system enforced on-chain.

| Feature | SSS-2 | SSS-3 |
|---------|-------|-------|
| Compliance enforcement | Blacklist (deny-list) | Blacklist + Allowlist (deny + allow) |
| Default transfer policy | Allow unless blacklisted | Deny unless allowlisted |
| Who can hold tokens | Anyone not blacklisted | Only explicitly approved addresses |
| Allowlist PDA accounts | N/A | `AllowlistEntry` per approved address |

### Token-2022 Extensions Enabled

Same as SSS-2:

| Extension | Purpose |
|-----------|---------|
| MetadataPointer | Points mint to itself as the metadata account |
| TokenMetadata | Stores name, symbol, URI on the mint |
| PermanentDelegate | Allows the config PDA to burn tokens from any account |
| TransferHook | Triggers blacklist/pause/allowlist check on every transfer |
| DefaultAccountState(Frozen) | New token accounts start frozen until approved |

---

## Allowlist System

### AllowlistEntry Account

```
Seeds: ["allowlist", config, address]
```

| Field | Type | Description |
|-------|------|-------------|
| config | Pubkey | The StablecoinConfig this entry belongs to |
| address | Pubkey | The allowlisted wallet address |
| added_at | i64 | Unix timestamp when added |
| added_by | Pubkey | Authority who added this address |
| bump | u8 | PDA bump seed |

### Instructions

#### `add_to_allowlist(address: Pubkey)`

Adds an address to the allowlist. Creates an `AllowlistEntry` PDA account.

**Access:** Authority only
**Requirements:**
- Config must have `enable_allowlist = true`
- Config must have `compliance_enabled = true`
- Address must not already be allowlisted

**Accounts:**
| Account | Type | Description |
|---------|------|-------------|
| authority | Signer | Must match `config.authority` |
| config | Account | StablecoinConfig PDA |
| allowlist_entry | Account (init) | AllowlistEntry PDA to create |
| system_program | Program | System Program |

#### `remove_from_allowlist(address: Pubkey)`

Removes an address from the allowlist. **Closes the AllowlistEntry account** and returns rent to the authority.

**Access:** Authority only
**Requirements:**
- AllowlistEntry must exist for this address
- Config must have `enable_allowlist = true`

**Accounts:**
| Account | Type | Description |
|---------|------|-------------|
| authority | Signer | Must match `config.authority` |
| config | Account | StablecoinConfig PDA |
| allowlist_entry | Account (close) | AllowlistEntry PDA to close |

### Transfer Hook Enforcement

When `enable_allowlist = true`, the transfer hook program checks:

1. **Sender** must have an active `AllowlistEntry` OR be the config PDA (for minting)
2. **Receiver** must have an active `AllowlistEntry`
3. Neither sender nor receiver can be blacklisted
4. The stablecoin must not be paused

If any check fails, the transfer is rejected.

---

## Lifecycle

### Initial Setup

1. Initialize with `compliance_enabled = true` and `enable_allowlist = true`
2. Grant necessary roles (Minter, Freezer, Blacklister, Seizer)
3. Add the authority itself to the allowlist
4. Add approved user addresses to the allowlist
5. Thaw user token accounts after KYC verification
6. Begin minting and transferring

### Adding a New Participant

1. Verify KYC/AML for the new address (off-chain)
2. Call `add_to_allowlist(new_address)` (on-chain)
3. Create the participant's ATA (it starts frozen by default)
4. Call `thaw_account` for the new ATA

### Removing a Participant

1. Optionally seize remaining tokens if required
2. Call `remove_from_allowlist(address)` to close the entry
3. The participant's ATA remains frozen by default

---

## Configuration Flags

```rust
StablecoinConfig {
    compliance_enabled: true,   // Required for SSS-3
    enable_allowlist: true,     // The SSS-3 differentiator
    // ... all other SSS-2 fields
}
```

### Validation Rules

- `enable_allowlist` can only be `true` if `compliance_enabled` is also `true`
- Attempting to initialize with `enable_allowlist = true` and `compliance_enabled = false` will fail

---

## Use Cases

- **Securities tokens**: Only registered shareholders can hold the token
- **Permissioned stablecoins**: CBDC-like tokens where every holder is KYC-verified
- **Fund tokens**: LP tokens restricted to accredited investors
- **Corporate payment rails**: Internal tokens restricted to approved vendors/partners

---

## Devnet Deployment

An SSS-3 stablecoin was deployed and tested on devnet:

- **Mint:** `HabX8jwtDqAw53BPiBBkAYNB1jS9NU9DrH6rLFT7JBqM`
- **Transactions:** See [DEVNET_EVIDENCE.md](../DEVNET_EVIDENCE.md) transactions #31-#39

### Tested Operations

| # | Operation | Result |
|---|-----------|--------|
| 31 | Initialize SSS-3 (allowlist + supply cap 10000) | Success |
| 32 | Grant minter role | Success |
| 33 | Grant freezer role | Success |
| 34 | Set unlimited minter quota | Success |
| 35 | Add authority to allowlist | Success |
| 36 | Add user1 to allowlist | Success |
| 37 | Add user2 to allowlist | Success |
| 38 | Remove user2 from allowlist | Success |
| 39 | Mint 1000 tokens within 10000 cap | Success |
