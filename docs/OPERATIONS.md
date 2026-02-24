# Operations Runbook

This document covers day-to-day operations for stablecoin operators using the SSS SDK.

## Setup

### Configure the CLI

```bash
# Install globally
npm install -g @stbr/sss-token-cli

# Set environment variables
export SSS_KEYPAIR=/path/to/operator-keypair.json
export SSS_RPC_URL=https://api.mainnet-beta.solana.com
export SSS_MINT=<your-mint-address>

# Or use a config file at ~/.config/sss-token/config.toml
rpc_url = "https://api.mainnet-beta.solana.com"
keypair = "/path/to/keypair.json"
mint = "<your-mint-address>"
```

### Verify setup

```bash
sss-token status
```

---

## Core Operations

### Minting

```bash
# Mint 1,000 USDC-equivalent (6 decimals = 1000000000 base units)
sss-token mint <RECIPIENT_ADDRESS> 1000000000

# Mint with a specific minter key
sss-token mint <RECIPIENT> 1000000000 --keypair /path/to/minter-keypair.json
```

### Burning

```bash
# Burn 500 tokens from your own account
sss-token burn 500000000
```

### Freezing / Thawing

```bash
# Freeze an account (pauses all incoming/outgoing transfers for that account)
sss-token freeze <ADDRESS>

# Unfreeze
sss-token thaw <ADDRESS>
```

### Pause / Unpause (Emergency)

```bash
# Emergency pause — halts ALL minting and burning globally
sss-token pause

# Resume
sss-token unpause
```

---

## Minter Management

```bash
# Add a minter with unlimited quota
sss-token minters add <ADDRESS>

# Add a minter with a daily quota (1,000,000 tokens max)
sss-token minters add <ADDRESS> --quota 1000000000000

# Deactivate a minter
sss-token minters remove <ADDRESS>

# List active minters
sss-token minters list
```

---

## SSS-2 Compliance Operations

### Blacklisting

```bash
# Add to blacklist (OFAC, internal compliance decision)
sss-token blacklist add <ADDRESS> --reason "OFAC SDN list match"

# Remove from blacklist (case resolved)
sss-token blacklist remove <ADDRESS> --reason "False positive — cleared by compliance team"

# Check if an address is blacklisted
sss-token blacklist check <ADDRESS>
```

### Seizure

Seizure uses the permanent delegate and requires the address to be on the blacklist first.

```bash
# Freeze the account first (belt and suspenders)
sss-token freeze <ADDRESS>

# Seize all tokens to treasury
sss-token seize <ADDRESS> --to <TREASURY_ADDRESS>
```

---

## Monitoring

### Audit Log

```bash
# Show last 20 actions
sss-token audit-log

# Filter by action type
sss-token audit-log --action mint
sss-token audit-log --action blacklist_add

# Show more
sss-token audit-log --limit 100
```

### Supply Tracking

```bash
sss-token supply
sss-token status    # full dashboard
```

---

## Backend Services

If you're running the full backend stack:

```bash
# Start all services
docker compose up -d

# Health checks
curl http://localhost:3001/health   # mint-burn
curl http://localhost:3002/health   # event-listener
curl http://localhost:3003/health   # compliance (SSS-2)
curl http://localhost:3004/health   # webhook

# Submit a mint request via API
curl -X POST http://localhost:3001/mint \
  -H "Content-Type: application/json" \
  -d '{ "recipient": "<ADDRESS>", "amount": 1000000 }'

# Check mint request status
curl http://localhost:3001/mint/<REQUEST_ID>
```

---

## Role Management

Roles are managed by the master authority only.

```bash
# Assign a pauser
sss-token roles set-pauser <ADDRESS>

# Assign a burner
sss-token roles set-burner <ADDRESS>

# SSS-2: Assign blacklister and seizer
sss-token roles set-blacklister <ADDRESS>
sss-token roles set-seizer <ADDRESS>

# Clear a role (set to null)
sss-token roles set-pauser --clear
```

---

## Authority Transfer

Master authority transfer requires two steps: propose and accept.

```bash
# Step 1: Propose (run as current master authority)
sss-token authority propose <NEW_AUTHORITY_ADDRESS>

# Step 2: Accept (run as the new authority)
sss-token authority accept --keypair /path/to/new-authority-keypair.json
```

---

## Emergency Procedures

### Total mint compromise

If the master authority keypair is compromised:

1. Contact Solana validators if the attacker hasn't transacted yet (social intervention only — no on-chain revoke without authority)
2. If you have access to the pauser role: `sss-token pause` — this stops minting and burning
3. Prepare a replacement authority keypair
4. As master authority (if not yet taken), propose the new authority: `sss-token authority propose <NEW_KEY>`
5. Accept on the new key: `sss-token authority accept`

### Systemic sanctions exposure

If a large number of addresses must be blacklisted rapidly:

1. Use the compliance API endpoint for batch processing (POST /blacklist for each)
2. Monitor the event-listener to confirm each blacklist PDA is created on-chain
3. If the volume is large enough to risk on-chain congestion, coordinate with your RPC provider for priority fees