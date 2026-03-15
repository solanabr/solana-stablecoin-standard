---
title: Roles And Authority
description: Role-based access control, role updates, and authority rotation for SSS issuers.
---

# Roles And Authority

SSS splits operational power across stablecoin roles instead of using one all-powerful hot key.

## Roles

| Role | Main capabilities |
| --- | --- |
| `MasterAuthority` | all admin flows |
| `Pauser` | pause, unpause, freeze, thaw |
| `Blacklister` | add and remove blacklist entries |
| `Seizer` | seize tokens from blacklisted accounts |

## Update A Role

```ts
import {Role} from "solana-stablecoin-standard";

await client.updateRoles(mint, {
  role: {[Role.Pauser]: {}},
  newHolder: opsWallet,
});
```

Common assignments:

```ts
await client.updateRoles(mint, {
  role: {[Role.Blacklister]: {}},
  newHolder: complianceWallet,
});

await client.updateRoles(mint, {
  role: {[Role.Seizer]: {}},
  newHolder: legalWallet,
});
```

## Register A Minter

Minters are not part of `RoleRegistry`. They use their own PDA per wallet:

```ts
await client.updateMinter(mint, minterWallet, {
  isActive: true,
  mintQuota: new BN(5_000_000_000_000),
});
```

## Transfer Master Authority

Use `transferAuthority`, not `updateRoles`, for master rotation:

```ts
await client.transferAuthority(mint, newAuthority);
```

## Important Caveats

- `updateRoles` cannot set `MasterAuthority`
- the on-chain `transfer_authority` instruction expects `new_authority` to be a signer account
- test master rotation in your wallet stack before relying on the SDK helper for production key rotations

## Recommended Production Split

- master authority: cold key or multisig
- pauser: monitored ops key
- blacklister: compliance key
- seizer: legal or treasury-controlled key
- minters: separate operational wallets with explicit quotas
