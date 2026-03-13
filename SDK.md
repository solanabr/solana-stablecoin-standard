# SDK Guide

## Presets

Use `Presets.SSS_1` for minimal stablecoins and `Presets.SSS_2` for compliance-enabled stablecoins.

```ts
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
```

## Custom Configs

You can skip presets and pass custom extension flags:

```ts
const stable = await SolanaStablecoin.create(connection, {
  name: "Custom Stable",
  symbol: "CUSD",
  decimals: 6,
  extensions: {
    permanentDelegate: true,
    transferHook: false,
    defaultAccountFrozen: false,
  },
  authority: adminKeypair,
});
```

## TypeScript Examples

### Create and Mint

```ts
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  authority: adminKeypair,
});

await stable.mint({
  recipient: user.publicKey,
  amount: 1_000_000,
  minter: adminKeypair,
});
```

### Freeze / Thaw

```ts
const ata = stable.getAssociatedTokenAddress(user.publicKey);
await stable.freeze(ata, adminKeypair);
await stable.thaw(ata, adminKeypair);
```

### Compliance APIs (SSS-2)

```ts
await stable.compliance.blacklistAdd(user.publicKey, "sanctions");
await stable.compliance.blacklistRemove(user.publicKey);
await stable.compliance.seize(userAta, treasury.publicKey, 500_000);
```

### Pause / Unpause

```ts
await stable.pause(adminKeypair);
await stable.unpause(adminKeypair);
```
