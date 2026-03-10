---
title: SDK Types
description: Enums, account interfaces, and instruction parameter shapes exported by the SSS SDK.
---

# SDK Types

These are the TypeScript shapes exported from `sdk/src/types.ts`.

## Enums

### `StablecoinPreset`

```ts
enum StablecoinPreset {
  SSS1 = "sss1",
  SSS2 = "sss2",
  SSS3 = "sss3",
  Custom = "custom",
}
```

### `Role`

```ts
enum Role {
  MasterAuthority = "masterAuthority",
  Pauser = "pauser",
  Blacklister = "blacklister",
  Seizer = "seizer",
}
```

## Account Interfaces

### `StablecoinConfig`

```ts
interface StablecoinConfig {
  bump: number;
  mint: PublicKey;
  masterAuthority: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset: { [K in StablecoinPreset]?: {} };
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
  isPaused: boolean;
  totalMinted: BN;
  totalBurned: BN;
  auditLogIndex: BN;
  reserveAttestationIndex: BN;
  createdAt: BN;
  updatedAt: BN;
}
```

### `RoleRegistry`

```ts
interface RoleRegistry {
  bump: number;
  config: PublicKey;
  masterAuthority: PublicKey;
  pauser: PublicKey;
  blacklister: PublicKey;
  seizer: PublicKey;
}
```

### `MinterInfo`

```ts
interface MinterInfo {
  bump: number;
  config: PublicKey;
  minter: PublicKey;
  isActive: boolean;
  mintQuota: BN;
  totalMinted: BN;
  createdAt: BN;
  lastMintAt: BN;
}
```

### `BlacklistEntry`

```ts
interface BlacklistEntry {
  bump: number;
  config: PublicKey;
  blockedAddress: PublicKey;
  reason: string;
  blacklistedBy: PublicKey;
  blacklistedAt: BN;
}
```

### `ReserveAttestation`

```ts
interface ReserveAttestation {
  bump: number;
  config: PublicKey;
  index: BN;
  reserveHash: number[];
  totalReservesUsd: BN;
  totalOutstanding: BN;
  attestedBy: PublicKey;
  attestationUri: string;
  timestamp: BN;
}
```

## Instruction Parameter Interfaces

### `InitializeParams`

```ts
interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset: { [K in StablecoinPreset]?: {} };
  enablePermanentDelegate: boolean | null;
  enableTransferHook: boolean | null;
  enableDefaultStateFrozen: boolean | null;
  enableConfidentialTransfers: boolean | null;
}
```

For preset-based initialization, use [`buildInitializeParams`](./presets) instead of hand-assembling this object.

### `UpdateRoleParams`

```ts
interface UpdateRoleParams {
  role: { [K in Role]?: {} };
  newHolder: PublicKey;
}
```

### `UpdateMinterParams`

```ts
interface UpdateMinterParams {
  isActive: boolean;
  mintQuota: BN;
}
```

`mintQuota = 0` means unlimited on-chain.

### `BlacklistAddParams`

```ts
interface BlacklistAddParams {
  reason: string;
}
```

### `AttestReserveParams`

```ts
interface AttestReserveParams {
  reserveHash: number[];
  totalReservesUsd: BN;
  totalOutstanding: BN;
  attestationUri: string;
}
```

## Notes

- numeric counters and timestamps are represented as `BN`
- `preset` and `role` use Anchor enum-object shapes such as `{ sss2: {} }` and `{ pauser: {} }`
- `reserveHash` is a byte array in SDK types, not a hex string
