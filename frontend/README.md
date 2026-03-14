# SSS Frontend Dashboard

<div align="center">

![SSS Dashboard](https://via.placeholder.com/800x400/1a1a2e/9945FF?text=SSS+Dashboard)

**Professional React Dashboard for Solana Stablecoin Standard**

[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC.svg)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

</div>

## Features

### 📊 Dashboard Overview
- **Real-time Supply Chart**: 24-hour supply history with area visualization
- **Transaction Volume**: Line chart showing transaction activity
- **Key Metrics Cards**: Supply, volume, holders, transactions at a glance
- **Holder Distribution**: Interactive pie chart breakdown

### 🔧 Operations Panel
- **Mint Tokens**: Issue new tokens with amount validation
- **Burn Tokens**: Destroy tokens from any account
- **Transfer**: Send tokens between wallets
- **Role Management**: Grant/revoke minter, burner, freezer roles

### 🛡️ Compliance Panel
- **Blacklist Management**: Add/remove addresses from blacklist
- **Freeze/Thaw**: Freeze or unfreeze token accounts
- **Seize Tokens**: Reclaim tokens from bad actors
- **Pause Protocol**: Emergency pause functionality

### 👥 Holders Panel
- **Top Holders Table**: Ranked by balance
- **Holder Search**: Find specific addresses
- **Account Status**: Frozen, blacklisted indicators
- **Distribution Analytics**: Wealth concentration metrics

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

Create `.env.local`:

```bash
# Solana cluster
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# SSS Program IDs
NEXT_PUBLIC_SSS_TOKEN_PROGRAM=2L6rZHyqXJqXhbgW7vyP3uerrw7Vzpp3qtqAq1FZj
NEXT_PUBLIC_SSS_HOOK_PROGRAM=E3pPcPAU4Un7WMaHyMnG6L3SJ8dNu4gjZGU6ExqvhRzS

# Default mint (optional)
NEXT_PUBLIC_DEFAULT_MINT=
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 15** | React framework with App Router |
| **React 19** | UI library |
| **TailwindCSS** | Utility-first styling |
| **Framer Motion** | Smooth animations |
| **Recharts** | Data visualization |
| **@solana/wallet-adapter** | Wallet connection |
| **@tanstack/react-query** | Data fetching & caching |
| **Lucide React** | Icon library |

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx      # Root layout
│   │   ├── page.tsx        # Dashboard page
│   │   ├── providers.tsx   # Context providers
│   │   └── globals.css     # Global styles
│   ├── components/
│   │   ├── ui/             # Reusable UI components
│   │   ├── charts/         # Chart components
│   │   └── forms/          # Form components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   └── services/           # API services
├── public/                 # Static assets
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## Screenshots

### Dashboard View
![Dashboard](https://via.placeholder.com/800x500/1a1a2e/14F195?text=Dashboard+View)

### Operations Panel
![Operations](https://via.placeholder.com/800x500/1a1a2e/9945FF?text=Operations+Panel)

### Compliance Panel
![Compliance](https://via.placeholder.com/800x500/1a1a2e/00D4FF?text=Compliance+Panel)

## Wallet Support

- **Phantom** ✅
- **Solflare** ✅
- **Backpack** ✅
- **Ledger** ✅

## Development

```bash
# Run with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Format code
npx prettier --write .
```

## Deployment

### Vercel (Recommended)
```bash
npm i -g vercel
vercel
```

### Docker
```bash
docker build -t sss-frontend .
docker run -p 3000:3000 sss-frontend
```

## License

Apache-2.0
