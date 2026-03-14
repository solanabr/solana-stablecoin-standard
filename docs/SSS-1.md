# SSS-1 Specification

## Mandatory capabilities

- Token-2022 mint with mint/freeze authority.
- RBAC with dedicated authorities (master + operation roles).
- Time-window minter quotas.
- Core instructions:
  - `initialize`
  - `mint`
  - `burn`
  - `freeze_account`
  - `thaw_account`
  - `pause`
  - `unpause`
  - `update_minter`
  - `update_roles`
  - `transfer_authority`
- Event emission for all sensitive actions.

## Current implementation note

`name`, `symbol`, and `uri` are stored on-chain in the SSS config PDA. The SDK create flow initializes the mint with a metadata pointer to that config PDA, giving the standard a stable on-chain metadata source without relying on the failing in-mint Token-2022 metadata path.

## Prohibited in SSS-1

- Compliance blacklist controls.
- Seize operations.
- Transfer-hook blacklist enforcement.
