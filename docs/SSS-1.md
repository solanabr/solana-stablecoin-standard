# S³-1: Minimal Preset

## Overview

S³-1 is the minimal stablecoin preset providing basic token operations with on-chain metadata.

## Extensions Enabled

- **MetadataPointer**: Token metadata stored on the mint account itself

## Features

- Minting with per-minter allowance control
- Burning by authorized minters
- Global pause/unpause
- Individual account freeze/thaw
- Role-based access control (owner, master minter, pauser)
- Two-step ownership transfer

## Features NOT Available

- No transfer hook (no per-transfer compliance checks)
- No permanent delegate (no seizure capability)
- No blacklisting
- No confidential transfers

## Use Cases

- Internal stablecoins
- Gaming tokens pegged to fiat
- Simple payment tokens where compliance is handled off-chain

## Initialization

```typescript
const params = {
  preset: { sss1: {} },
  name: "MyUSD",
  symbol: "MUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  masterMinter: masterMinterPubkey,
  pauser: pauserPubkey,
};
```

## CLI

```bash
sss-token init --preset sss-1 --name "MyUSD" --symbol "MUSD" --decimals 6
```
