# Operations Guide

## Deployment

### Prerequisites

- Node.js >= 18
- Solana CLI tools
- Docker & Docker Compose
- Git

### 1. Clone Repository

```bash
git clone https://github.com/your-org/sss-token.git
cd sss-token
```

### 2. Install Dependencies

```bash
# Program dependencies
cd programs/sss2_hook
anchor build

# SDK dependencies
cd sdk
npm install

# CLI dependencies
cd cli
npm install

# Backend dependencies
cd backend
npm install
```

### 3. Configure Environment

Create `.env` files:

**Backend:**
```env
NODE_ENV=production
PORT=3000
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
DATABASE_URL=postgresql://sss:sss_password@postgres:5432/sss_token
REDIS_URL=redis://redis:6379
SSS2_PROGRAM_ID=FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD
```

**CLI:**
```bash
# Config stored in ~/.sss-token/config.json
sss-token config --network devnet
sss-token config --keypair ~/.config/solana/id.json
```

### 4. Deploy Program

```bash
cd programs/sss2_hook

# Build
anchor build --skip-lint

# Deploy to devnet
solana program deploy target/deploy/sss2_hook.so \
  --program-id target/deploy/sss2_hook-keypair.json \
  --url devnet

# Upgrade (if needed)
solana program deploy target/deploy/sss2_hook.so \
  --program-id target/deploy/sss2_hook-keypair.json \
  --url devnet
```

### 5. Initialize

```bash
using CLI:
sss-token init --preset sss-2 --fee-bps 100 --max-fee 1000000000

Or using SDK:
import { SSS2Hook } from '@stbr/sss-token';
const hook = new SSS2Hook(connection, payer);
await hook.initialize({
  transferFeeBasisPoints: 100,
  maxTransferFee: new BN(1000000000),
});
```

### 6. Start Backend

```bash
cd backend

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
docker-compose logs -f indexer
docker-compose logs -f compliance

# Scale API
docker-compose up --scale api=3 -d
```

### 7. Verify Deployment

```bash
# Check program
solana program show FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD --url devnet

# Check services
curl http://localhost:3000/health
curl http://localhost:3001/health

# Check status
sss-token status
```

## Configuration

### Fee Structure

```bash
# Update fee configuration
sss-token config --fee-bps 200 --max-fee 2000000000

Or via SDK:
await hook.updateFeeConfig({
  transferFeeBasisPoints: 200,
  maxTransferFee: new BN(2000000000),
  minTransferAmount: new BN(500),
});
```

### Compliance Setup

```bash
# Add authorized addresses
sss-token whitelist <verified-kyc-address>
sss-token whitelist <exchange-address>

# Blacklist sanctioned addresses
sss-token blacklist add <sanctioned-address-1>
sss-token blacklist add <sanctioned-address-2>

# Enable blacklist
sss-token config --enable-blacklist
```

### Emergency Procedures

```bash
# Emergency pause
sss-token pause

# Unpause (when safe)
sss-token unpause

# Set permanent delegate (admin override)
sss-token config --permanent-delegate <admin-address>
```

## Daily Operations

### Monitoring

```bash
# Check status
sss-token status

# View stats
curl http://localhost:3001/stats

# Check recent transactions
solana transactions --limit 10

# Monitor logs
docker-compose logs -f --tail 100
```

### Blacklist Updates

```bash
# Add new blacklist entries
sss-token blacklist add <new-address>

# Review blacklist
sss-token blacklist list

# Remove (rare)
sss-token blacklist remove <address>
```

### Seizure

```bash
# Seize funds from bad actor
sss-token seize <bad-actor-address> --to <treasury-address>

# Verify
sss-token status
```

## Maintenance

### Database Backup

```bash
# PostgreSQL backup
docker exec sss-postgres pg_dump -U sss sss_token > backup.sql

# Restore
docker exec -i sss-postgres psql -U sss sss_token < backup.sql
```

### Redis Management

```bash
# Clear cache
docker exec sss-redis redis-cli FLUSHDB

# Monitor
docker exec sss-redis redis-cli MONITOR
```

### Log Rotation

```bash
# Configure logrotate for /var/log/sss-token/
# or use Docker logging driver

docker-compose logs --json | jq '.service'
```

## Upgrades

### Program Upgrade

```bash
# Build new version
anchor build --skip-lint

# Verify binary size
ls -lh target/deploy/*.so

# Upgrade (requires upgrade authority)
solana program deploy target/deploy/sss2_hook.so \
  --program-id FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD \
  --url devnet

# Verify
solana program show FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD --url devnet
```

### Backend Upgrade

```bash
# Pull latest
git pull origin main

# Rebuild
docker-compose build

# Rolling restart
docker-compose up -d --no-deps api
docker-compose up -d --no-deps indexer
docker-compose up -d --no-deps compliance
```

## Troubleshooting

### Program Failed to Deploy

**Issue:** Transaction timeout

**Solution:**
```bash
# Check account balance
solana balance --url devnet

# Request airdrop
solana airdrop 2 --url devnet

# Retry with higher compute limit
solana program deploy --max-len 500000 target/deploy/sss2_hook.so --url devnet
```

### Backend Connection Failed

**Issue:** Can't connect to PostgreSQL/Redis

**Check:**
```bash
# Check containers running
docker-compose ps

# Check logs
docker-compose logs postgres
docker-compose logs redis

# Test connection
docker exec sss-postgres pg_isready -U sss
docker exec sss-redis redis-cli ping

# Restart
docker-compose down
docker-compose up -d
```

### Transaction Errors

**Common Errors:**
 ```
6000 - FeeTooHigh: Check fee config
6001 - InvalidAuthority: Wrong signer
6002 - AmountTooLow: Below minimum
6003 - ContractPaused: Unpause first
6004 - AddressBlacklisted: Check address
```

### CLI Not Working

**Debug:**
```bash
# Verbose mode
sss-token init --verbose --preset sss-2

# Check config
cat ~/.sss-token/config.json

# Reset config
rm -rf ~/.sss-token/
```

## Security

### Key Management

- Keep authority keypair secure
- Use hardware wallets for mainnet
- Store keys in environment variables
- Never commit keys to git

### Access Control

```bash
# Set multi-sig for mainnet
# Use Squads or similar

# Regular authority rotation
sss-token rotate-authority --new <new-pubkey>
```

### Monitoring

Set up alerts for:
- Unusual transfer volumes
- Large blacklist additions
- Emergency pause events
- Failed transactions > threshold

## Mainnet Deployment

### Pre-deployment Checklist

- [ ] Security audit complete
- [ ] Multi-sig configured
- [ ] Emergency contacts set
- [ ] Monitoring in place
- [ ] Insurance coverage
- [ ] Legal review complete

### Migration Steps

```bash
# 1. Deploy to mainnet
solana program deploy target/deploy/sss2_hook.so --url mainnet-beta

# 2. Verify deployment
solana program show <program-id> --url mainnet-beta

# 3. Initialize
sss-token config --network mainnet
sss-token init --preset sss-2

# 4. Set permissions
sss-token config --permanent-delegate <multi-sig>

# 5. Enable compliance
sss-token blacklist add <sanctioned-addresses...>
```

## Support

- Issues: [GitHub Issues](https://github.com/your-org/sss-token/issues)
- Discord: [Join server](https://discord.gg/...)
- Email: support@your-org.com

## References

- [Architecture Overview](./ARCHITECTURE.md)
- [SSS-1 Specification](./SSS-1.md)
- [SSS-2 Specification](./SSS-2.md)
- [SDK Documentation](./SDK.md)
- [Compliance Guide](./COMPLIANCE.md)
- [API Reference](./API.md)
