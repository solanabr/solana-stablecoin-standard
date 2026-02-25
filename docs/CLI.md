# CLI Reference

The `sss` CLI provides command-line access to all Solana Stablecoin Standard operations.

## Installation

### From Source

```bash
cd cli
cargo build --release
# Binary at: target/release/sss
```

### From Workspace Root

```bash
cargo build --release --bin sss
```

## Global Options

These options apply to all subcommands:

| Option | Env Var | Default | Description |
|---|---|---|---|
| `--rpc-url` | `SOLANA_RPC_URL` | `http://localhost:8899` | Solana RPC endpoint |
| `--keypair` | `SOLANA_KEYPAIR` | `~/.config/solana/id.json` | Path to keypair file |
| `--commitment` | -- | `confirmed` | Commitment level (`processed`, `confirmed`, `finalized`) |

## Environment Variables

```bash
# RPC connection
export SOLANA_RPC_URL="https://api.devnet.solana.com"

# Keypair path (overrides default)
export SOLANA_KEYPAIR="~/.config/solana/devnet.json"
```

## Commands

### init

Initialize a new stablecoin. Use either `--preset` with inline args, or `--config` with a TOML file.

```bash
# Inline arguments
sss init \
  --preset sss-1 \
  --name "My Stablecoin" \
  --symbol "MUSD" \
  --uri "https://example.com/metadata.json" \
  --decimals 6 \
  --supply-cap 1000000000

# TOML config file
sss init --config example-config.toml
```

| Argument | Required | Default | Description |
|---|---|---|---|
| `--preset` | Yes* | -- | Preset tier: `sss-1`, `sss-2`, `sss-3` |
| `--name` | Yes* | -- | Token name |
| `--symbol` | Yes* | -- | Token symbol |
| `--uri` | No | `""` | Metadata URI |
| `--decimals` | No | `6` | Token decimals |
| `--supply-cap` | No | None | Maximum supply in base units |
| `--config` | No | -- | Path to TOML config file (conflicts with `--preset`) |

*Not required when using `--config`.

**TOML Config Format:**

```toml
name = "My Stablecoin"
symbol = "MUSD"
uri = "https://example.com/metadata.json"
decimals = 6
supply_cap = 1000000000
enable_transfer_hook = true      # true = SSS-2, false = SSS-1
enable_permanent_delegate = true
default_account_frozen = true
```

### mint

Mint tokens to a recipient token account. Caller must have the minter role.

```bash
sss mint \
  --mint <MINT_ADDRESS> \
  --to <TOKEN_ACCOUNT> \
  --amount 1000000
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--to` | Yes | Base58 recipient token account |
| `--amount` | Yes | Amount in base units |

### burn

Burn tokens from a token account. Caller must have the burner role.

```bash
sss burn \
  --mint <MINT_ADDRESS> \
  --from <TOKEN_ACCOUNT> \
  --amount 500000
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--from` | Yes | Base58 token account to burn from |
| `--amount` | Yes | Amount in base units |

### freeze

Freeze a token account. Caller must have the freezer role.

```bash
sss freeze \
  --mint <MINT_ADDRESS> \
  --account <TOKEN_ACCOUNT>
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--account` | Yes | Base58 token account to freeze |

### thaw

Thaw a frozen token account. Caller must have the freezer role.

```bash
sss thaw \
  --mint <MINT_ADDRESS> \
  --account <TOKEN_ACCOUNT>
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--account` | Yes | Base58 token account to thaw |

### pause

Pause all operations for a stablecoin. Caller must have the pauser role.

```bash
sss pause --mint <MINT_ADDRESS>
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |

### unpause

Resume operations for a stablecoin. Caller must have the pauser role.

```bash
sss unpause --mint <MINT_ADDRESS>
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |

### seize

Forcibly transfer tokens from one account to another. Caller must have the seizer role. Works even when paused.

```bash
sss seize \
  --mint <MINT_ADDRESS> \
  --from <SOURCE_TOKEN_ACCOUNT> \
  --to <DEST_TOKEN_ACCOUNT> \
  --amount 1000000
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--from` | Yes | Base58 source token account |
| `--to` | Yes | Base58 destination token account |
| `--amount` | Yes | Amount in base units |

### blacklist

Manage the transfer blacklist (SSS-2 only).

#### blacklist add

Add an address to the blacklist. Caller must have the blacklister role.

```bash
sss blacklist add \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS> \
  --reason "OFAC sanctioned"
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--address` | Yes | Base58 wallet to blacklist |
| `--reason` | Yes | Compliance reason (max 128 chars) |

#### blacklist remove

Remove an address from the blacklist. Caller must have the blacklister role.

```bash
sss blacklist remove \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS>
```

#### blacklist check

Check if an address is blacklisted.

```bash
sss blacklist check \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS>
```

### roles

Manage role assignments.

#### roles grant

Grant a role to an address. Admin-only.

```bash
sss roles grant \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS> \
  --role minter
```

| Argument | Required | Description |
|---|---|---|
| `--mint` | Yes | Base58 mint address |
| `--address` | Yes | Base58 wallet to grant role to |
| `--role` | Yes | Role: `admin`, `minter`, `freezer`, `pauser`, `burner`, `blacklister`, `seizer` |

#### roles revoke

Revoke a role from an address. Admin-only.

```bash
sss roles revoke \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS> \
  --role minter
```

#### roles list

List roles for the current keypair on a given stablecoin.

```bash
sss roles list --mint <MINT_ADDRESS>
```

### holders

List all token holders for a given mint, sorted by balance descending.

```bash
sss holders \
  --mint <MINT_ADDRESS> \
  --min-balance 1000000
```

| Argument | Required | Default | Description |
|---|---|---|---|
| `--mint` | Yes | -- | Base58 mint address |
| `--min-balance` | No | 0 | Only show holders with balance >= this amount |

### audit-log

Display transaction history for a stablecoin (from the config PDA).

```bash
sss audit-log \
  --mint <MINT_ADDRESS> \
  --action mint \
  --limit 50
```

| Argument | Required | Default | Description |
|---|---|---|---|
| `--mint` | Yes | -- | Base58 mint address |
| `--action` | No | All | Filter by action type (mint, burn, freeze, thaw, etc.) |
| `--limit` | No | 25 | Maximum number of entries to display |

### minters

Manage minter role assignments.

#### minters list

List all addresses with the minter role.

```bash
sss minters list --mint <MINT_ADDRESS>
```

#### minters add

Grant the minter role to an address. Admin-only.

```bash
sss minters add \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS>
```

#### minters remove

Revoke the minter role from an address. Admin-only.

```bash
sss minters remove \
  --mint <MINT_ADDRESS> \
  --address <WALLET_ADDRESS>
```

### info

Display stablecoin configuration and status.

```bash
sss info --mint <MINT_ADDRESS>
```

Output includes: mint address, authority, preset, paused status, supply cap, total minted, total burned, and current supply.

## Examples

### Full Workflow

```bash
# Set up environment
export SOLANA_RPC_URL="http://localhost:8899"
export SOLANA_KEYPAIR="~/.config/solana/id.json"

# Create a stablecoin
sss init --preset sss-1 --name "Test USD" --symbol "tUSD"

# Grant roles
sss roles grant --mint <MINT> --address <MINTER_WALLET> --role minter
sss roles grant --mint <MINT> --address <FREEZER_WALLET> --role freezer

# Mint tokens
sss mint --mint <MINT> --to <TOKEN_ACCOUNT> --amount 1000000000

# Check status
sss info --mint <MINT>

# Freeze a suspicious account
sss freeze --mint <MINT> --account <SUSPICIOUS_ACCOUNT>

# Emergency pause
sss pause --mint <MINT>

# Seize funds (works while paused)
sss seize --mint <MINT> --from <BAD_ACCOUNT> --to <TREASURY>  --amount 500000

# Resume
sss unpause --mint <MINT>
```

### Devnet Usage

```bash
sss --rpc-url https://api.devnet.solana.com \
    --keypair ~/.config/solana/devnet.json \
    info --mint <MINT_ADDRESS>
```
