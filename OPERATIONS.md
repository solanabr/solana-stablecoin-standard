# Operations

This document is the operator runbook for mint administration and backend orchestration.

## Roles

The core operational roles are stored in `RoleConfig`:

- `master_authority`
- `pauser`
- `burner`
- `blacklister`
- `seizer`

The master authority can reassign other roles and minter quotas.

## Standard Runbook

### Mint

Use when fiat reserves are verified and a minter has available quota.

Checklist:

1. Confirm the mint is not paused.
2. Confirm the caller has an active `MinterQuota`.
3. Confirm recipient ATA exists for the Token-2022 mint.
4. Submit `mint`.
5. Record the transaction signature and the offchain reserve reference.

### Burn

Use when redeeming or retiring supply.

Checklist:

1. Confirm the mint is not paused.
2. Confirm the burner role is assigned to the caller.
3. Confirm the source token account is owned by the caller.
4. Submit `burn`.
5. Reconcile burned amount against redemption records.

### Pause

Use during incident response, operational uncertainty, or controlled maintenance windows.

Checklist:

1. Confirm the caller is the `pauser` or `master_authority`.
2. Submit `pause`.
3. Verify new mint and burn attempts fail.
4. Notify downstream systems that issuance and seizure are halted.

### Unpause

Checklist:

1. Confirm the underlying issue is resolved.
2. Submit `unpause`.
3. Verify mint and burn paths recover.
4. Close the incident with linked transaction signatures.

### Freeze

Use to immobilize a specific token account.

Checklist:

1. Confirm the caller is the `pauser` or `master_authority`.
2. Identify the exact token account, not just the wallet.
3. Submit `freeze_account`.
4. Confirm the token account state becomes frozen.

### Thaw

Checklist:

1. Confirm the freeze is no longer required.
2. Submit `thaw_account`.
3. Confirm the token account can transfer again, subject to preset rules.

### Blacklist Add

Only valid for `SSS-2`.

Checklist:

1. Confirm the mint is an `SSS-2` mint.
2. Confirm the caller is the `blacklister` or `master_authority`.
3. Capture the compliance reason.
4. Submit `add_to_blacklist`.
5. Verify the blacklist PDA exists.
6. If needed, freeze the target token account separately.

### Blacklist Remove

Only valid for `SSS-2`.

Checklist:

1. Confirm the removal is approved by policy.
2. Submit `remove_from_blacklist`.
3. Verify the blacklist PDA is closed.
4. If the token account was frozen for the same case, thaw it separately if appropriate.

### Seize

Only valid for `SSS-2`.

Checklist:

1. Confirm the mint is not paused.
2. Confirm permanent delegate and transfer hook are enabled.
3. Confirm the caller is the `seizer` or `master_authority`.
4. Confirm the wallet owner is blacklisted.
5. Confirm the source token account is frozen.
6. Confirm the destination treasury token account is owned by the current authority.
7. Submit `seize`.
8. Confirm the source account remains frozen after partial or full seizure.

## Backend Operations

### Start API

```bash
export DATABASE_URL=postgres://localhost/sss_backend
cargo run -p sss_api
```

Enable workers:

```bash
export SSS_RUN_WORKERS=1
cargo run -p sss_api
```

### Start Indexer

```bash
export DATABASE_URL=postgres://localhost/sss_backend
export SOLANA_RPC_URL=https://api.devnet.solana.com
cargo run -p sss_indexer
```

Optional indexer controls:

- `SSS_STABLECOIN_PROGRAM_ID`
- `SSS_TRANSFER_HOOK_PROGRAM_ID`
- `SSS_DISABLE_BLOCK_SUBSCRIBE`

### Transfer-hook program (SSS-2)

After deploying the transfer-hook program, call `initialize_hook_config(stablecoin_program_id)` once. That sets the stablecoin program ID this hook will validate against and makes the hook reusable across deployments. Until the hook config is initialized, no mint can use this transfer hook.

## Incident Notes

- `pause` blocks mint and burn, and also blocks `seize`.
- `freeze` and `thaw` are per-token-account actions, not wallet-wide actions.
- In `SSS-2`, transfer-hook rejection is separate from token-account freezing. Blacklisting alone blocks transfers, but it does not by itself freeze balances.
- The backend signer path is scaffolded for orchestration. Treat it as an operator queue, not a substitute for onchain authorization.
