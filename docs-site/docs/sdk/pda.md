---
title: PDA Helpers
description: PDA derivation helpers, seeds, and examples for SSS config, roles, minters, blacklist entries, attestations, and hook metadata.
---

# PDA Helpers

The SDK exports standalone helpers and equivalent instance methods on `SSSClient`.

## Functions

```ts
getConfigPda(mint: PublicKey, programId?: PublicKey): [PublicKey, number]
getRoleRegistryPda(config: PublicKey, programId?: PublicKey): [PublicKey, number]
getMinterInfoPda(config: PublicKey, minter: PublicKey, programId?: PublicKey): [PublicKey, number]
getBlacklistPda(config: PublicKey, address: PublicKey, programId?: PublicKey): [PublicKey, number]
getReserveAttestationPda(config: PublicKey, index: BN | number, programId?: PublicKey): [PublicKey, number]
getExtraAccountMetaListPda(mint: PublicKey, programId?: PublicKey): [PublicKey, number]
```

## Seed Layout

| Helper | Seeds |
| --- | --- |
| `getConfigPda` | `["config", mint]` |
| `getRoleRegistryPda` | `["roles", config]` |
| `getMinterInfoPda` | `["minter", config, minter]` |
| `getBlacklistPda` | `["blacklist", config, address]` |
| `getReserveAttestationPda` | `["reserve", config, index_le_u64]` |
| `getExtraAccountMetaListPda` | `["extra-account-metas", mint]` |

## Program Defaults

- all token-state PDAs default to `SSS_TOKEN_PROGRAM_ID`
- the extra-account-meta-list PDA defaults to `SSS_TRANSFER_HOOK_PROGRAM_ID`

## Example

```ts
import {BN} from "@coral-xyz/anchor";
import {
  getConfigPda,
  getRoleRegistryPda,
  getReserveAttestationPda,
} from "solana-stablecoin-standard";

const [configPda] = getConfigPda(mint);
const [rolesPda] = getRoleRegistryPda(configPda);
const [attestationPda] = getReserveAttestationPda(configPda, new BN(0));
```

## When To Use The Client Method Instead

Use the `SSSClient` method when you already have a client instance and want the helper tied to its configured program IDs:

```ts
const [configPda] = client.getConfigPda(mint);
```

Use the standalone helper when you want deterministic PDA derivation without constructing a client.
