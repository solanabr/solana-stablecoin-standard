# SSS Token CLI

Command-line interface for Solana Stablecoin Standard.

## Installation

```bash
# Install globally
npm install -g @stbr/sss-token-cli

# Or use locally
cd cli
npm install
npm run build
npm link
```

## Usage

```bash
# Initialize stablecoin
sss-token init --preset sss-1 --name "My Token" --symbol "MTK"

# Mint tokens
sss-token mint <RECIPIENT_ADDRESS> <AMOUNT>

# Check status
sss-token status

# Get help
sss-token --help
```

## Common Issues & Fixes

### Issue 1: "Cannot find module '@stbr/sss-token'"

**Cause**: SDK not built or linked

**Fix**:
```bash
# Build SDK first
cd ../sdk
npm install
npm run build
npm link

# Link in CLI
cd ../cli
npm link @stbr/sss-token
npm install
```

### Issue 2: "Keypair file not found"

**Cause**: Wallet not configured

**Fix**:
```bash
# Generate new keypair
solana-keygen new

# Or specify custom path
sss-token --keypair /path/to/keypair.json init ...
```

### Issue 3: "Cannot find module 'toml'"

**Cause**: Missing dependencies

**Fix**:
```bash
cd cli
npm install
```

### Issue 4: TypeScript errors

**Cause**: SDK types not available

**Fix**:
```bash
# Build SDK
cd ../sdk
npm run build

# Rebuild CLI
cd ../cli
npm run build
```

## Development

```bash
# Run in development mode
npm run dev -- init --preset sss-1

# Build
npm run build

# Test locally
npm link
sss-token --help
```

## Configuration

The CLI saves configuration to `.sss-token.json` in the current directory:

```json
{
  "mint": "TokenMintAddress...",
  "name": "My Token",
  "symbol": "MTK",
  "decimals": 6,
  "preset": "sss-1",
  "cluster": "devnet"
}
```

## Commands

### Global Options

```bash
-c, --cluster <cluster>    Solana cluster (default: "devnet")
-k, --keypair <path>       Path to keypair file (default: "~/.config/solana/id.json")
-h, --help                 Display help
-V, --version              Display version
```

### init

Initialize a new stablecoin.

```bash
# With preset
sss-token init --preset sss-1 --name "My Token" --symbol "MTK" --decimals 6

# With custom config
sss-token init --custom config.toml
```

### mint

Mint tokens to a recipient.

```bash
sss-token mint <RECIPIENT_ADDRESS> <AMOUNT>
```

### burn

Burn tokens from an account.

```bash
sss-token burn <AMOUNT> --account <TOKEN_ACCOUNT>
```

### freeze

Freeze an account.

```bash
sss-token freeze <TOKEN_ACCOUNT>
```

### thaw

Thaw a frozen account.

```bash
sss-token thaw <TOKEN_ACCOUNT>
```

### pause

Pause all operations.

```bash
sss-token pause
```

### unpause

Resume operations.

```bash
sss-token unpause
```

### status

Show stablecoin status.

```bash
sss-token status
```

### supply

Show total supply.

```bash
sss-token supply
```

### blacklist (SSS-2)

Manage blacklist.

```bash
# Add to blacklist
sss-token blacklist add <ADDRESS> --reason "OFAC match"

# Remove from blacklist
sss-token blacklist remove <ADDRESS>

# List blacklisted addresses
sss-token blacklist list
```

### seize (SSS-2)

Seize tokens from frozen account.

```bash
sss-token seize <FROM_ACCOUNT> --to <TO_ACCOUNT> --amount <AMOUNT>
```

## Examples

### Create SSS-1 Stablecoin

```bash
# Initialize
sss-token init \
  --preset sss-1 \
  --name "DAO Token" \
  --symbol "DAO" \
  --decimals 6

# Mint tokens
sss-token mint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000000

# Check status
sss-token status
```

### Create SSS-2 Compliant Stablecoin

```bash
# Initialize
sss-token init \
  --preset sss-2 \
  --name "Compliant USD" \
  --symbol "CUSD" \
  --decimals 6

# Mint tokens
sss-token mint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000000

# Add to blacklist
sss-token blacklist add 3xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
  --reason "OFAC sanctions"

# Freeze account
sss-token freeze 3xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Seize tokens
sss-token seize 3xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
  --to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

## Troubleshooting

### Enable Debug Logging

```bash
export DEBUG=sss-token:*
sss-token status
```

### Check Solana Connection

```bash
solana config get
solana balance
```

### Verify Keypair

```bash
solana-keygen verify <PUBKEY> ~/.config/solana/id.json
```

## Support

- Documentation: [../docs/](../docs/)
- GitHub: [github.com/solanabr/solana-stablecoin-standard](https://github.com/solanabr/solana-stablecoin-standard)
- Discord: [discord.gg/superteambrasil](https://discord.gg/superteambrasil)
