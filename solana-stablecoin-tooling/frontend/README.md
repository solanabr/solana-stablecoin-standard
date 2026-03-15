# SSS Frontend — Stablecoin Admin Dashboard

Interactive web UI for managing Solana Stablecoin Standard tokens on devnet.

## Features

- **Wallet Connection** — Phantom & Solflare support via Solana Wallet Adapter
- **Overview Dashboard** — Live supply, authority, feature flags, pause status
- **Mint / Burn** — Issue and redeem tokens with destination selection
- **Freeze / Thaw** — Freeze individual accounts or globally pause the token
- **Role Management** — Grant/revoke Minter, Burner, Pauser, Blacklister, Seizer roles
- **Compliance Panel** — Blacklist check, add/remove (SSS-2 only)
- **Explorer Links** — Direct links to Solana Explorer for all addresses & transactions

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and:

1. Connect your Phantom/Solflare wallet (set to devnet)
2. Enter a stablecoin mint address
3. Manage your stablecoin

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- @solana/wallet-adapter-react
- @solana/web3.js + @solana/spl-token
- Raw transaction building (no IDL dependency)

## Screenshots

The dashboard reads on-chain state directly from the stablecoin config PDA and Token-2022 mint account. All operations build versioned transactions that are signed via the wallet adapter.
