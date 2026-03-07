# SSS-2: Compliant Stablecoin Standard

**Version:** 1.0
**Status:** Final

## Overview

SSS-2 extends SSS-1 with permanent delegate authority and a transfer hook that enforces blacklist checks on **every token transfer**. This makes SSS-2 suitable for regulated stablecoins where regulators expect on-chain enforcement (comparable to USDC and USDT compliance models).

**Use cases:**
- Regulated stablecoins (USDC/USDT class)
- Issuers subject to OFAC, FinCEN, or similar sanctions regimes
- Any stablecoin where the issuer must be able to block transfers and seize tokens

**SSS-2 compliance is proactive.** Every transfer is checked against the blacklist via the transfer hook — there are no gaps in enforcement.

## Extensions vs SSS-1

| Extension | SSS-1 | SSS-2 | Purpose |
|-----------|-------|-------|---------|
| `MintCloseAuthority` | ✓ | ✓ | Close mint at zero supply |
| `MetadataPointer` | ✓ | ✓ | Inline metadata |
| `TokenMetadata` | ✓ | ✓ | On-chain name/symbol/uri |
| `PermanentDelegate` | ✗ | ✓ | Config PDA can transfer from any account |
| `TransferHook` | ✗ | ✓ | Calls sss-transfer-hook on every transfer |

## Additional Accounts

### BlacklistEntry PDA
Seeds: `["blacklist", mint, address]`

The **existence** of this account means the address is blacklisted. The transfer hook checks for existence only — no deserialization in the hot path.

| Field | Type | Description |
|-------|------|-------------|
| `mint` | `Pubkey` | Associated mint |
| `address` | `Pubkey` | Blacklisted address |
| `reason` | `String` | Reason string (max 128 bytes) |
| `timestamp` | `i64` | Unix timestamp when blacklisted |
| `blacklister` | `Pubkey` | Who blacklisted this address |

### ExtraAccountMetaList PDA
Seeds: `["extra-account-metas", mint]` — owned by `sss-transfer-hook`

Registers the blacklist PDAs as required extra accounts for every transfer. Written during `initialize_extra_account_meta_list`.

## SSS-2 Additional Instructions

### `add_to_blacklist(address, reason)`
Creates a `BlacklistEntry` PDA for the given address.

**Signers:** `blacklister`

**Guards:**
- `config.preset == 2`
- `has_blacklist_authority(blacklister)`
- Account doesn't already exist (Anchor `init` constraint)

**Effects:** Address immediately blocked from all transfers.

### `remove_from_blacklist(address)`
Closes the `BlacklistEntry` PDA. Rent returned to `blacklister`.

**Signers:** `blacklister`

### `seize(amount)`
Transfers tokens from a frozen account to a treasury account using the permanent delegate.

**Signers:** `seizer`

**Guards:**
- `config.preset == 2`
- `has_seize_authority(seizer)`

**Implementation:** CPI to `token_2022::transfer_checked` with `StablecoinConfig` PDA signing as the permanent delegate.

## Transfer Hook Protocol

The `sss-transfer-hook` program must be deployed independently. Its program ID is registered in the mint's `TransferHook` extension during `initialize`.

For every SSS-2 token transfer:
1. Token-2022 reads the `TransferHook` extension from the mint
2. Fetches the `ExtraAccountMetaList` PDA (registered by `initialize_extra_account_meta_list`)
3. Resolves the blacklist PDAs for sender and receiver
4. Calls `sss-transfer-hook::execute(...)` with all extra accounts
5. If either blacklist PDA exists → transfer fails with `SenderBlacklisted` or `RecipientBlacklisted`

## SSS-2 Role Summary

| Role | Field | Capability |
|------|-------|------------|
| Master authority | `config.authority` | All operations |
| Blacklister | `config.blacklister` | `add_to_blacklist`, `remove_from_blacklist` |
| Seizer | `config.seizer` | `seize` |

## CLI Quick Reference

```bash
# Initialize
sss-token init --preset sss-2 --name "Compliant USD" --symbol CUSD --decimals 6

# All SSS-1 operations plus:
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token blacklist list
sss-token blacklist check <address>
sss-token seize --from <token-account> --to <treasury-token-account> --amount <n>
sss-token audit-log [--action <blacklist|seize|freeze>]
```

## Comparison with USDC/USDT

| Capability | USDC | SSS-2 |
|-----------|------|-------|
| Freeze individual account | ✓ | ✓ |
| Block all transfers from address | ✓ | ✓ |
| Seize funds | ✓ | ✓ |
| On-chain blacklist | Partial | ✓ (PDA per address) |
| Enforcement on every transfer | ✓ (via hook) | ✓ (via hook) |
| Open source | Partial | ✓ |
