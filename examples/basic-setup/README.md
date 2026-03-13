# Basic Setup

Initializes a fresh SSS-2 stablecoin on Solana devnet with the TypeScript SDK.

## Prerequisites

- A devnet-funded keypair at `KEYPAIR_PATH` or `~/.config/solana/id.json`
- Node.js 18+

```bash
cd examples/basic-setup
npm install
RPC_URL=https://api.devnet.solana.com npm run start
```

The script creates a new mint, initializes the transfer-hook metadata list, and prints the mint address plus transaction signatures.
