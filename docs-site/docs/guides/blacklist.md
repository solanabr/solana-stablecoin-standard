---
title: Blacklisting And Seizure
description: How to blacklist wallets, freeze accounts, seize funds, and remove blacklist entries with SSS.
---

# Blacklisting And Seizure

These flows are available on SSS-2 and on custom mints that enable the required permanent-delegate behavior.

## Add A Blacklist Entry

You need both the wallet address and a token account owned by that wallet.

```ts
await client.blacklistAdd(mint, blockedWallet, blockedAta, {
  reason: "OFAC screening hit",
});
```

This does two things on-chain:

- creates `BlacklistEntry`
- freezes `blockedAta`

## Seize Tokens

```ts
import {BN} from "@coral-xyz/anchor";

await client.seize(
  mint,
  blockedWallet,
  blockedAta,
  treasuryAta,
  new BN(250_000_000)
);
```

The program:

1. thaws the blocked account
2. burns from the blocked account using the config PDA as permanent delegate
3. mints the same amount to `treasuryAta`
4. freezes the blocked account again

## Remove A Blacklist Entry

```ts
await client.blacklistRemove(mint, blockedWallet, blockedAta);
```

This thaws the account and closes the blacklist PDA.

## Transfer-Hook Effect

On SSS-2 mints, once the extra-account-meta list is initialized:

- blacklisted sources cannot send
- blacklisted destinations cannot receive

The hook checks token-account owners, not just the signer, which prevents delegate-based bypasses.

## Source Caveat

The current on-chain gating uses `enablePermanentDelegate` for blacklist and seizure feature checks. If you build a custom mint with permanent delegate enabled but transfer hook disabled, blacklist and seize still work, but per-transfer hook enforcement does not.
