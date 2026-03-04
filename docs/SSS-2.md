# SSS-2: Compliant Stablecoin Preset

## Overview

SSS-2 is the full-featured preset for regulated stablecoins. It extends SSS-1 with compliance controls required by financial regulations: blacklisting, account seizure, and automated transfer validation.

## Use Cases

- Fiat-backed stablecoins (USDC/USDT equivalents)
- Regulated security tokens
- KYC-gated payment tokens
- Central bank digital currency (CBDC) pilots

## Additional Features (on top of SSS-1)

### Permanent Delegate

Token-2022's `PermanentDelegate` extension grants the config PDA the ability to burn tokens from any account. This is used for seizure operations — the config PDA burns from the blacklisted account, then mints equivalent tokens to the treasury.

### Transfer Hook

Every `transfer_checked` call triggers the SSS transfer hook program, which:
1. Checks if the token is paused (rejects if so)
2. Checks if the source owner is blacklisted (rejects if so)
3. Checks if the destination owner is blacklisted (rejects if so)

Regular `transfer` (without `_checked`) is disabled by Token-2022 when a transfer hook is installed, so there's no bypass.

### Blacklist

On-chain list of blocked addresses. Stored as a Vec of Pubkeys in a PDA account, up to 256 entries. The blacklist is checked by the transfer hook on every transfer and by the seize instruction to verify targets.

### Account Seizure

Authorized seizers can confiscate tokens from blacklisted accounts. The flow:
1. Verify the target account's owner is on the blacklist
2. Burn all tokens from the target account (using permanent delegate)
3. Mint equivalent tokens to a designated treasury account

This burn+mint approach avoids triggering the transfer hook (which would block the transfer since the source is blacklisted).

## Additional Roles

| Role | Flag | Permissions |
|------|------|-------------|
| BLACKLISTER | 16 | Add/remove addresses from blacklist |
| SEIZER | 32 | Seize tokens from blacklisted accounts |

## Token-2022 Extensions

SSS-2 mints include everything from SSS-1 plus:
- `PermanentDelegate` — config PDA as permanent delegate
- `TransferHook` — compliance hook program reference

## Initialization

```bash
sss-token init --preset sss-2 \
  --name "Regulated USD" \
  --symbol "RUSD" \
  --decimals 6 \
  --transfer-hook <HOOK_PROGRAM_ID>
```

After initialization, set up the transfer hook's extra account metas:

```typescript
await client.initializeExtraAccountMetas(mintPubkey);
```

## Seizure Flow (detailed)

```
1. Blacklister calls blacklist_add(bad_actor)
2. Blacklist PDA updated with bad_actor address
3. Any transfers to/from bad_actor are now blocked by the hook
4. Seizer calls seize() with bad_actor's token account
5. Program verifies bad_actor is on blacklist
6. Burns tokens from bad_actor (permanent delegate authority)
7. Mints equivalent tokens to treasury
8. Net supply unchanged; funds moved to treasury
```

## Compliance Considerations

- **Immutable on creation**: Transfer hook and permanent delegate are set at mint creation. They cannot be changed or removed later.
- **Role separation**: Best practice is to assign BLACKLISTER and SEIZER to different authorities than ADMIN/MINTER, enforcing separation of duties.
- **Audit trail**: All operations emit program logs that the backend indexer captures for compliance reporting.
- **Blacklist cap**: 256 addresses per blacklist account. For larger lists, implement pagination with multiple blacklist accounts indexed by page number.
