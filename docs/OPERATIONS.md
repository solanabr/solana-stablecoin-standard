# Operations Runbook

This document covers day-to-day operator tasks for managing a deployed stablecoin.

## Prerequisites

```bash
# Install CLI
npm install -g @stbr/sss-cli

# Initialize config
sss-token config init

# Set your keypair and RPC
export KEYPAIR_PATH=~/.config/solana/id.json
export RPC_URL=https://api.devnet.solana.com
```

## Deploy a New Stablecoin

```bash
# SSS-1 (minimal)
sss-token init --preset sss-1 --name "My USD" --symbol MUSD --decimals 6

# SSS-2 (compliant, regulated)
sss-token init --preset sss-2 --name "Regulated USD" --symbol RUSD

# Custom config from file
sss-token init --custom config.toml
```

Example `config.toml`:
```toml
name = "Custom Stable"
symbol = "CUSD"
uri = "https://example.com/token.json"
decimals = 6
enable_permanent_delegate = true
enable_transfer_hook = false
default_account_frozen = false
```

## Daily Operations

### Check Status

```bash
sss-token status <mint>
sss-token supply <mint>
```

### Mint (Fiat-to-Token)

```bash
# Direct CLI
sss-token mint <mint> <recipient-address> <amount>

# Via backend API
curl -X POST http://localhost:3001/api/mint/request \
  -H "Content-Type: application/json" \
  -d '{"recipient": "<address>", "amount": "1000000"}'
```

### Burn (Token-to-Fiat)

```bash
sss-token burn <mint> <amount>
```

### KYC Onboarding (SSS-2)

When a new user creates a token account on an SSS-2 stablecoin, their account starts frozen. Thaw after KYC passes:

```bash
sss-token thaw <mint> <token-account>
```

## Emergency Procedures

### Pause All Operations

```bash
sss-token pause <mint>
```

This blocks all `mint_tokens` and `burn_tokens`. Existing balances are unaffected.

### Resume Operations

```bash
sss-token unpause <mint>
```

### Freeze a Suspicious Account

```bash
sss-token freeze <mint> <token-account>
```

## SSS-2 Compliance Operations

### Add to Blacklist

```bash
sss-token blacklist add <mint> <address> --reason "OFAC SDN list match"
```

### Remove from Blacklist

```bash
sss-token blacklist remove <mint> <address>
```

### Check Blacklist Status

```bash
sss-token blacklist check <mint> <address>
```

### View All Blacklisted Addresses

```bash
sss-token blacklist list <mint>
```

### Seize Tokens

Required steps:
1. Freeze the account
2. Seize tokens to treasury

```bash
sss-token freeze <mint> <token-account>
sss-token seize <mint> <frozen-account> <treasury-account>
```

## Role Management

### Add a Minter

```bash
# Unlimited minting
sss-token minters add <mint> <minter-address>

# With cap (e.g., max 1M USDC = 1,000,000,000,000 base units)
sss-token minters add <mint> <minter-address> --cap 1000000000000
```

### Revoke a Minter

```bash
sss-token minters remove <mint> <minter-address>
```

### List Minters

```bash
sss-token minters list <mint>
```

## Authority Transfer

```bash
sss-token transfer-authority <mint> <new-authority>
```

This is irreversible. The old authority immediately loses all control.

## Audit Trail

```bash
# Via compliance service
curl http://localhost:3003/api/audit/

# Export to CSV
curl http://localhost:3003/api/audit/export > audit-log.csv

# Filter by action type
curl "http://localhost:3003/api/audit/?action=blacklist_add_approved"
```
