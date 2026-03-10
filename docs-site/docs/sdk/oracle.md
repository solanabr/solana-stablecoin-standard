---
title: Oracle And Attestations
description: OracleModule reference for price feeds, reserve hashing, amount conversion, and CPI helper data.
---

# `OracleModule`

`OracleModule` is a utility layer for price reads and reserve-attestation prep. It does not submit on-chain instructions by itself.

## Constructor

```ts
new OracleModule(connection: Connection, config?: OracleConfig)
```

### `OracleConfig`

```ts
interface OracleConfig {
  pythProgramId?: PublicKey;
  switchboardProgramId?: PublicKey;
}
```

## Core Types

```ts
interface OraclePrice {
  price: number;
  confidence: number;
  exponent: number;
  timestamp: number;
  source: string;
}

interface ReserveData {
  totalReservesUsd: BN;
  totalOutstanding: BN;
  reserveHash: number[];
  attestationUri: string;
  collateralizationRatio: number;
}
```

## Methods

| Method | Signature |
| --- | --- |
| `fetchPythPrice` | `(priceFeedAccount: PublicKey) => Promise<OraclePrice>` |
| `fetchSwitchboardPrice` | `(aggregatorAccount: PublicKey) => Promise<OraclePrice>` |
| `buildReserveData` | `(params: { reserveComponents: { name: string; amountUsd: number }[]; outstandingSupply: BN; attestationUri: string }) => Promise<ReserveData>` |
| `computeReserveHash` | `(data: string \| Buffer) => number[]` |
| `formatPrice` | `static (price: number, exponent: number) => string` |
| `getKnownFeeds` | `(pair: string, network?: "mainnet" \| "devnet") => FeedInfo[]` |
| `listSupportedPairs` | `(network?: "mainnet" \| "devnet") => string[]` |
| `fetchPrice` | `(pair: string, network?: "mainnet" \| "devnet") => Promise<OraclePrice>` |
| `fetchPriceMultiSource` | `(pair: string, network?: "mainnet" \| "devnet") => Promise<OraclePrice[]>` |
| `convertAmount` | `(params: { amount: BN; fromPair: string; toPair: string; decimals: number; network?: "mainnet" \| "devnet" }) => Promise<{ convertedAmount: BN; rate: number; sources: string[] }>` |
| `computeMintPrice` | `(params: { fiatAmount: number; fiatCurrency: string; stablecoinDecimals: number; network?: "mainnet" \| "devnet" }) => Promise<{ tokensToMint: BN; exchangeRate: number; source: string }>` |
| `computeCpiAdjustedAmount` | `static (params: { baseAmount: BN; cpiConfig: CpiConfig; decimals: number }) => { adjustedAmount: BN; inflationMultiplier: number }` |
| `buildCpiAttestation` | `static (cpiConfig: CpiConfig) => { hash: number[]; data: string }` |

## Known Feeds

The built-in registry currently contains mainnet entries for:

- `SOL/USD`
- `BTC/USD`
- `ETH/USD`
- `EUR/USD`
- `USD/BRL`

The `devnet` feed registry is empty in the current source.

## Reserve Attestation Example

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

await client.attestReserve(mint, {
  reserveHash: reserve.reserveHash,
  totalReservesUsd: reserve.totalReservesUsd,
  totalOutstanding: reserve.totalOutstanding,
  attestationUri: reserve.attestationUri,
});
```

## Source-Level Caveats

- constructor defaults point at mainnet Pyth and Switchboard program IDs
- `fetchPythPrice` reads raw offsets but does not validate account owner or magic bytes
- `buildReserveData` includes `Date.now()` in its hash input, so the output hash changes over time even for the same reserve components
- several helpers call `BN.toNumber()`, so very large values can exceed JavaScript safe-integer limits
- `convertAmount` and `computeCpiAdjustedAmount` accept `decimals` but do not currently use it
- `computeMintPrice` supports only `USD`, `EUR`, and `BRL`
