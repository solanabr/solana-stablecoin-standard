# SSS-2: Compliant Stablecoin Preset

## Overview

SSS-2 is the fully-compliant preset of the Solana Stablecoin Standard. It is a
strict superset of SSS-1: every instruction from SSS-1 is present, and three
additional Token-2022 extensions plus two additional roles and three additional
instructions are layered on top. SSS-2 is designed for regulated stablecoins
that require on-chain blacklisting, asset seizure, and default-frozen accounts.

SSS program ID: `E7iCiXrkudyt5j1nVHHmbuqCEyLP2hD4VGNJyuPAdWwP`
Transfer Hook program ID: `6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY`

## Token-2022 Extensions (SSS-2)

SSS-2 sets `enablePermanentDelegate=true`, `enableTransferHook=true`, and
`enableDefaultFrozen=true`. `initialize` adds the following extensions in order:

| Extension              | Operational Effect                                                |
|------------------------|-------------------------------------------------------------------|
| `MetadataPointer`      | Points mint to itself as its own metadata account (same as SSS-1)|
| `PermanentDelegate`    | Sets `StablecoinConfig` PDA as the permanent delegate; enables the config PDA to transfer tokens from any account without the owner's signature — required for `seize` |
| `TransferHook`         | Registers `6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY` as the hook program; every `transfer_checked` CPI invokes `execute` on that program before completing |
| `DefaultAccountState(Frozen)` | All newly created token accounts (ATAs) begin in the `Frozen` state; they cannot receive tokens until thawed by the freeze authority (the `StablecoinConfig` PDA) |
| `TokenMetadata`        | Stores `name`, `symbol`, `uri` inline in the mint (same as SSS-1)|

During `initialize` for SSS-2, two `remaining_accounts` must be passed:
- `[0]` — hook program account (readonly)
- `[1]` — `ExtraAccountMetaList` PDA (writable), derived as
  `["extra-account-metas", mint]` under the hook program

A CPI to `initialize_extra_account_meta_list` on the hook program creates this
PDA, which Token-2022 reads at transfer time to resolve the three extra accounts
the hook requires.

## Transfer Hook: `execute.rs`

Every `transfer_checked` on an SSS-2 mint triggers `execute` in the hook program.
The hook receives five mandatory accounts plus three extra accounts resolved from
`ExtraAccountMetaList`:

| Position              | Account                       | Validation                                              |
|-----------------------|-------------------------------|---------------------------------------------------------|
| Standard [0]          | `source_token_account`        | Must have `token::mint = mint`                          |
| Standard [1]          | `mint`                        | The SSS-2 mint                                          |
| Standard [2]          | `destination_token_account`   | Must have `token::mint = mint`                          |
| Standard [3]          | `source_authority`            | Actual transfer authority (wallet or config PDA on seize)|
| Standard [4]          | `extra_account_meta_list`     | Validated by seeds `["extra-account-metas", mint]`     |
| Extra [0] (remaining[0]) | sss-token program          | Program account                                         |
| Extra [1] (remaining[1]) | sender blacklist PDA       | `["blacklist", mint, source_authority]` under sss-token |
| Extra [2] (remaining[2]) | recipient blacklist PDA    | `["blacklist", mint, dest_token_account.owner]` under sss-token |

The hook validates PDA addresses by recomputing them with
`Pubkey::find_program_address` and comparing against the passed accounts.
Blacklist presence is determined by lamport balance: if a blacklist PDA has
`lamports > 0`, the account exists and the transfer is rejected.

- Sender blacklisted: returns `HookError::SenderBlacklisted`
- Recipient blacklisted: returns `HookError::RecipientBlacklisted`

During `seize`, the `source_authority` passed to Token-2022 is the
`StablecoinConfig` PDA. The hook therefore checks whether the config PDA itself
is blacklisted (it never is), allowing the seize transfer to pass hook validation
regardless of the source wallet's blacklist status.

## PDA Seeds

| Account               | Seeds                                              | Program         |
|-----------------------|----------------------------------------------------|-----------------|
| `StablecoinConfig`    | `["stablecoin", mint]`                             | `sss-token`     |
| `RoleManager`         | `["roles", stablecoin_config]`                     | `sss-token`     |
| `MinterInfo`          | `["minter", stablecoin_config, minter_wallet]`     | `sss-token`     |
| `BlacklistEntry`      | `["blacklist", mint, target_address]`              | `sss-token`     |
| `ExtraAccountMetaList`| `["extra-account-metas", mint]`                    | `transfer-hook` |

## `BlacklistEntry` Account

Anchor account. Space: `BlacklistEntry::LEN`. One PDA per (mint, address) pair.
Closing the account (lamports → 0) removes the address from the blacklist.

| Field           | Type     | Description                                         |
|-----------------|----------|-----------------------------------------------------|
| `address`       | `Pubkey` | The blacklisted wallet address                      |
| `stablecoin`    | `Pubkey` | Key of the `StablecoinConfig` (not the mint)        |
| `reason`        | `String` | Human-readable reason (max 64 chars)                |
| `blacklisted_at`| `i64`    | Unix timestamp when blacklisted (`Clock::unix_timestamp`) |
| `blacklisted_by`| `Pubkey` | Signer that created this entry                      |
| `bump`          | `u8`     | PDA canonical bump                                  |

## Role Model (SSS-2 Additions)

SSS-2 adds two roles to the `RoleManager` that are guarded by
`require!(config.enable_permanent_delegate, ComplianceNotEnabled)`:

| Role          | Stored in                  | Max | Capabilities                            |
|---------------|----------------------------|-----|-----------------------------------------|
| `blacklister` | `RoleManager.blacklisters` | 5   | `add_to_blacklist`, `remove_from_blacklist` |
| `seizer`      | `RoleManager.seizers`      | 5   | `seize`                                 |

The `authority` always implicitly satisfies both blacklister and seizer checks.
`add_role(Blacklister, ...)` and `add_role(Seizer, ...)` both revert with
`ComplianceNotEnabled` if called against an SSS-1 mint.

## Additional Instructions

### `add_to_blacklist`

**Signer:** `blacklister` (must be `authority` OR in `RoleManager.blacklisters`)

1. Require `config.enable_permanent_delegate` (else `ComplianceNotEnabled`).
2. Require `reason.len() <= 64` (else `ReasonTooLong`).
3. Init `BlacklistEntry` PDA at seeds `["blacklist", mint, address]`.
4. Populate all fields; set `blacklisted_at = Clock::unix_timestamp`.
5. Emit `BlacklistAdded` event.

The PDA's existence (non-zero lamports) is what the transfer hook reads.
No separate on-chain flag is set.

### `remove_from_blacklist`

**Signer:** `blacklister` (must be `authority` OR in `RoleManager.blacklisters`)

1. Require `config.enable_permanent_delegate`.
2. Close the `BlacklistEntry` PDA — lamports returned to the `blacklister`.
3. Emit `BlacklistRemoved` event.

Closing the account sets its lamports to 0; the hook sees lamports = 0 and
treats the address as not blacklisted. Transfers are unblocked immediately.

### `seize`

**Signer:** `seizer` (must be `authority` OR in `RoleManager.seizers`)

**Precondition:** `source_token_account.is_frozen() == true`

Seize flow (exact order in `seize.rs`):

1. Require `amount > 0`.
2. Require `config.enable_permanent_delegate`.
3. Require signer is `authority` or in `seizers`.
4. Require `source_token_account.is_frozen()` (else `AccountNotFrozen`).
5. CPI `thaw_account` signed by `StablecoinConfig` PDA — Token-2022 rejects
   transfers from frozen accounts even with a permanent delegate.
6. CPI `invoke_transfer_checked` — `StablecoinConfig` PDA is the authority
   (permanent delegate), `remaining_accounts` supply hook extra accounts.
   The hook validates the config PDA as `source_authority` (not blacklisted),
   so the transfer clears hook validation.
7. CPI `freeze_account` signed by `StablecoinConfig` PDA — re-freezes the
   source account so it remains locked after seizure.
8. Emit `TokensSeized` event.

The destination account (treasury) must exist and be thawed before `seize` is
called; the instruction does not thaw the destination.

## `DefaultAccountState(Frozen)` Implications

Because `DefaultAccountState` is set to `Frozen`:

- Every newly created ATA starts frozen and cannot receive a transfer.
- Before minting to a new recipient, the caller must:
  1. Create the ATA (e.g., via `createAssociatedTokenAccount`).
  2. Call `thaw_account` (signed by authority or a pauser via the config PDA).
  3. Then call `mint_tokens`.
- If `mint_tokens` uses `init_if_needed`, the ATA is created on-chain but is
  still frozen; the mint CPI will fail because the destination is frozen. The
  thaw step is always required.
- Accounts frozen by `DefaultAccountState` are thawed identically to manually
  frozen accounts — `thaw_account` signed by the freeze authority (config PDA).

## SSS-1 vs SSS-2 Comparison

| Feature                      | SSS-1   | SSS-2   |
|------------------------------|---------|---------|
| `MetadataPointer`            | Yes     | Yes     |
| `TokenMetadata`              | Yes     | Yes     |
| `PermanentDelegate`          | No      | Yes     |
| `TransferHook`               | No      | Yes     |
| `DefaultAccountState(Frozen)`| No      | Yes     |
| Blacklist enforcement        | No      | Yes (hook)|
| Minters (max)                | 10      | 10      |
| Burners (max)                | 10      | 10      |
| Pausers (max)                | 5       | 5       |
| Blacklisters (max)           | —       | 5       |
| Seizers (max)                | —       | 5       |
| `add_to_blacklist`           | No      | Yes     |
| `remove_from_blacklist`      | No      | Yes     |
| `seize`                      | No      | Yes     |
| New ATAs start unfrozen      | Yes     | No      |
| Transfers blocked by hook    | No      | Yes     |

## Compliance Lifecycle Example

```
1. initialize(enablePermanentDelegate=true, enableTransferHook=true,
              enableDefaultFrozen=true,
              transferHookProgramId="6tULvFAJ7HfaMsjqcUyS7G3kJyncrBsth9kp2UGramiY",
              remaining_accounts=[hookProgram, extraAccountMetaListPDA])
   -> creates StablecoinConfig, RoleManager, Token-2022 mint with all 5 extensions
   -> CPI to hook: creates ExtraAccountMetaList PDA

2. add_minter(minter=<wallet>, quota=0)         -- quota=0 means unlimited
   add_role(Blacklister, address=<compliance_wallet>)
   add_role(Seizer, address=<legal_wallet>)

3. createATA(owner=<user>)                      -- ATA created, starts FROZEN
   thaw_account(token_account=<user_ata>)       -- must thaw before minting
   mint_tokens(amount=1_000_000, recipient=<user>)

4. -- User attempts to transfer to <counterparty>
   -- Token-2022 calls hook execute():
   --   checks ["blacklist", mint, user] -> lamports=0 -> not blacklisted
   --   checks ["blacklist", mint, counterparty] -> lamports=0 -> not blacklisted
   --   transfer succeeds

5. add_to_blacklist(address=<user>, reason="AML alert")
   -- creates BlacklistEntry PDA with lamports > 0

6. -- User attempts transfer again
   -- hook execute(): sender PDA lamports > 0 -> SenderBlacklisted -> transfer fails

7. freeze_account(token_account=<user_ata>)
   -- freeze source ATA before seize (required by seize instruction)

8. seize(source=<user_ata>, destination=<treasury_ata>, amount=1_000_000)
   -- thaws <user_ata> internally
   -- invoke_transfer_checked: hook checks config PDA as source_authority -> passes
   -- re-freezes <user_ata>
   -- tokens now in <treasury_ata>

9. remove_from_blacklist(address=<user>)        -- optional; closes PDA; refunds rent
```
