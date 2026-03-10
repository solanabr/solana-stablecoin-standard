---
title: Reserve Attestations
description: Building reserve data, hashing reports, and writing on-chain reserve attestations with the SSS SDK.
---

# Reserve Attestations

SSS records reserve attestations as immutable PDAs under the stablecoin config.

## Build Attestation Data

```ts
import {BN} from "@coral-xyz/anchor";
import {OracleModule} from "solana-stablecoin-standard";

const oracle = new OracleModule(connection);

const reserve = await oracle.buildReserveData({
  reserveComponents: [
    {name: "US Treasury Bills", amountUsd: 800_000},
    {name: "Bank Deposits", amountUsd: 200_000},
  ],
  outstandingSupply: new BN(1_000_000_000_000),
  attestationUri: "https://issuer.example/audits/2026-03.pdf",
});
```

## Submit The Attestation

```ts
await client.attestReserve(mint, {
  reserveHash: reserve.reserveHash,
  totalReservesUsd: reserve.totalReservesUsd,
  totalOutstanding: reserve.totalOutstanding,
  attestationUri: reserve.attestationUri,
});
```

## Fetch The Latest Attestation

```ts
const config = await client.fetchConfig(mint);
const nextIndex = config.reserveAttestationIndex;
const latestIndex = nextIndex.subn(1);
const [configPda] = client.getConfigPda(mint);
const attestation = await client.fetchReserveAttestation(configPda, latestIndex);
```

## What The Program Enforces

- only the master authority can attest
- URI length must be `<= 200`
- `totalReservesUsd >= totalOutstanding`

## Current Implementation Detail

The current program persists the attestation PDA but does not emit a reserve-attestation event. If you want a full attestation feed, index the attestation accounts.
