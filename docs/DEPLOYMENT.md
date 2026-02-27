# Deployment Guide

## Prerequisites

- Solana CLI v1.18+  
- Anchor CLI v0.30.1+  
- Node.js v18+  
- Funded devnet wallet (min 5 SOL)

## Devnet Deployment

### 1. Configure Solana for Devnet

```bash
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/id.json
```

### 2. Fund Your Wallet

```bash
solana airdrop 2
solana balance
```

### 3. Build Programs

```bash
anchor build
```

### 4. Deploy Programs

```bash
# Deploy SSS-1 Token Program
anchor deploy --program-name sss_token --provider.cluster devnet

# Deploy SSS-2 Transfer Hook Program  
anchor deploy --program-name sss_transfer_hook --provider.cluster devnet
```

### 5. Verify Deployment

```bash
# Verify program is deployed
solana program show <PROGRAM_ID>

# Check program authority
solana program show <PROGRAM_ID> --programs
```

## Program IDs (Devnet)

| Program | ID | Deploy Signature |
|---|---|---|
| sss_token | `8JpbyYEJXLeWoPJcLsHWg64bDtwFZXhPoubVJPeH11aH` | `62yciHzHHpCaLdVavBx2rE6PmL49t3J1tJNtMoc75sCHrXBWaueaBaJKUfgr5NHazbH4z9EW1v82RkrFxmTGLYv1` |
| sss_transfer_hook | `By3BWwxkz7uFMRw1bD63VUnVMysMh79A3A6D58cHaXmB` | `56cWHqXwhrsivaEqVRgNR37iFfbSNtz2Q9tFGrgQJZREfFDPLe568Z9qtWk9qwLUfGnDYUVrxXt8LgFxn3HR5FE2` |

## Example Operations (Devnet)

### Initialize Stablecoin (SSS-2)

```bash
yarn cli init --preset sss-2 \
  -n "Devnet USD" \
  -s "dUSD" \
  -d 6 \
  --rpc-url https://api.devnet.solana.com
```

### Add Minter Role

```bash
yarn cli add-role \
  --role minter \
  --address <MINTER_PUBKEY> \
  -m <MINT_ADDRESS> \
  --rpc-url https://api.devnet.solana.com
```

### Mint Tokens

```bash
yarn cli mint \
  --to <RECIPIENT_ATA> \
  --amount 1000000000 \
  -m <MINT_ADDRESS> \
  --rpc-url https://api.devnet.solana.com
```

### Add to Blacklist

```bash
yarn cli blacklist \
  --add <ADDRESS> \
  -m <MINT_ADDRESS> \
  --rpc-url https://api.devnet.solana.com
```

## Verification

Verify on Solana Explorer:
- Token Program: `https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet`
- Transfer Hook: `https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet`

Or use Solscan:
- `https://solscan.io/account/<PROGRAM_ID>?cluster=devnet`

## Backend Deployment (Docker)

```bash
cd backend
docker compose up -d
```

Environment variables required:
```env
RPC_URL=https://api.devnet.solana.com
KEYPAIR_PATH=/path/to/keypair.json
DATABASE_URL=postgresql://user:pass@localhost:5432/sss
REDIS_URL=redis://localhost:6379
WEBHOOK_URL=https://your-webhook-endpoint.com/events
INDEXER_ENABLED=true
```

## Health Check

```bash
curl http://localhost:3000/health
```
