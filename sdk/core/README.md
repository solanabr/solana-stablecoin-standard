# `@stbr/sss-token`

TypeScript SDK and CLI for the Solana Stablecoin Standard (SSS).

## Features

- Preset configurations (SSS-1 basic, SSS-2 compliance)
- `SolanaStablecoin` client class with `create()` / `load()` factory methods
- Compliance API (blacklist, seize) for SSS-2
- Role management API (grant, revoke, quotas)
- PDA derivation helpers
- Full `sss-token` CLI with all operational commands
- Persistent CLI config (~/.sss-token/config.json)

## SDK Usage

```typescript
import { SolanaStablecoin } from "@stbr/sss-token";

// Create a new stablecoin
const coin = await SolanaStablecoin.create(provider, {
  name: "USD Stablecoin",
  symbol: "USDX",
  decimals: 6,
  preset: Presets.SSS_2,
});

// Load an existing stablecoin
const existing = await SolanaStablecoin.load(provider, mintAddress);

// Operations
await coin.mint(recipientAta, 1_000_000);
await coin.burn(burnerAta, 500_000);
await coin.freezeAccount(targetAta);
await coin.pause();

// Compliance (SSS-2 only)
await coin.compliance.addToBlacklist(address);
await coin.compliance.seize(fromAta, treasuryAta, amount);
```

## CLI Usage

```bash
# Configure
sss-token config set --cluster devnet --keypair ~/.config/solana/id.json

# Initialize
sss-token init --preset sss-2 --name "USDX" --symbol "USDX" --decimals 6

# Operations
sss-token mint --to <ADDRESS> --amount 1000000
sss-token burn --amount 500000
sss-token status
sss-token supply

# Compliance
sss-token blacklist add <ADDRESS>
sss-token seize --from <OWNER> --to <TREASURY> --amount 1000

# Management
sss-token roles grant --role minter --holder <ADDRESS>
sss-token minters add --address <ADDRESS> --quota 1000000
sss-token authority propose <NEW_AUTHORITY>
```

## Building

```bash
pnpm install
pnpm build
```

## Testing

```bash
pnpm test
```
