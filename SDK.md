# SDK

The TypeScript SDK lives in `sdk/client` and wraps the generated web3.js bindings with preset-aware helpers.

## Package Surface

Key exports from `@stbr/sss-client`:

- `StablecoinClient`
- `Stablecoin`
- `Compliance`
- `Presets`
- `PRESET_CONFIGS`
- instruction creators for advanced users

## Presets

Preset defaults are defined in [`sdk/client/src/presets.ts`](/Users/pratik/development/work/solana-stablecoin-standard/sdk/client/src/presets.ts).

| Preset | `enablePermanentDelegate` | `enableTransferHook` | `defaultAccountFrozen` |
| --- | --- | --- | --- |
| `SSS_1` | `false` | `false` | `false` |
| `SSS_2` | `true` | `true` | `true` |

`StablecoinClient.create()` and `getCreateInstructions()` start from the preset, then allow targeted overrides through `extensions`.

## Creating a Client

```ts
import { Connection, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { StablecoinClient } from "@stbr/sss-client";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const client = new StablecoinClient({
  connection,
  wallet,
  stablecoinProgramId: new PublicKey("Gbq8ZoZ4fE2J8wywFDYgSREPWL5qhtaneAX9PwQuQyCC"),
  transferHookProgramId: new PublicKey("6QNzPyTwg2MH778GL8idYiU3teFJiuQx6R5L7xdU17KC"),
});
```

The wallet is required for mutating operations and optional for read-only access.

## Creating a Stablecoin

### `SSS-1`

```ts
import { Presets } from "@stbr/sss-client";

const mint = await client.create({
  preset: Presets.SSS_1,
  name: "Simple USD",
  symbol: "SUSD",
  uri: "https://example.com/simple.json",
  decimals: 6,
});
```

### `SSS-2`

```ts
const mint = await client.create({
  preset: Presets.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
  uri: "https://example.com/regulated.json",
  decimals: 6,
});
```

## Custom Configs

You can start from a preset and override selected Token-2022 extensions:

```ts
const mint = await client.create({
  preset: Presets.SSS_2,
  name: "Frozen USD",
  symbol: "FUSD",
  uri: "https://example.com/fusd.json",
  decimals: 6,
  extensions: {
    defaultAccountFrozen: false,
  },
});
```

Constraints enforced onchain:

- transfer hook cannot be enabled unless permanent delegate is also enabled
- blacklist and seizure role updates are only allowed when the mint is effectively `SSS-2`

## Working With an Existing Mint

```ts
const stable = client.getStablecoin(mintPublicKey);

const config = await stable.getConfig();
const roles = await stable.getRoleConfig();
const totalSupply = await stable.getTotalSupply();
const paused = await stable.isPaused();
const hasTransferHook = await stable.hasTransferHook();
```

## Issuance and Treasury Actions

```ts
await stable.mint({
  recipient: recipient.publicKey,
  amount: 1_000_000n,
});

await stable.burn({
  account: treasuryAta,
  amount: 500_000n,
});

await stable.pause();
await stable.unpause();
```

## Role Management

```ts
await stable.updateRoles({
  pauser: opsAuthority.publicKey,
  burner: treasuryAuthority.publicKey,
});

await stable.updateMinter({
  minter: deskAuthority.publicKey,
  quota: 2_000_000_000_000n,
  active: true,
});

await stable.transferAuthority(newAuthority.publicKey);
```

## Compliance Actions

Compliance helpers are exposed as `stable.compliance` and are only meaningful for `SSS-2`.

```ts
await stable.compliance.blacklistAdd(user.publicKey, "sanctions review");
await stable.compliance.freeze(userAta);
await stable.compliance.seize({
  frozenAccount: userAta,
  frozenAccountOwner: user.publicKey,
  treasury: treasuryAta,
  treasuryOwner: treasuryAuthority.publicKey,
  amount: 250_000n,
});
await stable.compliance.thaw(userAta);
await stable.compliance.blacklistRemove(user.publicKey);
```

## Transactions vs Immediate Sends

The SDK supports three levels:

- instruction builders like `getMintInstruction()`
- transaction builders like `buildMintTransaction()`
- immediate send helpers like `mint()`

That split is useful when integrating with custody, multisig, or external signing flows.

## Generated SDK Regeneration

Generated bindings depend on Anchor IDLs under `target/idl`.

```bash
anchor build
yarn generate
```
