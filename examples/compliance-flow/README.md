# Compliance Flow

Creates a fresh SSS-2 mint on devnet, mints tokens to a holder, blacklists that holder, attempts a hook-enabled transfer that should fail, and then removes the blacklist entry.

## Prerequisites

- A devnet-funded keypair at `KEYPAIR_PATH` or `~/.config/solana/id.json`
- Node.js 18+

```bash
cd examples/compliance-flow
npm install
RPC_URL=https://api.devnet.solana.com npm run start
```

The transfer uses `createTransferCheckedWithTransferHookInstruction(...)` so the example follows the same path real SSS-2 wallets use on devnet.
