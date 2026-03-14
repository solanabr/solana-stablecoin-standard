# SSS-2 Specification (Compliance)

## Goal
Extend SSS-1 with blacklist enforcement and seizure capabilities.

## Required Components
- All SSS-1 components
- Transfer Hook program
- Blacklist record PDA per wallet
- ExtraAccountMetaList PDA per mint
- Permanent Delegate enabled on mint

## Instruction Set
- `transfer_hook::initialize_extra_account_meta_list`
- `transfer_hook::add_to_blacklist`
- `sss_core::seize_tokens`

## Compliance Flow (ASCII)
```text
Admin blacklists wallet -> Blacklist PDA created
Wallet attempts transfer -> Token-2022 invokes hook
Hook checks blacklist PDA -> transfer blocked
Admin seizes funds -> sss_core invoke_signed transfer_checked
```

## Compatibility Rules
- Keep transfer-hook interface signature unchanged.
- Keep config PDA seed as `b"config"`.
- Never introduce realloc during CPI paths.
