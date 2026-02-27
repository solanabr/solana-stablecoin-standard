# @stbr/sss-token-cli

Admin CLI for Solana Stablecoin Standards (SSS)

## Installation

```bash
npm install -g @stbr/sss-token-cli
# or
yarn global add @stbr/sss-token-cli
```

## Commands

### Initialize

```bash
# Initialize SSS-2 with 1% fee, max 1 SOL
sss-token init --preset sss-2 --fee-bps 100 --max-fee 1000000000

# Initialize with custom min transfer
sss-token init --preset sss-2 --fee-bps 200 --max-fee 2000000000 --min-transfer 1000
```

### Mint / Burn

```bash
# Mint tokens
sss-token mint <recipient_address> <amount>

# Burn tokens
sss-token burn <amount>
```

### Freeze / Thaw

```bash
# Freeze an account
sss-token freeze <account_address>

# Thaw (unfreeze) an account
sss-token thaw <account_address>
```

### Emergency Controls

```bash
# Pause all transfers
sss-token pause

# Unpause transfers
sss-token unpause
```

### Whitelist

```bash
# Add to whitelist (no fees)
sss-token whitelist <address>
```

### Blacklist

```bash
# Add to blacklist
sss-token blacklist add <address>

# Remove from blacklist
sss-token blacklist remove <address>
```

### Seize

```bash
# Seize tokens from bad actor
sss-token seize <address> --to <treasury_address>
```

### Status & Config

```bash
# Check current status
sss-token status

# Update config
sss-token config --network mainnet
sss-token config --keypair ~/.config/solana/id.json
```

## Configuration

Config is stored in `~/.sss-token/config.json`:
```json
{
  "network": "devnet",
  "keypairPath": "~/.config/solana/id.json"
}
```

State is stored in `~/.sss-token/state.json`:
```json
{
  "configPDA": "...",
  "authority": "...",
  "transferFeeBasisPoints": 100,
  "isPaused": false
}
```

## Presets

| Preset | Description | Program |
|--------|-------------|---------|
| sss-1 | Basic RBAC | TBD |
| sss-2 | Transfer hook with fees | `FSkkSmrThcLpU9Uybrn4xcpbQKswUJn7KvoUQBsLPExD` |
| sss-3 | Advanced governance | TBD |

## Networks

- `devnet` - Development network (default)
- `mainnet` - Mainnet-beta

## Examples

```bash
# Full workflow
sss-token init --preset sss-2 --fee-bps 100 --max-fee 1000000000
sss-token whitelist 7RDzYmYfq3ANoDYfPZYEvtDQZKHRRaVdzusqYGAJKmk9
sss-token blacklist add BadActor1111111111111111111111111111111111111
sss-token pause
sss-token status
```

## Development

```bash
cd cli
npm install
npm run build
npm run dev -- init --preset sss-2
```

## License

MIT
