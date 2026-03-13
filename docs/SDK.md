# TypeScript SDK Reference

The `@stbr/sss-token` SDK provides an ergonomic wrapper over the Solana Stablecoin Standard Anchor instructions.

## Architecture
The SDK consists of `core.ts` (primary interaction), `presets.ts` (configuration mappings), and `compliance.ts` (module operations such as seizures and blacklisting).

## Initialization
We expose `Presets.SSS_1` and `Presets.SSS_2` to strictly enforce parameters matching the operational standards.

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

const custom = await SolanaStablecoin.create(connection, program, {
  preset: Presets.SSS_2,
  authority: adminKeypair,
}, { name: "MyUSD", symbol: "MUSD", uri: "", decimals: 6 });
```

## Supported Operations
- `mint({ recipient, amount, minter })`: Validates `MinterQuota` on-chain and emits tokens.
- `blacklistAdd(account, reason)`: Uses the `Blacklister` role to freeze interaction (SSS-2).
- `seize(from, to, amount)`: Authoritively confiscates a user's funds (SSS-2 only).
