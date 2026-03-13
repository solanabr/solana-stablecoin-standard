# SSS-1 Specification

## Scope
SSS-1 is the base stablecoin program built on Token-2022 with operational controls.

## Bounty Mapping (PR #22)
- Required pause controls: `pause`, `unpause` (admin-only)
- Required transfer authority path: `transfer_admin`
- Required minter update path: `grant_role(Minter)` + `revoke_role(Minter)`
- Required seizure path: `seize_tokens(amount)` via PermanentDelegate (`amount > 0`)

## Features
- Token-2022 mint initialization with:
  - `MetadataPointer`
  - `TokenMetadata` (optional when metadata fields are non-empty)
  - `PermanentDelegate` (config PDA)
- Role-based controls:
  - `Admin`
  - `Minter`
  - `Burner`
  - `Freezer`
- Admin operations:
  - `grant_role`
  - `revoke_role`
  - `transfer_admin`
  - `pause` / `unpause`
  - `update_metadata`
- Supply/account operations:
  - `mint_tokens`
  - `burn_tokens`
  - `freeze_account` / `unfreeze_account`
  - `seize_tokens` (permanent delegate path)

## PDA Layout
- Config: `['config', mint]`
- Role: `['role', config, authority, role_type]`

## Safety Rules
- Paused mode blocks state-changing user operations (`mint`, `burn`, `freeze`, `unfreeze`, `update_metadata`).
- Paused mode does not block `seize_tokens`; this keeps incident-response seizure available while issuance/redemption is halted.
- Admin transfer is explicit via `transfer_admin`.
- Admin transfer rejects invalid targets (`11111111111111111111111111111111`) and no-op self-transfer attempts.
- Seizure requires admin signer and executes with PDA signer authority.
- PermanentDelegate is initialized on the mint and pinned to the SSS-1 config PDA.
- PermanentDelegate initialization is test-verified on-chain (`getPermanentDelegate(mint).delegate == config`).
- Minter rotation is a two-step admin flow: `grant_role(Minter, new)` then `revoke_role(Minter, old)`.
- Minter rotation remains available during paused states to support incident containment.

## Events
- `StablecoinInitialized`
- `RoleGranted`, `RoleRevoked`
- `TokensMinted`, `TokensBurned`, `TokensSeized`
- `AccountFrozen`, `AccountUnfrozen`
- `MetadataUpdated`
- `StablecoinPaused`, `StablecoinUnpaused`
- `AdminTransferred`

## Required Operational Flows
1. **Pause/Unpause**
   - `pause()` by current admin.
   - Confirm `config.paused = true`.
   - `unpause()` by current admin to restore lifecycle instructions.
2. **Admin Rotation**
   - `transfer_admin(new_admin)` by current admin.
   - New admin can immediately call admin-only paths.
3. **Minter Rotation**
   - `grant_role(Minter)` to new key.
   - Verify mint succeeds for new key.
   - `revoke_role()` for old minter role PDA.
4. **Seizure (PermanentDelegate)**
   - `seize_tokens(amount)` by admin from source ATA to destination ATA.
   - Works independently of source owner signatures because mint delegate is config PDA.
   - Supported during paused incident state for emergency funds movement.
   - Rejects zero-amount seizure requests.

## Implementation Notes
- `pause` and `unpause` are on-chain admin-gated and reflected in `StablecoinConfig.paused`.
- Direct non-admin attempts to call `pause`/`unpause` are test-covered and rejected.
- Admin transfer is explicit (`transfer_admin`) and test-covered for both:
  - new admin allowed to execute admin-only paths;
  - previous admin rejected after transfer (including `pause`, `unpause`, `seize_tokens`, and role-revoke operations).
  - chained transfer handoffs preserve current-admin-only controls.
  - invalid transfer targets rejected (default pubkey and unchanged authority).
  - paused-incident transfer path: `pause -> transfer_admin -> new_admin unpause` is test-covered.
- Minter update path is executed as:
  - `grant_role(Minter, new_minter)`,
  - `revoke_role(old_minter)`.
- Minter rotation is test-covered while paused (pause -> rotate -> unpause -> old minter blocked, new minter allowed).
- Minter rotation is also test-covered across paused admin handoff (`pause -> transfer_admin -> rotate -> unpause`), with old admin rejected and new admin authorized.
- Service integration (`services/mint-burn`) now executes:
  - `POST /pause`,
  - `POST /unpause`,
  - `POST /seize`,
  - `POST /roles/minter/update`,
  - `POST /authorities/admin/transfer`.
- Service integration (`services/compliance`) also exposes required SSS-1 operational paths:
  - `POST /pause`,
  - `POST /unpause`,
  - `POST /authorities/admin/transfer`,
  - `POST /seize`,
  - `POST /roles/minter/update`.
- Tests cover unauthorized and zero-amount seizure failures in addition to successful seizure flows.
- Tests explicitly cover that source token-account ownership does not grant seizure rights; only admin authority can execute `seize_tokens`.
- Tests cover paused-incident handoff where admin authority rotates and only the new admin can seize while paused.
- Latest verification evidence for these flows is tracked in `docs/TESTING.md` (run date: 2026-03-13, refreshed 20:12:22Z; local Anchor integration tests require `solana-test-validator`, which is unavailable in this environment).
