# SSS-2: Compliant Stablecoin Specification

**Status:** Draft
**Version:** 1.0
**Programs:**
- `sss-core` (`G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL`)
- `sss-transfer-hook` (`EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389`)

---

## Overview

SSS-2 extends SSS-1 with full regulatory compliance features. It is designed for issuers who must enforce blacklists, seize assets from sanctioned accounts, gate transfers behind KYC, and block transfers when the system is paused.

SSS-2 adds three Token-2022 extensions, two additional roles, and five additional on-chain capabilities on top of everything in SSS-1.

### Token-2022 Extensions Enabled

| Extension | Purpose |
|-----------|---------|
| MetadataPointer | Points mint to itself as the metadata account |
| TokenMetadata | Stores name, symbol, URI on the mint |
| PermanentDelegate | Allows the config PDA to burn tokens from any account |
| TransferHook | Triggers blacklist/pause check on every transfer |
| DefaultAccountState(Frozen) | New token accounts start frozen (KYC gating) |

### Additional Capabilities Over SSS-1

| Feature | Description |
|---------|-------------|
| Blacklist | Block addresses from sending or receiving tokens |
| Transfer hook enforcement | Every transfer checked for blacklist + pause |
| Asset seizure | Atomic thaw-burn-refreeze-mint to recover assets from sanctioned accounts |
| KYC gating | New accounts default to frozen; must be thawed after KYC |
| Transfer pause | Pausing blocks all transfers, not just mint/burn |

---

## Initialization

SSS-2 initialization is identical to SSS-1 but with `compliance_enabled: true`. This triggers creation of the additional extensions.

```typescript
import { SolanaStablecoin, Presets } from "@sss/core";

const { stablecoin, txSignature, mintKeypair } = await SolanaStablecoin.create(
  program,
  {
    preset: Presets.SSS_2,
    name: "Regulated USD",
    symbol: "RUSD",
    decimals: 6,
    uri: "https://example.com/rusd.json",
  },
);
```

```bash
sss-token init \
  --preset sss-2 \
  --name "Regulated USD" \
  --symbol RUSD \
  --decimals 6
```

After initialization, the transfer hook ExtraAccountMetaList must be initialized separately:

```bash
# This is done via the sss-transfer-hook program
# The SDK handles this automatically in future versions
```

---

## Compliance Features

### Blacklist

The blacklist prevents sanctioned addresses from sending or receiving tokens. Enforcement happens at two levels:

1. **On-chain PDA existence** -- A `BlacklistEntry` PDA is created when an address is blacklisted and closed when unblacklisted.
2. **Transfer hook** -- On every transfer, the hook checks both sender and receiver blacklist PDAs. If either exists, the transfer is blocked.

#### Adding to Blacklist

**Required role:** Blacklister

```typescript
await stablecoin.compliance.addToBlacklist(sanctionedAddress);
```

```bash
sss-token blacklist add <address> --reason "OFAC SDN list"
```

#### Removing from Blacklist

**Required role:** Blacklister

```typescript
await stablecoin.compliance.removeFromBlacklist(address);
```

```bash
sss-token blacklist remove <address>
```

#### Checking Blacklist Status

```typescript
const isBlacklisted = await stablecoin.compliance.isBlacklisted(address);
```

```bash
sss-token blacklist check <address>
```

### Transfer Hook Enforcement

The transfer hook program (`sss-transfer-hook`) is invoked by Token-2022 on every `transfer`, `transfer_checked`, and similar instructions. It performs three checks:

1. **Config readability** -- If the config PDA cannot be read, the transfer is blocked (fail-closed).
2. **Pause check** -- Reads the `paused` byte at offset 136 in the config account data. If `1`, the transfer is blocked.
3. **Sender blacklist check** -- If the sender's blacklist PDA exists and is owned by sss-core, the transfer is blocked.
4. **Receiver blacklist check** -- If the receiver's blacklist PDA exists and is owned by sss-core, the transfer is blocked.

#### ExtraAccountMetaList

The transfer hook uses `ExtraAccountMetaList` to tell Token-2022 which additional accounts to resolve and pass:

| Extra Account | Derivation |
|--------------|-----------|
| Config PDA | `PDA(sss-core, ["config", mint])` |
| Sender blacklist | `PDA(sss-core, ["blacklist", config, owner_of(source_token_account)])` |
| Receiver blacklist | `PDA(sss-core, ["blacklist", config, owner_of(dest_token_account)])` |
| sss-core program | Literal pubkey |

The sender/receiver owner addresses are extracted at runtime using `Seed::AccountData` -- reading the owner pubkey (bytes 32-63) from the SPL Token account data.

#### Dual-Entry Pattern

Token-2022 invokes hooks with the SPL Transfer Hook Interface discriminator, not Anchor's. The hook implements both:

- **`execute()`** -- Anchor entry, used for direct calls and testing
- **`fallback()`** -- SPL interface entry, used by Token-2022 at runtime

Both call the same `execute_checks()` function.

#### Fail-Closed Behavior

If the config PDA is not owned by sss-core or has no data, the hook returns `InvalidConfig` and blocks the transfer. This prevents transfers if the program state is corrupted or if someone provides an invalid config account.

### Default Frozen Accounts (KYC Gating)

With `DefaultAccountState::Frozen`, every new token account for this mint is created in a frozen state. The workflow:

1. User creates a token account (e.g., via ATA) -- account is frozen
2. User completes KYC off-chain
3. Freezer role holder thaws the account: `thaw_account`
4. User can now send and receive tokens

This ensures no tokens can move to or from unverified accounts.

```typescript
// After KYC verification, thaw the user's account
await stablecoin.thawAccount(userTokenAccount);
```

---

## Asset Seizure

The `seize` instruction implements atomic asset recovery from a blacklisted, frozen account. This mirrors how USDC and PYUSD handle court-ordered seizures on-chain.

### Prerequisites

1. The target address must be blacklisted (BlacklistEntry PDA exists)
2. Caller must have the Seizer role
3. Stablecoin must not be paused
4. `compliance_enabled` must be true

### Atomic Flow

The seize instruction executes four operations in a single transaction:

```
Step 1: Thaw the source token account
  -> Config PDA signs as freeze authority
  -> Required because DefaultAccountState::Frozen means the account is frozen

Step 2: Burn tokens from the source account
  -> Config PDA signs as permanent delegate
  -> Burns `amount` tokens, reducing supply

Step 3: Refreeze the source account
  -> Config PDA signs as freeze authority
  -> Maintains the frozen-by-default invariant

Step 4: Mint equivalent tokens to treasury
  -> Config PDA signs as mint authority
  -> Mints `amount` tokens to the designated treasury account
  -> Restores supply to pre-seize level
```

**Net supply effect:** Zero. `total_minted` and `total_burned` both increase by `amount`, so `total_minted - total_burned` remains constant.

### Accounts Required

| Account | Description |
|---------|-------------|
| seizer | Signer with Seizer role |
| config | StablecoinConfig PDA |
| seizer_role | RoleAssignment PDA for seizer |
| blacklist_entry | BlacklistEntry PDA for target owner |
| target_owner | Owner wallet of the source token account |
| mint | Token-2022 mint |
| source_token_account | Token account of the blacklisted address |
| treasury_token_account | Token account to receive seized tokens |
| token_program | Token-2022 program |

### SDK Example

```typescript
await stablecoin.compliance.seize({
  from: sourceTokenAccount,
  to: treasuryTokenAccount,
  amount: new BN(1_000_000),
  targetOwner: blacklistedWallet,
});
```

### CLI Example

```bash
sss-token seize <blacklisted-owner> \
  --to <treasury-owner> \
  --amount 1000000
```

---

## Additional Roles

SSS-2 adds two roles on top of those available in SSS-1:

| Role | Byte | Capabilities |
|------|------|-------------|
| Blacklister | 4 | `add_to_blacklist`, `remove_from_blacklist` |
| Seizer | 5 | `seize` |

These roles can only be granted when `compliance_enabled == true`.

### Granting SSS-2 Roles

```typescript
import { ROLE_BLACKLISTER, ROLE_SEIZER } from "@sss/core";

await stablecoin.roles.grantRole(ROLE_BLACKLISTER, complianceOfficer);
await stablecoin.roles.grantRole(ROLE_SEIZER, legalTeamWallet);
```

### Role Separation

SSS-2 enforces separation of duties:

- **Blacklister** can add/remove addresses from the blacklist but cannot seize tokens
- **Seizer** can seize tokens from blacklisted addresses but cannot add/remove from the blacklist
- **Freezer** can freeze/thaw accounts but cannot blacklist or seize
- **Authority** manages all roles but does not directly perform compliance operations

This separation ensures no single key can unilaterally blacklist and seize an address.

---

## All SSS-2 Instructions

SSS-2 includes all 22 instructions. The SSS-2-specific instructions are:

| Instruction | Role Required | Description |
|-------------|--------------|-------------|
| `add_to_blacklist(address)` | Blacklister | Create BlacklistEntry PDA |
| `remove_from_blacklist(address)` | Blacklister | Close BlacklistEntry PDA |
| `seize(amount)` | Seizer | Atomic thaw-burn-refreeze-mint |

All SSS-1 instructions (mint, burn, freeze, thaw, pause, unpause, authority transfer, roles, quota, metadata) work identically in SSS-2.

---

## Error Codes (SSS-2 Specific)

| Error | Code | Meaning |
|-------|------|---------|
| ComplianceNotEnabled | 6004 | SSS-2 feature used on SSS-1 mint |
| AlreadyBlacklisted | 6005 | Address is already on the blacklist |
| NotBlacklisted | 6006 | Address is not on the blacklist |
| Blacklisted | 6007 | Target account is blacklisted |
| SeizeNonBlacklisted | 6016 | Cannot seize from a non-blacklisted address |

Transfer hook errors:

| Error | Meaning |
|-------|---------|
| SenderBlacklisted | Sender's wallet is on the blacklist |
| ReceiverBlacklisted | Receiver's wallet is on the blacklist |
| StablecoinPaused | All transfers blocked during pause |
| InvalidConfig | Config PDA unreadable (fail-closed) |

---

## Events (SSS-2 Specific)

| Event | Fields |
|-------|--------|
| `AddressBlacklisted` | config, address, blacklister |
| `AddressUnblacklisted` | config, address, blacklister |
| `TokensSeized` | config, from, to, amount, seizer |

---

## SSS-1 vs SSS-2 Comparison

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Mint/Burn | Yes | Yes |
| Freeze/Thaw | Yes | Yes |
| Pause | Mint/Burn only | Mint/Burn + all transfers |
| Metadata | Yes | Yes |
| Roles | Minter, Freezer | Minter, Freezer, Blacklister, Seizer |
| Blacklist | No | Yes |
| Transfer hook | No | Yes |
| Asset seizure | No | Yes |
| Default frozen | No | Yes (KYC gating) |
| Permanent delegate | No | Yes |
| New account state | Initialized (active) | Frozen |
| Transfer restrictions | None | Blacklist + pause |
