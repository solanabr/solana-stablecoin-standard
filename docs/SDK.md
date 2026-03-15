# SDK Reference

## Installation

```bash
npm install @solana-stablecoin/sdk
```

## Quick Start

```typescript
import { SolanaStablecoin, Presets, Role } from "@solana-stablecoin/sdk";
import { AnchorProvider } from "@coral-xyz/anchor";

const provider = AnchorProvider.env();
```

## SolanaStablecoin

### `SolanaStablecoin.create(provider, params)`

Initialize a new stablecoin on-chain.

```typescript
const stable = await SolanaStablecoin.create(provider, {
  preset: Presets.SSS_1,
  name: "USD Stablecoin",
  symbol: "USDS",
  uri: "https://example.com/metadata.json",
  decimals: 6,
});
```

**Parameters:**
- `provider` — `AnchorProvider` with wallet and connection
- `params.preset` — `Presets.SSS_1`, `Presets.SSS_2`, or `Presets.Custom`
- `params.name` — Token name (max 32 chars)
- `params.symbol` — Token symbol (max 10 chars)
- `params.uri` — Metadata URI
- `params.decimals` — Decimal places
- `params.customFeatures?` — Feature flags (Custom preset only)
- `params.transferHookProgram?` — Hook program ID (auto-set for SSS-2)

### `SolanaStablecoin.load(provider, mint)`

Load an existing stablecoin.

```typescript
const stable = await SolanaStablecoin.load(provider, mintPublicKey);
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `mint` | `PublicKey` | Token-2022 mint address |
| `configPDA` | `PublicKey` | Config PDA address |
| `preset` | `Presets` | Active preset |
| `tokens` | `TokenOperations` | Token operation methods |
| `roles` | `RoleManager` | Role management methods |
| `compliance` | `ComplianceModule` | SSS-2 compliance methods |

## TokenOperations (`stable.tokens.*`)

### `mint(destination, amount)`
```typescript
await stable.tokens.mint(destinationATA, 1_000_000n);
```

### `burn(source, amount)`
```typescript
await stable.tokens.burn(sourceATA, 500_000n);
```

### `freezeAccount(tokenAccount)`
### `thawAccount(tokenAccount)`
### `pause()`
### `unpause()`
### `getSupplyInfo()`

```typescript
const { totalMinted, totalBurned, circulating } = await stable.tokens.getSupplyInfo();
```

## RoleManager (`stable.roles.*`)

### `grant(holder, role, mintQuota?)`
```typescript
await stable.roles.grant(minterAddress, Role.Minter, 5_000_000n);
```

### `revoke(holder, role)`
### `getRoles(holder)`
### `hasRole(holder, role)`
### `transferAuthority(newAuthority)`

## ComplianceModule (`stable.compliance.*`)

> Only available on SSS-2 stablecoins. Throws on SSS-1.

### `addToBlacklist(address)`
### `removeFromBlacklist(address)`
### `isBlacklisted(address)`
### `getBlacklistEntry(address)`
### `seize(source, destination, amount, blacklistedAddress)`

```typescript
await stable.compliance.addToBlacklist(badActor);
await stable.compliance.seize(badActorATA, treasuryATA, amount, badActor);
```

## PDA Utilities

```typescript
import { findConfigPDA, findRolePDA, findBlacklistPDA } from "@solana-stablecoin/sdk";

const [configPDA, bump] = findConfigPDA(mintPubkey);
const [rolePDA] = findRolePDA(configPDA, holderPubkey);
const [blacklistPDA] = findBlacklistPDA(mintPubkey, flaggedAddress);
```
