# Docker Backend Services - Quick Start

## 🚀 One-Command Setup

```bash
# Copy environment template
cp .env.example .env

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

That's it! All backend services are now running.

## 📊 Service Ports

- **API Gateway**: http://localhost:3000 (Unified endpoint)
- **Mint Service**: http://localhost:3001
- **Event Listener**: http://localhost:3002
- **Compliance Service**: http://localhost:3003 (SSS-2)
- **Webhook Service**: http://localhost:3004
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## 🧪 Quick Test

```bash
# Health check all services
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3003/health
curl http://localhost:3004/health

# Test mint request
curl -X POST http://localhost:3001/api/mint \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "YOUR_WALLET_ADDRESS",
    "amount": 1000000,
    "mint": "YOUR_MINT_ADDRESS"
  }'

# Check blacklist (SSS-2)
curl http://localhost:3003/api/blacklist
```

## 📝 View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f mint-service
docker-compose logs -f event-listener
docker-compose logs -f compliance-service
```

## 🛑 Stop Services

```bash
# Stop all
docker-compose down

# Stop and remove volumes (database data)
docker-compose down -v
```

## 🔧 Development Mode

```bash
# Run individual service locally
cd backend/mint-service
npm install
npm run dev
```

## 📚 Full Documentation

See `backend/README.md` for complete API documentation and advanced usage.

## 🏗️ Architecture

```
API Gateway (3000)
    ├── Mint Service (3001)
    ├── Compliance Service (3003)
    └── Webhook Service (3004)
         ↓
Event Listener (3002) → PostgreSQL + Redis
```

## ⚙️ Environment Variables

Edit `.env` file:

```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=Hx1FiL4UdbdqiFr9pseWnkDpLtYYm4KsevHSgvgBX4oh
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sss
```

## 🎯 Production Ready

- ✅ Health checks on all services
- ✅ Structured logging (JSON)
- ✅ Graceful shutdown
- ✅ Database migrations
- ✅ Redis caching
- ✅ Rate limiting
- ✅ CORS enabled
- ✅ Error handling

## 🔒 Security Notes

For production:
1. Change default database passwords
2. Use secrets management
3. Enable API authentication
4. Configure firewall rules
5. Use HTTPS/TLS
6. Set up monitoring

## 📦 What's Included

### Core Services (All Presets)
- **Mint/Burn Service**: Fiat-to-stablecoin lifecycle
- **Event Listener**: On-chain event monitoring

### SSS-2 Services
- **Compliance Service**: Blacklist management
- **Webhook Service**: Event notifications

### Infrastructure
- **API Gateway**: Unified API endpoint
- **PostgreSQL**: Event storage, audit logs
- **Redis**: Caching, webhook queue

## 🎬 Next Steps

1. Start services: `docker-compose up -d`
2. Check health: `curl http://localhost:3000/health`
3. Test API: See `backend/README.md`
4. Monitor logs: `docker-compose logs -f`
5. Deploy to production: Update `.env` and deploy!
