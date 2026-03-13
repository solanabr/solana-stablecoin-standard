# SDK

## Entry Point

Import the SDK from `@stbr/sss-token`.

```ts
import { Presets, SolanaStablecoin } from "@stbr/sss-token";
```

## Presets

- `Presets.SSS_1`: mint/burn/freeze/pause baseline
- `Presets.SSS_2`: adds permanent delegate, transfer hook, and compliance helpers
- `Presets.SSS_3`: confidential-transfer-ready mint config + on-chain ZK compliance + compressed compliance-state profile

## Example

```ts
const stable = await SolanaStablecoin.create({
  connection,
  authority,
  preset: Presets.SSS_2,
  name: "My Stablecoin",
  symbol: "MYUSD",
  decimals: 6
});

await stable.mint({ recipient, amount: 1_000_000n, minter: authority });
await stable.compliance.blacklistAdd(address, "Sanctions match");
```

## SSS-3 Proof Flow

The SDK exposes the full SSS-3 proof receipt lifecycle:

```ts
await stable.updateComplianceRootOnChain(rootHex);
await stable.initializeTransferHookMetaListOnChain();
await stable.submitProofReceiptOnChain({
  subject,
  commitment,
  proofCommitment,
  response,
  merkleSiblings,
  merkleDirections,
  circuit: "sss3-merkle-schnorr-v1",
  expiresAtSlot
});
await stable.revokeProofReceiptOnChain(subject);
```

## Registry Entry

```ts
const entry = await stable.getRegistryEntry();

console.log(entry.configHash);
console.log(entry.standardVersion);
console.log(entry.enableConfidentialTransfers);
```

## On-Chain Registry

```ts
import {
  buildRegisterReleaseInstruction,
  buildRegisterStablecoinInstruction
} from "@stbr/sss-token";

const releaseIx = buildRegisterReleaseInstruction({
  authority: authority.publicKey,
  standardVersion: "sss/1.1.0",
  preset: "sss-3",
  schemaHash: entry.configHash,
  notesUri: "https://example.com/sss/1.1.0"
});

const registerIx = buildRegisterStablecoinInstruction({
  authority: authority.publicKey,
  stablecoinProgramId: stable.getProgramId(),
  entry
});
```

The CLI exposes the same flows as dry-run builders:

- `sss-token registry-register --dry-run`
- `sss-token registry-release --dry-run --notes-uri https://example.com/releases/sss-1-1-0`

## Real On-Chain Creation

```ts
const { stablecoin, signature } = await SolanaStablecoin.createOnChain({
  connection,
  authority,
  preset: Presets.SSS_1,
  name: "Devnet USD",
  symbol: "dUSD",
  decimals: 6
});
```

## Additional Builders

- `buildBlacklistAddTransaction`
- `buildBlacklistRemoveTransaction`
- `buildAuthorityTransferTransaction`
- `loadIdl(path)` for loading generated Anchor IDL JSON into tooling
- Shared validation helpers reject invalid metadata, zero amounts, and empty blacklist reasons before instruction construction

## CLI Config Files

The CLI accepts `--custom` config files. Example starter configs are available at:

- `SAMPLE_SSS1.toml`
- `SAMPLE_ISSUER_BASE.toml`
- `SAMPLE_SSS2.toml`
- `SAMPLE_SSS3.toml`

Config files can extend presets, local TOML files, or local JSON files. Inheritance is resolved recursively and child overrides always win:

```toml
[preset]
extends = ["./SAMPLE_ISSUER_BASE.toml"]

[overrides]
name = "Example Regulated USD"
symbol = "rUSD"
default_account_frozen = false
standard_version = "sss/1.0.0"

[registry]
homepage = "https://issuer.example.com"
jurisdiction = "US"
```

CLI flags still override inherited config values. The registry-related flags are `--homepage`, `--jurisdiction`, and `--standard-version`.
