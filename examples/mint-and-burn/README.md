# Mint And Burn

Creates a fresh devnet mint, registers the connected wallet as a minter, mints tokens into its Token-2022 ATA, and burns part of the balance.

## Prerequisites

- A devnet-funded keypair at `KEYPAIR_PATH` or `~/.config/solana/id.json`
- Node.js 18+

```bash
cd examples/mint-and-burn
npm install
RPC_URL=https://api.devnet.solana.com npm run start
```

The output includes the mint address, recipient ATA, mint signature, burn signature, and the remaining token balance.
