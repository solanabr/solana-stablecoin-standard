# SSS-1 Specification

## Scope

SSS-1 defines a minimal stablecoin standard for issuance and administrative control without compliance-only enforcement extensions.

## Required Behaviors

- Initialize mint and config.
- Mint with minter allowance accounting.
- Burn with burner role.
- Freeze/thaw token accounts by master role.
- Role management and authority transfer.

## Instruction Surface

- `initialize`
- `mint_tokens`
- `burn_tokens`
- `freeze_account`
- `thaw_account`
- `update_minter`
- `update_roles`
- `transfer_authority`

## Account Model

- `StablecoinConfig` (standard + metadata + extension flags)
- `RoleAccount` PDAs
- `MinterAccount` PDA for allowance tracking

## Non-Goals

- On-chain blacklist management.
- Seizure execution.
- Transfer-hook compliance enforcement.
