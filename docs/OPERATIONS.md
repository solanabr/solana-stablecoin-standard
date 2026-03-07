# Operations Runbook

This document is for operators running SSS-1 or SSS-2 stablecoins in production.

## Setup

### Prerequisites

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
solana --version

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.1 && avm use 0.31.1

# Node.js (v20+)
node --version

# pnpm
npm install -g pnpm

# Install sss-token CLI
cd cli/sss-token && pnpm install && pnpm build
npm link dist/index.js  # or add to PATH
```

### Configure CLI

Create `~/.config/sss-token/config.toml`:

```toml
rpc_url = "https://api.mainnet-beta.solana.com"
keypair_path = "/path/to/authority.json"
program_id = "AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm"
hook_program_id = "9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7"
mint = "<your-mint-pubkey>"  # optional default
```

## Initial Deployment

### Deploy programs

```bash
# Devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet

# Record the program IDs from output
```

### Initialize SSS-1

```bash
sss-token init \
  --preset sss-1 \
  --name "My Stablecoin" \
  --symbol MYUSD \
  --decimals 6

# Output includes: Mint: <pubkey>
# Add to config.toml: mint = "<pubkey>"
```

### Initialize SSS-2

```bash
sss-token init \
  --preset sss-2 \
  --name "Compliant USD" \
  --symbol CUSD \
  --decimals 6

# SSS-2 automatically deploys the transfer hook
```

## Daily Operations

### Check status

```bash
sss-token status
sss-token supply
```

### Mint tokens

```bash
# Add a minter first (if not set)
sss-token minters add <minter-address> --quota 10000000  # 10M tokens

# Mint
sss-token mint <recipient-address> <amount-in-token-units>
# e.g., sss-token mint 7vFxxx...abc 1000
```

### Burn tokens

```bash
sss-token burn <token-account-address> <amount>
```

### Freeze/Thaw accounts

```bash
sss-token freeze <token-account-address>
sss-token thaw <token-account-address>
```

### Emergency pause

```bash
sss-token pause          # disables mint and burn
sss-token unpause        # re-enable
```

## SSS-2 Compliance Operations

### Blacklist management

```bash
# Add address to blacklist (immediate effect on all transfers)
sss-token blacklist add <address> --reason "OFAC SDN match"

# Verify blacklist
sss-token blacklist check <address>

# List all blacklisted addresses
sss-token blacklist list

# Remove from blacklist (after legal clearance)
sss-token blacklist remove <address>
```

### Seize tokens

```bash
# First freeze the account (optional but standard practice)
sss-token freeze <token-account>

# Seize to treasury
sss-token seize \
  --from <frozen-token-account> \
  --to <treasury-token-account> \
  --amount <amount>
```

### Audit trail

```bash
sss-token audit-log
sss-token audit-log --action blacklist
sss-token audit-log --action seize --limit 20
```

## Role Management

### Delegate roles to separate keys

```bash
# Set a dedicated pauser (separate from authority)
sss-token update-roles --pauser <pauser-address>

# Set a dedicated blacklister (SSS-2)
sss-token update-roles --blacklister <blacklister-address>

# Set a dedicated seizer (SSS-2)
sss-token update-roles --seizer <seizer-address>
```

### Transfer master authority (multisig handoff)

```bash
# WARNING: this is immediately effective
sss-token transfer-authority <new-authority-address>
```

## Backend Services

```bash
# Set environment
export MINT=<your-mint-pubkey>
export RPC_URL=https://api.mainnet-beta.solana.com
export KEYPAIR_PATH=~/.config/solana/id.json

# Start services
docker compose up -d

# Health checks
curl http://localhost:3000/health  # indexer
curl http://localhost:3001/health  # mint-burn API
curl http://localhost:3002/health  # compliance API
```

### REST API usage

```bash
# Mint via API
curl -X POST http://localhost:3001/mint \
  -H "Content-Type: application/json" \
  -d '{"recipient": "<address>", "amount": "1000"}'

# Compliance: blacklist via API
curl -X POST http://localhost:3002/blacklist/add \
  -H "Content-Type: application/json" \
  -d '{"address": "<address>", "reason": "OFAC match"}'

# Get audit log
curl http://localhost:3002/audit-log
```

## Incident Response

### If authority keypair is compromised
1. Immediately transfer authority to a new key: `sss-token transfer-authority <new-key>`
2. Update all role keys: `sss-token update-roles ...`
3. Rotate keypair files

### If you need to freeze all activity
1. `sss-token pause` — stops mint/burn immediately
2. For transfers on SSS-2: blacklist the specific parties involved
3. Investigate and `sss-token unpause` when resolved

### If a blacklisted party already has tokens
1. `sss-token freeze <their-token-account>` — prevent use
2. Obtain legal clearance for seizure
3. `sss-token seize --from <account> --to <treasury> --amount <balance>`
