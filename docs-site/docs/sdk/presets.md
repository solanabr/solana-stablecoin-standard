---
title: Presets
description: Preset configurations for SSS-1, SSS-2, SSS-3, and custom feature flags.
---

# Presets

Presets control the feature flags passed into `initialize`.

## `PresetConfig`

```ts
interface PresetConfig {
  preset: { [K in StablecoinPreset]?: {} };
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  enableConfidentialTransfers: boolean;
}
```

## Built-In Presets

| Preset | Permanent delegate | Transfer hook | Default frozen | Confidential transfers |
| --- | --- | --- | --- | --- |
| `SSS1` | `false` | `false` | `false` | `false` |
| `SSS2` | `true` | `true` | `false` | `false` |
| `SSS3` | `true` | `false` | `false` | `true` |
| `Custom` | `false` | `false` | `false` | `false` |

## Exported Helpers

```ts
PRESET_CONFIGS: Record<StablecoinPreset, PresetConfig>
buildInitializeParams(
  name: string,
  symbol: string,
  uri: string,
  decimals: number,
  preset: StablecoinPreset,
  customFlags?: CustomFeatureFlags
): InitializeParams
getPresetAnchorEnum(preset: StablecoinPreset): { [key: string]: {} }
```

## `buildInitializeParams`

For `SSS1`, `SSS2`, and `SSS3`, the helper sets the feature override fields to `null`, which tells the on-chain program to use the preset defaults.

For `Custom`, the helper fills concrete booleans.

### Example: SSS-2

```ts
const params = buildInitializeParams(
  "USD Coin",
  "USDC",
  "https://example.com/meta.json",
  6,
  StablecoinPreset.SSS2
);
```

### Example: Custom

```ts
const params = buildInitializeParams(
  "Private Treasury USD",
  "ptUSD",
  "https://example.com/meta.json",
  6,
  StablecoinPreset.Custom,
  {
    enablePermanentDelegate: true,
    enableTransferHook: false,
    enableDefaultStateFrozen: true,
    enableConfidentialTransfers: false,
  }
);
```

## `getPresetAnchorEnum`

Returns the Anchor enum object only.

```ts
getPresetAnchorEnum(StablecoinPreset.SSS2)
// => { sss2: {} }
```

Use this when you want to construct `InitializeParams` manually.

## Operational Guidance

- choose `SSS1` for simple issuer-controlled tokens
- choose `SSS2` for transfer-hook blacklist enforcement
- choose `SSS3` for confidential-transfer-ready mints
- choose `Custom` only when you understand the feature interactions

:::caution
In the current on-chain implementation, blacklist and seizure gating is keyed off `enablePermanentDelegate`. A custom mint with permanent delegate enabled but transfer hook disabled can still blacklist, freeze, and seize, but it will not get per-transfer hook checks.
:::
