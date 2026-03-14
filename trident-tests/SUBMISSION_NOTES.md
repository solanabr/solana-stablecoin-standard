# Trident Fuzz Submission Notes

## Status

- Fuzz target: `fuzz_sss_token`
- Command: `trident fuzz run fuzz_sss_token`
- Latest result: **PASS** (`10000/10000`, exit code `0`)

## Coverage Included

The harness in `fuzz_sss_token/test_fuzz.rs` covers:

- Control/admin flows:
  - `add_minter`
  - `increase_minter_quota`
  - `remove_minter`
  - `update_roles`
  - `propose_authority`
  - `accept_authority`
  - `pause`
  - `unpause`
- Token flows:
  - `mint`
  - `burn`
  - `freeze_account`
  - `thaw_account`

## Harness Quality Improvements Included

- Deterministic Token-2022 bootstrap (mint + token account init)
- PDA setup for mint/freeze/permanent-delegate authorities
- Authority synchronization from on-chain state in flows
- Pending authority accept flow uses current on-chain `pending_authority`
- Role resync after successful authority transfer
- Per-flow metrics tracking and printing:
  - attempted
  - succeeded
  - failed
  - skipped
  - success ratio
- Aggregate overall metrics line printed in `end()`

## Metrics Interpretation

Fuzzing intentionally mixes valid and invalid sequences. A low success ratio for some flows does **not** imply harness failure by itself; it often means preconditions were not met for that random sequence (e.g., paused state, missing minter, role mismatch, token-state ordering).

The acceptance criterion for this submission is:

1. Harness compiles
2. Fuzz run completes
3. Invariants hold in `end()`
4. Process exits with code `0`

## Repro

From `trident-tests/`:

```bash
trident fuzz run fuzz_sss_token
```

Use the printed `MASTER SEED` to replay/debug deterministic cases if needed.
