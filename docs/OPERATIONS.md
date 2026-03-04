# Operations Guide

## Deployment

### Local Development

```bash
# Start local validator with Token-2022 support
solana-test-validator --reset

# Build and deploy
anchor build
anchor deploy

# Run tests
anchor test --skip-deploy
```

### Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Airdrop SOL for deployment fees
solana airdrop 5

# Deploy both programs
anchor deploy --provider.cluster devnet

# Note down the program IDs
anchor keys list
```

### Mainnet Deployment

```bash
# Use a dedicated deployer keypair
solana config set --keypair deployer.json --url mainnet-beta

# Deploy with explicit program keypair for deterministic addresses
anchor deploy --provider.cluster mainnet \
  --program-keypair programs/sss-token/target/deploy/sss_token-keypair.json
```

## Token Lifecycle

### 1. Initialize

```bash
# SSS-1 (minimal)
sss-token init --preset sss-1 \
  --name "My Stablecoin" --symbol "MUSD" --decimals 6

# SSS-2 (compliant)
sss-token init --preset sss-2 \
  --name "Regulated USD" --symbol "RUSD" --decimals 6 \
  --transfer-hook <HOOK_PROGRAM_ID> \
  --supply-cap 100000000000000  # 100M tokens
```

### 2. Set Up Roles

Best practice for production: separate roles across different keypairs.

```bash
# Grant minter role to the operations wallet
sss-token grant-role --mint <MINT> --target <OPS_WALLET> --role minter

# Grant freezer role to compliance
sss-token grant-role --mint <MINT> --target <COMPLIANCE_WALLET> --role freezer

# For SSS-2: separate blacklister and seizer
sss-token grant-role --mint <MINT> --target <COMPLIANCE_WALLET> --role blacklister
sss-token grant-role --mint <MINT> --target <LEGAL_WALLET> --role seizer
```

### 3. Daily Operations

```bash
# Mint tokens
sss-token mint --mint <MINT> --to <RECIPIENT> --amount 1000000000

# Check status
sss-token status --mint <MINT>

# Check supply
sss-token supply --mint <MINT>
```

### 4. Emergency Operations

```bash
# Pause all operations
sss-token pause --mint <MINT>

# Freeze a specific account
sss-token freeze --mint <MINT> --target <BAD_ACTOR>

# Resume after resolving the issue
sss-token unpause --mint <MINT>
```

## Backend Services

### Start with Docker

```bash
cd docker
cp .env.example .env  # Edit with your values
docker compose up -d
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SSS_PORT` | 4000 | API server port |
| `SOLANA_RPC_URL` | devnet | Solana RPC endpoint |
| `SOLANA_WS_URL` | devnet WS | WebSocket endpoint for event subscription |
| `SSS_PROGRAM_ID` | placeholder | Deployed sss-token program ID |
| `OPERATOR_KEYPAIR` | ~/.config/solana/id.json | Path to operator keypair |
| `REQUIRE_APPROVAL` | true | Require dual approval for mint/burn |
| `ALERT_THRESHOLD` | 1000000000 | Amount (base units) triggering compliance alerts |
| `DB_HOST` | localhost | PostgreSQL host |
| `REDIS_HOST` | localhost | Redis host |

### Health Check

```bash
curl http://localhost:4000/health
```

### Monitoring

The backend logs to stdout using pino. In production, pipe to your log aggregation system:

```bash
docker logs sss-backend 2>&1 | your-log-shipper
```

Key metrics to monitor:
- Webhook queue size (should stay near 0)
- Pending compliance alerts
- Mint/burn request queue depth
- WebSocket connection health (reconnnects automatically)

## Troubleshooting

### "Account not found" on mint/burn

The destination token account must exist before minting. The CLI creates ATAs automatically, but if using the SDK directly, create the ATA first:

```typescript
const ata = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_2022_PROGRAM_ID);
```

### Transfer hook fails

Ensure `initializeExtraAccountMetas` was called after deploying an SSS-2 token. Without the extra account meta list, Token-2022 can't resolve the config and blacklist accounts.

### "SupplyCapExceeded" when minting

The supply cap is checked against `current_supply + amount`. If you hit the cap, either burn some tokens first or deploy a new mint with a higher cap.

### Paused state blocking operations

Only ADMIN can unpause. If the admin key is lost while paused, the token is permanently paused. Keep admin keys in a multisig or hardware wallet.
