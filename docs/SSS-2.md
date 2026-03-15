# SSS-2: Compliant Stablecoin Standard

## Overview

SSS-2 extends SSS-1 with compliance features required for regulated stablecoin operations: blacklist enforcement via transfer hooks and asset seizure via permanent delegate.

## Additional Features (over SSS-1)

- **Permanent Delegate Extension** — allows the config PDA to transfer tokens from any account
- **Transfer Hook Program** — separate program that validates every transfer against a blacklist
- **Blacklist PDAs** — per-address accounts indicating blocked addresses
- **Seize Instruction** — transfer tokens from blacklisted accounts to a treasury

## Token-2022 Extensions Used

| Extension | Purpose |
|-----------|---------|
| MetadataPointer | On-chain token metadata |
| PermanentDelegate | Config PDA can transfer from any account |
| TransferHook | Points to the blacklist enforcement program |

## Additional Account Structure

### BlacklistEntry PDA

Seeds: `[b"blacklist", mint_pubkey, flagged_address]`

Created when an address is blacklisted. Existence of this account is checked by the transfer hook during every transfer.

### ExtraAccountMetas PDA

Seeds: `[b"extra-account-metas", mint_pubkey]` (owned by transfer hook program)

Stores the TLV-encoded list of extra accounts that Token-2022 resolves on every `transfer_checked` call. Contains three extra account definitions:
- **Source blacklist entry PDA** — derived from source owner extracted at token data offset 32
- **Destination blacklist entry PDA** — derived from destination owner
- **Stablecoin program ID** — for external PDA derivation

## Setup Flow

1. **Initialize SSS-2 stablecoin** — creates mint with TransferHook + PermanentDelegate + FreezeAuthority extensions
2. **Initialize extra account metas** — sets up the hook's account resolution PDA (required for blacklist enforcement)
3. Ready for compliant operations — all transfers checked against blacklist

The SDK `SolanaStablecoin.create()` auto-performs both steps for SSS-2. Manual init:

```typescript
await stablecoin.compliance.initializeTransferHook();
```

CLI: `sss-token init-hook --mint <ADDRESS>`

## Transfer Hook Enforcement

When Token-2022 processes a `transfer_checked`, it CPIs into the hook program which:
1. Extracts source/destination wallet owners from token account data (offset 32)
2. Derives blacklist PDAs: `[b"blacklist", mint, owner]` on the stablecoin program
3. Checks if either PDA exists, has data, and is owned by the stablecoin program
4. **Rejects** the transfer if either party is blacklisted

## Additional Instructions

| Instruction | Required Role | Description |
|-------------|---------------|-------------|
| `add_to_blacklist` | ComplianceOfficer | Create a blacklist entry for an address |
| `remove_from_blacklist` | ComplianceOfficer | Close a blacklist entry |
| `seize` | ComplianceOfficer | Transfer tokens from a blacklisted account |

## Transfer Hook Flow

When a transfer is initiated on an SSS-2 mint:

1. Token-2022 processes the transfer normally
2. Token-2022 detects the TransferHook extension and CPIs into the hook program
3. The hook program receives the source, mint, and destination accounts
4. The hook derives blacklist PDAs for both source and destination
5. If either PDA exists and contains data → transfer is **rejected**
6. If neither PDA exists → transfer is **allowed**

### Extra Account Metas

The transfer hook declares two extra accounts via the `ExtraAccountMetaList`:

1. Source blacklist PDA (derived from mint + source owner)
2. Destination blacklist PDA (derived from mint + destination owner)

These are resolved dynamically by Token-2022 before invoking the hook.

## Seize Mechanism

The seize instruction uses the permanent delegate authority (config PDA) to transfer tokens from a blacklisted account:

1. Verify caller has ComplianceOfficer role
2. Verify the source account owner is blacklisted (BlacklistEntry PDA exists)
3. CPI `transfer_checked` with config PDA as the authority (permanent delegate)
4. Tokens move from the blacklisted account to the specified destination (treasury)

## Feature Gating

SSS-2 instructions check `config.is_compliance_enabled()` before executing. If a mint was initialized as SSS-1, compliance instructions return `ComplianceNotEnabled` error.

## Compliance Workflow

```
1. Suspicious activity detected
        │
        ▼
2. Compliance officer adds address to blacklist
   sss-token blacklist add --address <ADDR>
        │
        ▼
3. All transfers to/from blacklisted address are blocked
   (enforced automatically by transfer hook)
        │
        ▼
4. Compliance officer seizes remaining tokens
   sss-token seize --from <ATA> --to <TREASURY> --amount <AMT>
        │
        ▼
5. (Optional) Remove from blacklist after resolution
   sss-token blacklist remove --address <ADDR>
```
