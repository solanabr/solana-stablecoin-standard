# SSS Admin TUI

> Interactive terminal dashboard for Solana Stablecoin Standard monitoring and operations.

---

## Screenshot

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⬡ SSS Admin TUI  │  ● devnet  │  Mint: 6NMdvU…  │  q quit Tab ops  │
├─── Total Supply ──┬─── Total Minted ─┬── Total Burned ──┬─ Status ──┤
│                   │                  │                  │           │
│   1,000,000.00    │   1,200,000.00   │    200,000.00    │ ● ACTIVE  │
│                   │                  │                  │  SSS-2    │
│                   │                  │                  │ 45 holders│
├───── Supply History ────────────────────────┬─── Operations ────────┤
│  Minted ━━━━━╲    Burned ━━━━━━             │  ⬡  Mint Tokens      │
│              ╲━━━━━━━━━━━                   │  🔥 Burn Tokens      │
│  ━━━━━━━━━━━╱                               │  ⏸  Pause / Unpause  │
│           ╱                  ━━━━━━━━━━━━   │  ➕ Add Minter       │
│  ━━━━━━━╱━━━━━━━━━━╱                        │  ➖ Remove Minter    │
│                                             │  🧊 Freeze Account   │
│  t-9  t-8  t-7  t-6  t-5  t-4  t-3  t-2    │  🔓 Thaw Account     │
│                                             │  📋 View Holders     │
│                                             │  🔄 Refresh Data     │
├───── Event Log ─────────────────────────────┼─── Top Holders ──────┤
│ [12:34:05] SSS Admin TUI starting...        │ Address    Balance   │
│ [12:34:05] Cluster: devnet                  │ 6NMdvU…   500,000   │
│ [12:34:06] Connected to mint account        │ C6psRv…   300,000   │
│ [12:34:06] Found 45 token accounts          │ 8SXvCh…   100,000   │
│ [12:34:06] Data refreshed ✓                 │ HesSdr…    50,000   │
│ [12:34:06] Subscribed to account changes    │ GvDMxP…    25,000   │
├─── Wallet: 6NMdvU… │ Balance: 4.2 SOL │ Block: 285,432,100 ──────┤
└──────────────────────────────────────────────────────────────────────┘
```

## Features

- **Real-time Dashboard**: Supply stats, holder count, pause status
- **Operations Panel**: Mint, burn, pause, freeze, thaw — all from the terminal
- **Event Log**: Live event stream with timestamps
- **Supply Chart**: Visual mint/burn history over time
- **Top Holders Table**: Largest token accounts
- **Auto-refresh**: Data refreshes every 30 seconds + WebSocket subscription
- **Keyboard Navigation**: `Tab` for operations, `r` for refresh, `q` to quit

## Usage

```bash
cd tui
npm install
npx tsx src/index.ts --cluster devnet --mint 6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--cluster` | `devnet`, `mainnet`, or `localnet` | `devnet` |
| `--mint` | Stablecoin mint address | none |
| `--wallet` | Path to wallet keypair JSON | `~/.config/solana/id.json` |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Focus operations panel |
| `r` | Refresh all data |
| `↑`/`↓` | Navigate operations |
| `Enter` | Execute selected operation |
| `q` / `Ctrl+C` | Quit |

## Architecture

```
tui/
├── src/
│   └── index.ts     # Main TUI app (blessed + blessed-contrib)
├── package.json
├── tsconfig.json
└── README.md
```

The TUI connects directly to Solana RPC (no backend needed) and reads on-chain state using the same program IDL as the SDK. Operations prompt for confirmation before submitting transactions.
