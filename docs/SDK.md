# SDK (`@stbr/sss-token`)

## Install

```bash
pnpm add @stbr/sss-token
```

## What the SDK does

The SDK is the primary user-facing product surface for this repository. It handles:

- preset selection (`SSS-1`, `SSS-2`)
- custom extension configuration
- PDA derivation
- mint creation
- config initialization
- transfer-hook setup for `SSS-2`
- admin operations such as mint, burn, pause, blacklist, and seize

The canonical creation flow is multi-step. The SDK creates the Token-2022 mint first, then attaches the SSS config to that mint.

## Preset initialization

```ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Presets, SolanaStablecoin } from '@stbr/sss-token';

const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const payer = Keypair.generate();

const sss1 = await SolanaStablecoin.create(connection, {
  payer,
  preset: Presets.SSS_1,
  name: 'USD1',
  symbol: 'USD1',
  uri: 'https://example.org/usd1.json',
  decimals: 6,
  treasury: new PublicKey('<TREASURY_TOKEN_ACCOUNT>'),
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});
```

## SSS-2 preset example

```ts
const sss2 = await SolanaStablecoin.create(connection, {
  payer,
  preset: Presets.SSS_2,
  name: 'USD2',
  symbol: 'USD2',
  uri: 'https://example.org/usd2.json',
  decimals: 6,
  treasury: new PublicKey('<TREASURY_TOKEN_ACCOUNT>'),
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});
```

## Custom configuration

```ts
const custom = await SolanaStablecoin.create(connection, {
  payer,
  name: 'cUSD',
  symbol: 'cUSD',
  uri: 'https://example.org/cusd.json',
  decimals: 6,
  extensions: {
    enableCompliance: true,
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: false,
    seizeRequiresBlacklist: true,
  },
  roles: {
    treasury: new PublicKey('<TREASURY_TOKEN_ACCOUNT>'),
  },
  initialMinterQuota: 2_000_000_000n,
  initialMinterWindowSeconds: 3600,
});
```

## Metadata model

`name`, `symbol`, and `uri` are stored on-chain in the `StablecoinConfig` PDA. The SDK points the mint metadata pointer at that PDA and exposes metadata through `getMetadata()`.

## Core operations

- `mint`, `burn`
- `freeze`, `thaw`
- `pause`, `unpause`
- `updateMinter`, `updateRoles`, `transferAuthority`
- `getSupply`, `getConfig`
- `getMetadata`

## TypeScript operation examples

```ts
await sss1.mint({
  authority: payer,
  recipientTokenAccount: new PublicKey('<ATA>'),
  amount: 1_000_000n,
});

await sss1.pause(payer);
await sss1.unpause(payer);
```

## SSS-2 compliance operations

- `compliance.blacklistAdd`
- `compliance.blacklistRemove`
- `compliance.seize`

If compliance is disabled, SDK throws `ComplianceDisabledError`.

```ts
await sss2.compliance.blacklistAdd(
  payer,
  new PublicKey('<WALLET>'),
  'Sanctions match',
);

await sss2.compliance.seize({
  authority: payer,
  sourceTokenAccount: new PublicKey('<SOURCE_ATA>'),
  destinationTokenAccount: new PublicKey('<TREASURY_ATA>'),
  sourceOwner: new PublicKey('<SOURCE_OWNER>'),
  amount: 500_000n,
});
```
