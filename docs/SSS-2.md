# SSS-2 Specification

## Scope

SSS-2 is an optional compliance transfer-hook module delivered inside the single `sss-1` program surface.

## Features
- Hook config per mint (`hook_config` PDA)
- Blacklist account management:
  - `add_to_blacklist`
  - `remove_from_blacklist`
- Compliance gating:
  - `set_compliance_mode(enabled)`
  - when disabled, blacklist checks are bypassed (structural token-account validation still applies)
  - when enabled, transfer-hook enforces blacklist checks
- Authority rotation:
  - `transfer_hook_authority`
- Owner-level enforcement in transfer hook:
  - source owner decoded from source token-account data
  - destination owner decoded from destination token-account data

## PDA Layout
- HookConfig: `['hook_config', mint]`
- Blacklist entry: `['blacklist', hook_config, address]`
- Extra account meta list: `['extra-account-metas', mint]`

## Instructions
- `initialize_hook_module`
- `initialize_extra_account_meta_list`
- `add_to_blacklist`
- `remove_from_blacklist`
- `set_compliance_mode`
- `transfer_hook_authority`
- `transfer_hook`

## Operational Notes
- Module is opt-in per mint. Core SSS-1 operation does not require hook initialization.
- Seizure remains in SSS-1 `seize_tokens` via PermanentDelegate authority.
- Hook execute validates Token-2022 account ownership and mint alignment before compliance checks.
