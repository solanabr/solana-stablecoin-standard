# CLI Guide

## Installation

```bash
cd cli && npm install && npm run build
npm link  # makes `sss-token` available globally
```

## Usage

```bash
# Show stablecoin config
sss-token config <mint-address>

# Derive PDA addresses
sss-token derive-pda config <mint>
sss-token derive-pda role <mint> <authority> minter
sss-token derive-pda hook_config <mint>
sss-token derive-pda blacklist <mint> <address>

# SSS-1 operational controls
sss-token pause <mint>
sss-token unpause <mint>
sss-token transfer-admin <mint> <new-admin-pubkey>
sss-token update-minter <mint> <old-minter-pubkey> <new-minter-pubkey>
sss-token seize <mint> <from-token-account> <to-token-account> <amount>

# SSS-2 operational controls
sss-token set-compliance <mint> true
sss-token set-compliance <mint> false
sss-token transfer-hook-authority <mint> <new-authority-pubkey>

# Options
sss-token --cluster devnet    # default
sss-token --cluster mainnet
sss-token --wallet ~/.config/solana/id.json  # default
```

## Examples

```bash
# Check a stablecoin's config
sss-token config J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np

# Find the role PDA for a minter
sss-token derive-pda role <mint> <minter-pubkey> minter

# Check if an address is blacklisted (via PDA)
sss-token derive-pda blacklist <mint> <suspect-address>

# Pause during incident response
sss-token pause <mint>

# Rotate admin authority
sss-token transfer-admin <mint> <new-admin>

# Rotate minter role
sss-token update-minter <mint> <old-minter> <new-minter>

# Move funds with permanent delegate seizure path
sss-token seize <mint> <from-ata> <to-ata> 500000

# Disable hook compliance mode for migration windows
sss-token set-compliance <mint> false
```
