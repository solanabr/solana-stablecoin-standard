---
title: Mint And Burn
description: How to register minters, mint tokens, and burn tokens with the SSS SDK.
---

# Mint And Burn

Minting requires an active minter PDA. Burning does not.

## Register A Minter

```ts
import {BN} from "@coral-xyz/anchor";

await client.updateMinter(mint, wallet.publicKey, {
  isActive: true,
  mintQuota: new BN(1_000_000_000_000),
});
```

`mintQuota` is in base units. Set it to `new BN(0)` for unlimited minting.

## Mint To An ATA

```ts
const recipientAta = client.getAssociatedTokenAddress(mint, recipient);

await client.mintTokens(mint, new BN(500_000_000), recipientAta);
```

If the recipient ATA does not exist yet, create it with your normal wallet flow or by using `client.createAssociatedTokenAccountInstruction(...)`.

## Burn From Your Own Account

```ts
const holderAta = client.getAssociatedTokenAddress(mint, wallet.publicKey);

await client.burnTokens(mint, new BN(100_000_000), holderAta);
```

## Master-Authority Burn

The on-chain program also supports a privileged burn path when:

- the signer is the master authority
- `enablePermanentDelegate` is enabled for the mint

That path is useful for recovery workflows and SSS-2 operations.

## What The Program Checks

### Mint

- amount must be greater than zero
- mint must not be paused
- minter PDA must exist and be active
- amount must fit remaining quota
- if recipient is blacklisted on a permanent-delegate mint, minting fails

### Burn

- amount must be greater than zero
- mint must not be paused
- source account must hold enough tokens
- signer must either own the account or be the master authority using the delegate path

## Supply Queries

```ts
const totals = await client.getTotalSupply(mint);
const rpcSupply = await client.getTokenSupply(mint);
```

- `getTotalSupply` uses SSS config counters
- `getTokenSupply` uses the mint account via RPC
