# Bonus Features

Three bonus modules extending the core SSS-1/SSS-2 stablecoin implementation.

## 1. Example Frontend — Web Dashboard

**Location:** `frontend/`

Interactive React web app for stablecoin administration via browser wallet.

- **Stack:** React 18, Vite, Tailwind CSS, Solana Wallet Adapter
- **Features:** Dashboard overview, mint/burn, freeze/thaw, pause/unpause, role management, blacklist checker, compliance panel
- **Wallets:** Phantom, Solflare
- **Network:** Devnet

```bash
cd frontend && npm install && npm run dev
# Open http://localhost:5173
```

## 2. Interactive Admin TUI — Terminal Dashboard

**Location:** `tui/`

Real-time terminal dashboard with blessed for live monitoring and operations.

- **Stack:** Node.js, blessed, blessed-contrib
- **Features:** Live supply tracking, auto-polling (5s), supply change detection, blacklist checker, feature flags display, config overview
- **Keybindings:** `r` refresh, `c` check blacklist, `q` quit

```bash
cd tui && npm install
node src/index.js --mint <MINT_ADDRESS>
```

## 3. Oracle Integration Module — Non-USD Pricing

**Location:** `programs/oracle-pricing/`, `sdk/src/oracle.ts`, `docs/ORACLE.md`

Separate Anchor program for oracle-based pricing, supporting non-USD pegs.

- **Providers:** Pyth Network, Switchboard V2
- **Currencies:** USD, EUR, BRL, GBP, JPY, CPI-indexed, Custom
- **Features:** Price freshness validation, peg deviation checks, CPI-gated mint/redeem, configurable tolerance
- **SDK:** `OraclePricing` class with `getCurrentPrice()`, `calculateMintAmount()`, `isWithinPeg()`

```typescript
import { OraclePricing } from '@sss/sdk/oracle';
const oracle = new OraclePricing(connection, mint);
const price = await oracle.getCurrentPrice();
```

## Summary

| Feature | Status | Complexity | Lines |
|---------|--------|-----------|-------|
| Example Frontend | ✅ Complete | React + Vite + Tailwind | ~800 |
| Admin TUI | ✅ Complete | blessed + blessed-contrib | ~350 |
| Oracle Module | ✅ Complete | Anchor program + SDK | ~600 |
| SSS-3 Private | ⏭ Skipped | Confidential transfers immature | — |
