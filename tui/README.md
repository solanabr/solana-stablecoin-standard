# SSS Token Dashboard (TUI)

Terminal UI dashboard for the [Solana Stablecoin Standard](https://github.com/solanabr/solana-stablecoin-standard). Monitor token info, supply, status, events, and minters in a professional terminal interface.

## Installation

```bash
cd tui
npm install
```

## Build

```bash
npm run build
```

## Usage

### Run with Mock Data (no connection)

When `RPC_URL` and `MINT_ADDRESS` are not set, the dashboard displays placeholder mock data:

```bash
npm start
# or
npx sss-tui
```

### Run with Live Data

Set environment variables to connect to a real Solana RPC and mint:

```bash
RPC_URL=https://api.devnet.solana.com MINT_ADDRESS=<your-mint-pubkey> npm start
```

Or create a `.env` file in the `tui` directory:

```
RPC_URL=https://api.devnet.solana.com
MINT_ADDRESS=YourMintPublicKeyHere
```

Then run:

```bash
npm start
```

## Panels

| Panel | Description |
|-------|-------------|
| **Token Info** | Name, symbol, decimals, preset (SSS-1/SSS-2), authority |
| **Supply** | Current supply, minted, burned, cap, utilization bar |
| **Status** | Paused state, transfer hook, permanent delegate, default frozen |
| **Recent Events** | Scrollable log of program events |
| **Minters** | Active minters with quotas and minted amounts |
| **Quick Actions** | Keyboard shortcuts |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `r` | Refresh data |
| `p` | Pause (shows info – requires CLI for actual pause) |
| `u` | Unpause (shows info – requires CLI for actual unpause) |
| `q` or `Ctrl+C` | Quit |

## Color Coding

- **Green** – Active, enabled, healthy
- **Red** – Paused
- **Yellow** – Warning (e.g., default frozen, mock mode)

## Auto-Refresh

The dashboard refreshes every 10 seconds. Press `r` for an immediate refresh.
