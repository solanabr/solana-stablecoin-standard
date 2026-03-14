# 🚀 SSS Quick Start

## Run Everything (Docker)
```bash
docker-compose up
```

## Run Everything (Manual)
```bash
npm run dev:all
```

## Individual Services

| Service | Command | URL |
|---------|---------|-----|
| **Frontend** | `npm run dev:frontend` | http://localhost:3000 |
| **Backend** | `npm run dev:backend` | http://localhost:3001 |
| **TUI** | `npm run dev:tui` | Terminal |
| **Docs** | `npm run dev:docs` | http://localhost:3000 |

## CLI Commands

```bash
# Regular CLI
npm run cli -- token create --name "My Stablecoin"
npm run cli -- token mint --amount 1000
npm run cli -- compliance freeze --account <ADDRESS>

# AI Natural Language CLI
npm run cli:ask -- "mint 1000 tokens"
npm run cli:ask -- "what's my balance?"
npm run cli:ask -- "freeze account xyz..."
npm run cli:chat  # Interactive mode
```

## Testing

```bash
# All tests
npm run test:all

# Specific tests
npm test                    # Anchor integration
npm run test:sdk           # SDK unit tests
npm run test:backend       # Backend tests
npm run test:ct            # CT E2E test
npm run test:fuzz          # Trident fuzz tests
```

## Deployment

```bash
# Solana Programs
npm run deploy:devnet
npm run deploy:mainnet

# Frontend → Vercel
cd frontend && vercel --prod

# Backend → Railway
cd backend && railway up

# Docs → Netlify
cd website && npx netlify-cli deploy --prod --dir=build
```

## Quick Links

- **API Docs**: http://localhost:3001/api/docs
- **Devnet Explorer**: https://explorer.solana.com/?cluster=devnet
- **SSS Docs**: http://localhost:3000/docs
