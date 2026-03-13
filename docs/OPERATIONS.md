# Operations Runbook

## Required Admin Controls
- Pause lifecycle: `pause`, `unpause`
- SSS-1 authority rotation: `transfer_admin`
- SSS-1 minter rotation: `grant_role(Minter)` then `revoke_role` for old minter
- SSS-1 incident seizure: `seize_tokens` (PermanentDelegate path)
- SSS-2 authority rotation: `transfer_hook_authority`
- SSS-2 compliance switch: `set_compliance_mode`

## PR #22 Required Coverage
- Pause/unpause controls are on-chain and admin-gated (`sss-1`).
- Authority transfer paths are on-chain and test-covered:
  - `transfer_admin` (SSS-1)
  - `transfer_hook_authority` (SSS-2)
  - chained transfer handoffs are test-covered for both paths
  - both reject invalid default pubkey and no-op self-transfer targets
- Minter update path is operationalized as:
  - `grant_role(Minter, new)`
  - `revoke_role(Minter, old)`
  - rotation remains executable while paused (incident containment)
  - rotation remains executable after paused admin handoff (`pause -> transfer_admin -> rotate -> unpause`)
- Seizure/compliance requirements are covered:
  - `seize_tokens` uses SSS-1 PermanentDelegate authority
  - SSS-2 transfer-hook compliance gating uses `set_compliance_mode`
  - transfer-hook blacklist account checks are bypassed when compliance mode is disabled

## Incident Response Sequence
1. Halt lifecycle actions with `pause`.
2. Ensure compliance checks are enabled with `set_compliance_mode(true)`.
3. Move funds only when policy requires via `seize_tokens`.
4. Keep admin/compliance rotations available during pause for containment.
5. Restore operations with `unpause`.

## Rotation Procedures
1. Minter rotation:
   - `grant_role(Minter, new_minter)`
   - Validate mint with `new_minter`
   - `revoke_role` for `old_minter`
2. Admin rotation:
   - `transfer_admin(new_admin)`
   - Verify old admin is rejected on admin-only instructions
3. Hook authority rotation:
   - `transfer_hook_authority(new_authority)`
   - Verify old authority is rejected on `set_compliance_mode`, `add_to_blacklist`, `remove_from_blacklist`

## Service Endpoints (`services/mint-burn`)
- `POST /pause` body `{ mint }`
- `POST /unpause` body `{ mint }`
- `POST /seize` body `{ mint, from, to, amount }`
- `POST /roles/minter/update` body `{ mint, oldMinter, newMinter }`
- `POST /authorities/admin/transfer` body `{ mint, newAdmin }`

## Service Endpoints (`services/compliance`)
- `GET /compliance/:mint/:address`
- `POST /compliance/mode` body `{ mint, enabled }`
- `POST /authorities/hook/transfer` body `{ mint, newAuthority }`
- `POST /blacklist/add` body `{ mint, address }`
- `POST /blacklist/remove` body `{ mint, address }`
- `POST /pause` body `{ mint }`
- `POST /unpause` body `{ mint }`
- `POST /authorities/admin/transfer` body `{ mint, newAdmin }`
- `POST /roles/minter/update` body `{ mint, oldMinter, newMinter }`
- `POST /seize` body `{ mint, from, to, amount }`

## Verification Checklist
- `config.paused` toggles correctly.
- Non-admin is rejected on `pause` and `unpause`.
- New admin works; old admin is rejected.
- New minter mints; old minter is rejected post-revoke.
- Minter rotation path remains available during paused incident state.
- Seizure moves balances while paused when called by admin.
- Source token-account owners are rejected on `seize_tokens` unless they are also current admin.
- Hook compliance gating blocks blacklisted owners only when enabled.
- Re-enabling compliance mode immediately restores blacklist enforcement in `transfer_hook`.
- Hook compliance identity is wallet-owner based (source/destination token-account owners), not transfer delegate based.
- Hook blacklist PDA validation is bypassed when compliance is disabled.
- Hook rejects transfer_hook calls where source/destination token accounts are not for the configured hook mint.
- New hook authority works; old hook authority is rejected.
- Non-authority is rejected on `initialize_extra_account_meta_list`.

## Evidence
- Verification command results are tracked in `docs/TESTING.md` (latest run: 2026-03-13 20:12:22Z; `anchor test` blocked in this environment because `solana-test-validator` is unavailable).
