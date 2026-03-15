---
title: Transfer Hook
description: How SSS-2 transfer-hook enforcement works and why the ExtraAccountMetaList is required.
---

# Transfer Hook

SSS-2 uses a separate Token-2022 transfer-hook program to reject transfers involving blacklisted wallets.

## Required Setup

After mint initialization, call:

```ts
await client.initializeExtraAccountMetaList(mint);
```

Without this account, Token-2022 cannot resolve the extra accounts that the hook needs.

## Accounts Resolved By The Hook

Standard transfer accounts:

- source token account
- mint
- destination token account
- source authority
- extra-account-meta-list PDA

Extra resolved accounts:

- `sss-token` program ID
- `StablecoinConfig` PDA
- source `BlacklistEntry` PDA
- destination `BlacklistEntry` PDA

## Enforcement Logic

The hook program:

1. re-derives the expected config PDA
2. allows the transfer if the config is invalid or missing
3. allows the transfer if the authority is the config PDA
4. rejects if source blacklist exists
5. rejects if destination blacklist exists

## Why Owner-Based Resolution Matters

The hook derives blacklist PDAs from the token-account owner field inside the source and destination token accounts. That means a clean delegate signer cannot move funds out of a blacklisted account.

## Important Deployment Note

The transfer-hook program hardcodes the `sss-token` program ID at compile time. If you redeploy `sss-token` to a different address, rebuild and redeploy the hook program too.
