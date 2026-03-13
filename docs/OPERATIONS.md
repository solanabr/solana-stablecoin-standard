# Operations Runbook

This guide covers day-to-day operations for stablecoin issuers and operators.

## Initial Setup

### 1. Deploy Programs

```bash
# Set up Solana CLI for devnet
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/authority.json

# Fund the authority
solana airdrop 5 --keypair ~/.config/solana/authority.json

# Deploy
anchor build
anchor deploy --provider.cluster devnet
```

### 2. Initialize Stablecoin

```bash
# SSS-1 (Minimal) — for simple use cases
sss-token init --preset sss-1 \
  --name "My Stablecoin" \
  --symbol "MUSD" \
  --decimals 6 \
  --keypair ~/.config/solana/authority.json

# SSS-2 (Compliant) — for regulated stablecoins
sss-token init --preset sss-2 \
  --name "Regulated USD" \
  --symbol "RUSD" \
  --decimals 6 \
  --keypair ~/.config/solana/authority.json
```

### 3. Configure Minters

```bash
# Add a minter with a 10M token quota
sss-token minters add <MINTER_ADDRESS> --quota 10000000000000

# Add an unlimited minter
sss-token minters add <MINTER_ADDRESS> --quota 0
```

### 4. Set Up Roles

```bash
# Grant specific roles to operators
sss-token roles grant <ADDRESS> burner
sss-token roles grant <ADDRESS> pauser
sss-token roles grant <ADDRESS> freezer

# SSS-2 specific
sss-token roles grant <ADDRESS> blacklister
sss-token roles grant <ADDRESS> seizer
```

## Daily Operations

### Minting Tokens

```bash
sss-token mint <RECIPIENT_WALLET> 1000000000  # 1000 MUSD (6 decimals)
```

### Burning Tokens

```bash
sss-token burn 500000000  # 500 MUSD
```

### Checking Status

```bash
sss-token status
```

## Emergency Procedures

### Pause All Operations

Use when you detect suspicious activity or need to halt minting/burning immediately.

```bash
sss-token pause
```

**Resume when safe:**

```bash
sss-token pause --unpause
```

### Freeze a Suspicious Account

```bash
# Freeze the account
sss-token freeze <TOKEN_ACCOUNT_ADDRESS>

# Investigate, then thaw if cleared
sss-token freeze <TOKEN_ACCOUNT_ADDRESS> --thaw
```

## SSS-2 Compliance Operations

### Blacklist Management

```bash
# Screen an address (backend API)
curl -X POST http://localhost:3000/api/v1/compliance/screen \
  -H "Content-Type: application/json" \
  -d '{"address": "<WALLET_ADDRESS>"}'

# Add to blacklist
sss-token blacklist add <ADDRESS> --reason "OFAC SDN List match"

# Check blacklist status
sss-token blacklist check <ADDRESS>

# Remove from blacklist
sss-token blacklist remove <ADDRESS>
```

### Token Seizure

When a blacklisted account holds tokens that must be recovered:

```bash
# 1. Freeze the account first
sss-token freeze <TOKEN_ACCOUNT>

# 2. Seize tokens to treasury
sss-token seize <TOKEN_ACCOUNT> --to <TREASURY_TOKEN_ACCOUNT>
```

### Audit Trail

```bash
# View audit trail via backend API
curl http://localhost:3000/api/v1/compliance/audit-trail

# Export as CSV
curl http://localhost:3000/api/v1/compliance/audit-trail/export?format=csv \
  -o audit-trail.csv

# Filter by action type
curl "http://localhost:3000/api/v1/compliance/audit-trail?action=blacklist_add"
```

## Monitoring

### Backend Health Check

```bash
curl http://localhost:3000/api/v1/health
```

### Supply Monitoring

```bash
sss-token status
```

## Key Rotation

### Transfer Master Authority

```bash
# This is irreversible — double-check the new authority address
sss-token roles grant <NEW_AUTHORITY> minter
sss-token roles grant <NEW_AUTHORITY> burner
sss-token roles grant <NEW_AUTHORITY> pauser
sss-token roles grant <NEW_AUTHORITY> freezer
# Then transfer authority (requires current authority keypair)
```

## Disaster Recovery

1. **Pause immediately** — `sss-token pause`
2. **Assess the situation** — Check recent transactions, minter activity
3. **Freeze compromised accounts** — `sss-token freeze <account>`
4. **Rotate keys** if compromised — Transfer authority to new keypair
5. **Resume** when safe — `sss-token pause --unpause`
