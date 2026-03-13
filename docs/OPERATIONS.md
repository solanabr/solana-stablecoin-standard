# Operations Runbook

Operator reference for day-to-day stablecoin management using the `sss-token` CLI and SDK.

## Setup

### Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Configure for devnet
solana config set --url devnet

# Generate keypair (if needed)
solana-keygen new
```

### Install CLI

```bash
npm install -g @stbr/sss-cli
```

### Environment

```bash
# Set your mint address once
export SSS_MINT=<your-mint-address>

# Or pass it per-command
sss-token status --mint <address>
```

## Token Lifecycle

### 1. Initialize

```bash
# SSS-1: Simple stablecoin
sss-token init --preset sss-1 --name "My USD" --symbol "myUSD" --decimals 6

# SSS-2: Compliant stablecoin
sss-token init --preset sss-2 --name "Regulated USD" --symbol "rUSD" --decimals 6

# Custom config
sss-token init --custom config.toml
```

Example `config.toml`:
```toml
name = "BRL Stable"
symbol = "BRLs"
decimals = 6
uri = "https://example.com/metadata.json"

[extensions]
permanent_delegate = true
transfer_hook = true
default_account_frozen = false

[roles]
pauser = "PauserPubkeyBase58..."
blacklister = "BlacklisterPubkeyBase58..."
seizer = "SeizerPubkeyBase58..."
```

### 2. Configure Minters

```bash
# Add minter with 10,000 token quota (at 6 decimals = 10_000_000_000)
sss-token minters add <minter-pubkey> --quota 10000000000

# List minters
sss-token minters list

# Remove minter
sss-token minters remove <minter-pubkey>
```

### 3. Mint Tokens

```bash
# Mint 1,000 tokens (1_000_000_000 base units at 6 decimals)
sss-token mint <recipient-pubkey> 1000000000

# With specific minter keypair
sss-token mint <recipient> 1000000000 --minter /path/to/minter.json
```

### 4. Burn Tokens

```bash
sss-token burn 500000000
```

### 5. Check Status

```bash
# Full dashboard
sss-token status

# Just supply
sss-token supply

# List holders
sss-token holders
sss-token holders --min-balance 1000000
```

## Emergency Procedures

### Pause All Operations

```bash
# Pause (pauser or master authority)
sss-token pause

# Unpause (master authority ONLY)
sss-token unpause
```

### Freeze an Account

```bash
sss-token freeze <suspect-address>

# Later, thaw (master authority only)
sss-token thaw <suspect-address>
```

## SSS-2 Compliance Operations

### Blacklist Management

```bash
# Add to blacklist
sss-token blacklist add <address> --reason "OFAC SDN match - Entity XYZ"

# Remove from blacklist
sss-token blacklist remove <address>
```

### Token Seizure (Full Flow)

```bash
# 1. Blacklist the address
sss-token blacklist add <suspect> --reason "Sanctions match"

# 2. Freeze the account
sss-token freeze <suspect>

# 3. Seize tokens to treasury
sss-token seize <suspect> --to <treasury-pubkey>
```

### Audit Trail

```bash
# Recent transactions
sss-token audit-log

# Last 50 transactions
sss-token audit-log --limit 50
```

## Monitoring

```bash
# Check if paused
sss-token status | grep Paused

# Watch supply
watch -n 10 sss-token supply
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `UnauthorizedMinter` | Signer not in minter list | `sss-token minters add <address> --quota <n>` |
| `MinterQuotaExceeded` | Minted past quota | Increase quota or add new minter |
| `Paused` | Operations are paused | `sss-token unpause` (master auth only) |
| `ComplianceNotEnabled` | SSS-2 op on SSS-1 token | Token must be initialized with `--preset sss-2` |
| `AlreadyBlacklisted` | Address already on blacklist | Already blocked, no action needed |
