# SSS Frontend Admin

React + TypeScript + Vite admin interface for Solana Stablecoin Standard.

## Features

- Wallet adapter integration
- Stablecoin load + background refresh dashboard
- Create stablecoin (SSS-1 / SSS-2)
- Manage minters and operational roles
- Mint & burn operations
- Freeze & thaw operations
- Compliance operations (blacklist/check/seize)
- Holders view with CSV export
- Activity/event stream
- Custom RPC endpoint support from UI

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Default app URL: `http://localhost:5173`

## Build

```bash
npm run build
npm run preview
```

## Runtime Requirements

- Browser wallet (Phantom/Solflare/etc.)
- Access to a Solana RPC endpoint (devnet/mainnet/custom)
- `solana-stablecoin-sdk` available (workspace `file:../sdk` during local dev)

## Deploy on Vercel

### Option A — Vercel CLI

```bash
cd frontend
npm i -g vercel
vercel
```

When prompted:
- Framework: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

For production:

```bash
vercel --prod
```

### Option B — GitHub import in Vercel dashboard

1. Import the repository.
2. Set root directory to `frontend`.
3. Set build command to `npm run build`.
4. Set output directory to `dist`.
5. Deploy.

### Recommended Environment Variables

If you want a fixed default RPC endpoint at deploy time, define:

- `VITE_DEFAULT_RPC_URL`
- `VITE_DEFAULT_NETWORK`

(If not set, users can still choose network/RPC in-app.)

## Post-Deploy Smoke Checklist

- Connect wallet
- Load a known mint from dashboard
- Verify stats refresh updates without blocking UI
- Run one low-risk action (e.g., holders refresh)
- Verify explorer links open correctly
