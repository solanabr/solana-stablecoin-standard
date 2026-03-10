---
title: Constants
description: Program IDs, token program IDs, and PDA seed constants exported by the SDK.
---

# Constants

## Program IDs

```ts
SSS_TOKEN_PROGRAM_ID = new PublicKey("5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4")
SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey("FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy")
TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb")
ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
```

## Seed Buffers

```ts
SEEDS.CONFIG = Buffer.from("config")
SEEDS.ROLES = Buffer.from("roles")
SEEDS.MINTER = Buffer.from("minter")
SEEDS.BLACKLIST = Buffer.from("blacklist")
SEEDS.RESERVE = Buffer.from("reserve")
SEEDS.AUDIT = Buffer.from("audit")
SEEDS.EXTRA_ACCOUNT_METAS = Buffer.from("extra-account-metas")
```

## Example

```ts
import {SEEDS, SSS_TOKEN_PROGRAM_ID} from "solana-stablecoin-standard";

console.log(SEEDS.CONFIG.toString());
console.log(SSS_TOKEN_PROGRAM_ID.toBase58());
```

## Practical Use

- use the program IDs when building explorers, indexers, or filters
- use `SEEDS` when you want explicit PDA derivation without hard-coding seed strings
- prefer the exported PDA helper functions over raw manual derivation when possible
