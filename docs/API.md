# API Reference

## Program
- `sss-1`: unified stablecoin + optional compliance-hook module

## Core Instructions
- `initialize(name, symbol, uri, decimals, roles_enabled, freeze_enabled)`
- `grant_role(role_type)`
- `revoke_role()`
- `mint_tokens(amount)`
- `burn_tokens(amount)`
- `freeze_account()`
- `unfreeze_account()`
- `update_metadata(field, value)`
- `pause()`
- `unpause()`
- `transfer_admin()`
- `seize_tokens(amount)`

## Optional Hook Module Instructions
- `initialize_hook_module()`
- `initialize_extra_account_meta_list()`
- `add_to_blacklist()`
- `remove_from_blacklist()`
- `set_compliance_mode(enabled)`
- `transfer_hook_authority()`
- `transfer_hook(amount)`

## SDK Surface
`SSSStablecoin`:
- Core methods above plus:
- `initializeHookModule`
- `initializeExtraAccountMetaList`
- `addToBlacklist`, `removeFromBlacklist`
- `setComplianceMode`
- `transferHookAuthority`
- `isBlacklisted`
- `getHookConfig`

## Service API (`services/mint-burn`)
- `POST /mint` body: `{ mint, destination, amount }`
- `POST /burn` body: `{ mint, source, amount }`
- `POST /pause` body: `{ mint }`
- `POST /unpause` body: `{ mint }`
- `POST /seize` body: `{ mint, from, to, amount }`
- `POST /roles/minter/update` body: `{ mint, oldMinter, newMinter }`
- `POST /authorities/admin/transfer` body: `{ mint, newAdmin }`
- `GET /health`

## Service API (`services/compliance`)
- `GET /compliance/:mint/:address`
- `POST /compliance/mode` body: `{ mint, enabled }`
- `POST /authorities/hook/transfer` body: `{ mint, newAuthority }`
- `POST /blacklist/add` body: `{ mint, address }`
- `POST /blacklist/remove` body: `{ mint, address }`
- `POST /pause` body: `{ mint }`
- `POST /unpause` body: `{ mint }`
- `POST /authorities/admin/transfer` body: `{ mint, newAdmin }`
- `POST /roles/minter/update` body: `{ mint, oldMinter, newMinter }`
- `POST /seize` body: `{ mint, from, to, amount }`
- `GET /health`

## Service Runtime Configuration
- `SOLANA_RPC_URL` (default: `http://127.0.0.1:8899`)
- `SOLANA_WALLET` (default: `~/.config/solana/deployer.json`)
- `SSS1_PROGRAM_ID` or `SSS_PROGRAM_ID` (optional override)
- `SSS1_IDL_PATH` or `SSS_IDL_PATH` (optional override, default `target/idl/sss_1.json`)
