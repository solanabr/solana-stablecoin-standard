# Examples

Practical usage scripts for the Solana Stablecoin Standard SDK.

## Prerequisites

```bash
# Start localnet + deploy programs
anchor build
solana-test-validator &
anchor deploy

# Install dependencies
pnpm install
```

## Examples

| Example | Preset | What It Shows |
|---------|--------|---------------|
| [`basic-sss1.ts`](./basic-sss1.ts) | SSS-1 | Full lifecycle: create, mint, burn, freeze, pause, query |
| [`compliant-sss2.ts`](./compliant-sss2.ts) | SSS-2 | Compliance: blacklist, freeze, seize, remove |
| [`private-sss3.ts`](./private-sss3.ts) | SSS-3 | CT-enabled stablecoin + confidential transfer guidance |
| [`supply-cap.ts`](./supply-cap.ts) | SSS-1 | Supply cap: mint under, at, and over cap |

## Running

```bash
# Run individual examples
npx ts-node examples/basic-sss1.ts
npx ts-node examples/compliant-sss2.ts
npx ts-node examples/private-sss3.ts
npx ts-node examples/supply-cap.ts

# Run confidential transfer E2E (spl-token CLI)
bash scripts/test-ct-e2e.sh
```

## SDK Quick Reference

```typescript
import { SolanaStablecoin, Presets } from "@stbr/sss-token";

// Create
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: "SSS_2",  // or "SSS_1", "SSS_3"
  name: "My Token",
  symbol: "MYT",
  decimals: 6,
  supplyCap: BigInt(1_000_000_000_000),   // optional
  roles: {
    blacklister: blacklisterPubkey,        // SSS-2
    seizer: seizerPubkey,                  // SSS-2
  },
});

// Operations
await stable.mint({ recipient, amount: BigInt(1_000_000) });
await stable.burn({ tokenAccount, amount: BigInt(500_000) });
await stable.freeze({ address });
await stable.thaw({ address });
await stable.pause();
await stable.unpause();

// Compliance (SSS-2)
await stable.compliance.blacklistAdd(address, "Sanctions");
await stable.compliance.seize(from, treasury);
await stable.compliance.isBlacklisted(address);

// Query
const config = await stable.getConfig();
const supply = await stable.getTotalSupply();
```
