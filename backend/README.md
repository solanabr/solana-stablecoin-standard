# @stbr/sss-token-backend

Backend services for Solana Stablecoin Standards (SSS)

## Services

### 1. API Service (Port 3000)
Mint/Burn operations with rate limiting.

**Endpoints:**
- `POST /api/mint` - Mint tokens
- `POST /api/burn` - Burn tokens
- `GET /api/mint/queue` - Get pending mints
- `GET /health` - Health check
- `GET /health/solana` - Solana connection status

### 2. Indexer Service
Event listener that indexes on-chain events to PostgreSQL.

**Monitors:**
- Transfer events
- Fee updates
- Blacklist/whitelist changes
- Stores in PostgreSQL

### 3. Compliance Service (Port 3001)
SSS-2 compliance checks for blacklist/whitelist.

**Endpoints:**
- `POST /check/blacklist` - Check if address is blacklisted
- `POST /check/whitelist` - Check if address is whitelisted
- `POST /check/transfer` - Full compliance check for transfer
- `POST /check/batch` - Batch compliance check
- `GET /stats` - Compliance statistics
- `GET /health` - Health check

## Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | API port |
| `SOLANA_NETWORK` | devnet | Solana network |
| `SOLANA_RPC_URL` | devnet | RPC endpoint |
| `DATABASE_URL` | - | PostgreSQL URL |
| `REDIS_URL` | localhost:6379 | Redis URL |
| `SSS2_PROGRAM_ID` | FSkkSmr... | SSS-2 Program ID |

## Database Schema

### Tables
- `transfers` - Transfer events
- `fee_updates` - Fee configuration changes
- `blacklist_events` - Blacklist additions/removals
- `whitelist_events` - Whitelist additions/removals

## Development

```bash
# Install dependencies
npm install

# Start in development
npm run dev

# Build
npm run build

# Test
npm test
```

## API Usage

### Mint Tokens
```bash
curl -X POST http://localhost:3000/api/mint \
  -H "Content-Type: application/json" \
  -d '{"recipient": "...", "amount": "1000000"}'
```

### Compliance Check
```bash
curl -X POST http://localhost:3001/check/transfer \
  -H "Content-Type: application/json" \
  -d '{"source": "...", "destination": "...", "amount": "1000"}'
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   API Svc   │────▶│   Redis     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ Indexer Svc │────▶│ PostgreSQL  │
                    └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Compliance  │
                    │   Svc       │
                    └─────────────┘
```

## License

MIT
