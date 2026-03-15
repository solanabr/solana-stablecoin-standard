# SSS Admin TUI — Terminal Dashboard

Real-time terminal UI for monitoring Solana Stablecoin Standard tokens.

```
┌──────────────────────────────────────────────────────────────┐
│  ◎ Solana Stablecoin Standard │ SSS-2 │ ● ACTIVE │ Devnet   │
├────────────────┬──────────────────┬──────────────────────────┤
│   ╭──────╮     │ Configuration    │ Features               │
│  ╱ Supply ╲    │ Preset SSS-2     │ ✓ Mint                 │
│ │ 500,000 │   │ Authority abc... │ ✓ Burn                 │
│  ╲       ╱    │ Decimals 6       │ ✓ Freeze               │
│   ╰──────╯     │ Paused   No      │ ✓ Blacklist            │
├────────────────┴──────────────────┼──────────────────────────┤
│ Activity Log                      │ Status                  │
│ 14:32:01 │ MINT │ 1,000 tokens   │ Supply: 500,000         │
│ 14:31:45 │ BURN │ 500 tokens     │ Since Last: +1,000      │
│ 14:31:30 │ BLACKLIST │ abc CLEAR  │ Mint Auth: abc...def    │
└───────────────────────────────────┴──────────────────────────┘
  r Refresh │ c Check Address │ q Quit
```

## Quick Start

```bash
cd tui
npm install
node src/index.js --mint <MINT_ADDRESS>
```

## Options

| Flag | Description | Default |
|------|------------|---------|
| `-m, --mint` | Stablecoin mint address | Required |
| `-r, --rpc` | RPC endpoint | Devnet |
| `-i, --interval` | Refresh interval (ms) | 5000 |

## Keybindings

| Key | Action |
|-----|--------|
| `r` | Force refresh |
| `c` | Check blacklist status for an address |
| `l` | Scroll activity log |
| `q` / `Esc` | Quit |

## Features

- **Auto-polling** — Refreshes on-chain state every 5 seconds
- **Supply tracking** — Detects mint/burn events between polls
- **Blacklist checker** — Interactive address lookup (press `c`)
- **Feature flags** — Visual display of enabled capabilities
- **Activity log** — Rolling log of detected on-chain changes
