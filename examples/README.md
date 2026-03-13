# Solana Stablecoin Standard - Examples

This directory contains runnable example scripts demonstrating the Solana Stablecoin Standard (SSS) presets and capabilities.

## Prerequisites

- [Anchor](https://www.anchor-lang.com/) installed (`cargo install --git https://github.com/coral-xyz/anchor anchor-cli`)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) installed
- Node.js 18+ and Yarn
- Programs built: `anchor build`

## Running Examples

Examples use the Anchor provider from environment variables. Set your cluster and wallet:

```bash
# For devnet
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json

# Or use default (localnet)
# ANCHOR_PROVIDER_URL defaults to http://localhost:8899
```

Run an example:

```bash
# From repo root, after anchor build
npx ts-node -p tsconfig.json examples/sss-1-lifecycle.ts
```

For localnet, start a validator first: `solana-test-validator` (in another terminal) or use `anchor test` which runs the full test suite.

## Example Scripts

| Script | Description |
|--------|-------------|
| **sss-1-lifecycle.ts** | Full SSS-1 (Minimal Stablecoin) lifecycle: initialize → setup minter → mint → transfer → freeze → thaw → burn |
| **sss-2-compliance.ts** | Full SSS-2 (Compliant Stablecoin) lifecycle: initialize → mint → blacklist → attempt transfer (fails via hook) → seize → remove blacklist |
| **custom-config.ts** | Creates a custom stablecoin with specific extensions (e.g., permanent delegate only, supply cap, custom metadata) |

## Architecture Overview

- **SSS-1**: Mint authority + freeze authority. Suitable for internal tokens, DAO treasuries, ecosystem settlement.
- **SSS-2**: SSS-1 + permanent delegate + transfer hook + blacklist. For regulated stablecoins with on-chain compliance.
- **Custom**: Mix and match extensions (permanent delegate, transfer hook, default frozen) and parameters (supply cap, decimals, etc.).

## Dependencies

Examples depend on:

- `@coral-xyz/anchor`
- `@solana/web3.js`
- `@solana/spl-token`

These are provided by the workspace root and SDK packages.
