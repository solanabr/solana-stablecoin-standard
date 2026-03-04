# SSS-1: Minimal Stablecoin Preset

## Overview

SSS-1 is the lightweight preset for tokens that need basic authority controls without compliance features. Typical use cases:

- DAO treasury tokens
- Internal stablecoins for protocols
- Wrapped assets
- Simple pegged tokens

## Features

- **Mint/Burn**: Authorized minters can issue tokens; authorized burners can burn from their own accounts.
- **Freeze/Thaw**: Authorized freezers can freeze and unfreeze individual token accounts.
- **Pause/Unpause**: Admins can halt all mint and burn operations globally.
- **Supply Cap**: Optional hard limit on total supply (set to 0 for unlimited).
- **Role Management**: Bitmask-based roles with init-if-needed role accounts.
- **Token-2022 Metadata**: Name, symbol, and URI stored on-chain via the metadata extension.

## Token-2022 Extensions

SSS-1 mints are created with:
- `MintCloseAuthority` — allows closing the mint when supply is 0
- `MetadataPointer` — self-referencing metadata pointer

## Roles

| Role | Flag | Permissions |
|------|------|-------------|
| ADMIN | 1 | Pause/unpause, grant/revoke roles, config changes |
| MINTER | 2 | Mint tokens to any account |
| BURNER | 4 | Burn tokens from own account |
| FREEZER | 8 | Freeze/thaw token accounts |

The deployer receives ADMIN + MINTER + BURNER + FREEZER by default.

## Initialization

```bash
sss-token init --preset sss-1 \
  --name "My Token" \
  --symbol "MYT" \
  --decimals 6 \
  --supply-cap 1000000000000  # 1M tokens at 6 decimals (optional)
```

## Upgrading to SSS-2

There is no in-place upgrade from SSS-1 to SSS-2. The Token-2022 extensions (PermanentDelegate, TransferHook) must be set at mint creation time. To upgrade, you would need to:

1. Deploy a new SSS-2 token
2. Migrate balances via a coordinated swap
3. Freeze the old SSS-1 mint

This is by design — the extensions are security-critical and shouldn't be modifiable after deployment.
