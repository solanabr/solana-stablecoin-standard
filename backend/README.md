# Solana Stablecoin Standard - Backend Services

Production-ready backend services for the Solana Stablecoin Standard, containerized with Docker.

## Architecture

The backend consists of microservices that handle different aspects of stablecoin operations:

### Core Services (All Presets)

1. **Mint/Burn Service** (`mint-service`) - Port 3001
   - Coordinates fiat-to-stablecoin lifecycle
   - Handles mint and burn requests
   - Request validation and execution
   - Transaction logging

2. **Event Listener/Indexer** (`event-listener`) - Port 3002
   - Monitors on-chain program events
   - Maintains off-chain state
   - Webhook notifications
   - Event storage in PostgreSQL

### SSS-2 Additional Services

3. **Compliance Service** (`compliance-service`) - Port 3003
   - Blacklist management
   - Sanctions screening integration point
   - Transaction monitoring
   - Audit trail export

4. **Webhook Service** (`webhook-service`) - Port 3004
   - Configurable event notifications
   - Retry logic with exponential backoff
   - Webhook management API
   - Delivery tracking

### Infrastructure

5. **API Gateway** (`api-gateway`) - Port 3000
   - Unified API endpoint
   - Request routing
   - Rate limiting
   - Authentication (optional)

6. **PostgreSQL Database** - Port 5432
   - Event storage
   - Blacklist records
   - Audit logs
   - Webhook configurations

7. **Redis** - Port 6379
   - Webhook queue
   - Caching
   - Rate limiting

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Solana wallet with devnet SOL
- (Optional) Deployed stablecoin program

### 1. Environment Setup

Create `.env` file in the root directory:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=Hx1FiL4UdbdqiFr9pseWnkDpLtYYm4KsevHSgvgBX4oh

# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sss

# Redis
REDIS_URL=redis://redis:6379

# Webhooks (optional)
WEBHOOK_URL=https://your-webhook-endpoint.com/events

# API Keys (optional)
API_KEY=your-api-key-here
```

### 2. Start All Services

```bash
docker-compose up -d
```

This will start all services in the background.

### 3. Check Service Health

```bash
# Check all services
docker-compose ps

# Check individual service logs
docker-compose logs -f mint-service
docker-compose logs -f event-listener
docker-compose logs -f compliance-service

# Health check endpoints
curl http://localhost:3001/health  # Mint service
curl http://localhost:3002/health  # Event listener
curl http://localhost:3003/health  # Compliance service
curl http://localhost:3004/health  # Webhook service
curl http://localhost:3000/health  # API Gateway
```

### 4. Stop Services

```bash
docker-compose down
```

To remove volumes (database data):
```bash
docker-compose down -v
```

## API Documentation

### Mint Service (Port 3001)

#### POST /api/mint
Request a mint operation.

```bash
curl -X POST http://localhost:3001/api/mint \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "RECIPIENT_PUBLIC_KEY",
    "amount": 1000000,
    "mint": "MINT_PUBLIC_KEY"
  }'
```

#### POST /api/burn
Request a burn operation.

```bash
curl -X POST http://localhost:3001/api/burn \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500000,
    "mint": "MINT_PUBLIC_KEY",
    "account": "TOKEN_ACCOUNT"
  }'
```

#### GET /api/status/:requestId
Check operation status.

```bash
curl http://localhost:3001/api/status/mint_1234567890
```

### Compliance Service (Port 3003)

#### POST /api/blacklist/add
Add address to blacklist (SSS-2).

```bash
curl -X POST http://localhost:3003/api/blacklist/add \
  -H "Content-Type: application/json" \
  -d '{
    "address": "ADDRESS_TO_BLACKLIST",
    "reason": "OFAC sanctions match",
    "authority": "AUTHORITY_PUBLIC_KEY"
  }'
```

#### POST /api/blacklist/remove
Remove address from blacklist.

```bash
curl -X POST http://localhost:3003/api/blacklist/remove \
  -H "Content-Type: application/json" \
  -d '{
    "address": "ADDRESS_TO_REMOVE",
    "authority": "AUTHORITY_PUBLIC_KEY"
  }'
```

#### GET /api/blacklist/check/:address
Check if address is blacklisted.

```bash
curl http://localhost:3003/api/blacklist/check/ADDRESS
```

#### GET /api/audit-log
Export audit trail.

```bash
curl "http://localhost:3003/api/audit-log?from=2024-01-01&to=2024-12-31"
```

### Webhook Service (Port 3004)

#### POST /api/webhooks
Register a webhook.

```bash
curl -X POST http://localhost:3004/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-endpoint.com/webhook",
    "eventTypes": ["mint", "burn", "blacklist_add"],
    "retryCount": 3
  }'
```

#### GET /api/webhooks
List all webhooks.

```bash
curl http://localhost:3004/api/webhooks
```

#### DELETE /api/webhooks/:id
Delete a webhook.

```bash
curl -X DELETE http://localhost:3004/api/webhooks/1
```

## Development

### Running Individual Services

```bash
# Mint service
cd backend/mint-service
npm install
npm run dev

# Event listener
cd backend/event-listener
npm install
npm run dev

# Compliance service
cd backend/compliance-service
npm install
npm run dev
```

### Building Services

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build mint-service
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f mint-service

# Last 100 lines
docker-compose logs --tail=100 event-listener
```

## Database Management

### Access PostgreSQL

```bash
docker-compose exec postgres psql -U postgres -d sss
```

### Common Queries

```sql
-- View recent events
SELECT * FROM events ORDER BY timestamp DESC LIMIT 10;

-- View blacklist
SELECT * FROM blacklist WHERE is_active = true;

-- View audit log
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 20;

-- Webhook delivery status
SELECT w.url, wd.status, wd.attempts, wd.last_attempt_at
FROM webhook_deliveries wd
JOIN webhooks w ON w.id = wd.webhook_id
ORDER BY wd.created_at DESC;
```

## Monitoring

### Health Checks

All services expose `/health` endpoints:

```bash
# Check all services
for port in 3000 3001 3002 3003 3004; do
  echo "Port $port:"
  curl -s http://localhost:$port/health | jq
done
```

### Metrics

Services log structured JSON for easy parsing:

```bash
# View mint service metrics
docker-compose logs mint-service | grep "Mint request"

# View event listener activity
docker-compose logs event-listener | grep "Program log"
```

## Production Deployment

### Security Considerations

1. **Environment Variables**: Use secrets management (AWS Secrets Manager, HashiCorp Vault)
2. **API Authentication**: Implement JWT or API key authentication
3. **Rate Limiting**: Configure rate limits in API Gateway
4. **Network Security**: Use private networks for inter-service communication
5. **Database**: Use managed PostgreSQL (AWS RDS, Google Cloud SQL)
6. **Monitoring**: Set up Prometheus + Grafana or CloudWatch

### Scaling

```yaml
# Scale specific services
docker-compose up -d --scale mint-service=3
docker-compose up -d --scale webhook-service=2
```

### Load Balancing

Use nginx or cloud load balancers to distribute traffic across service instances.

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs service-name

# Check if port is already in use
netstat -an | grep PORT_NUMBER

# Restart service
docker-compose restart service-name
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready

# View PostgreSQL logs
docker-compose logs postgres
```

### Event Listener Not Receiving Events

1. Check RPC URL is correct
2. Verify program ID matches deployed program
3. Check Solana network status
4. Review event-listener logs for errors

## Architecture Diagram

```
┌─────────────────┐
│   API Gateway   │ :3000
└────────┬────────┘
         │
    ┌────┴────┬────────────┬──────────────┐
    │         │            │              │
┌───▼───┐ ┌──▼──┐  ┌──────▼──────┐ ┌────▼─────┐
│ Mint  │ │Event│  │ Compliance  │ │ Webhook  │
│Service│ │List.│  │   Service   │ │ Service  │
└───┬───┘ └──┬──┘  └──────┬──────┘ └────┬─────┘
    │        │            │              │
    └────────┴────────────┴──────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼─────┐         ┌────▼────┐
    │PostgreSQL│         │  Redis  │
    └──────────┘         └─────────┘
```

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/solanabr/solana-stablecoin-standard/issues
- Documentation: See `/docs` directory
