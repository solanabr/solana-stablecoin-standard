# sss -- Solana Stablecoin Standard CLI

Command-line interface for managing stablecoins deployed with the Solana Stablecoin Standard. Built in Rust with `clap` for argument parsing and `ratatui` for the interactive TUI dashboard.

## Installation

From the workspace root:

```bash
cargo install --path cli
```

Or build without installing:

```bash
cargo build -p sss-cli
# Binary: target/debug/sss
```

For an optimized build:

```bash
cargo build -p sss-cli --release
# Binary: target/release/sss
```

## Global Flags

All subcommands accept the following global flags:

| Flag | Default | Description |
|------|---------|-------------|
| `--url <URL>` | `http://localhost:8899` | Solana RPC endpoint URL |
| `--keypair <PATH>` | `~/.config/solana/id.json` | Path to the signing keypair file |
| `--commitment <LEVEL>` | `confirmed` | Transaction commitment level (`processed`, `confirmed`, `finalized`) |

## Commands

### init

Initialize a new stablecoin mint with Token-2022 extensions, config PDA, and role registry.

```bash
sss init \
  --preset sss-2 \
  --name "USD Coin" \
  --symbol USDC \
  --decimals 6
```

| Flag | Required | Description |
|------|----------|-------------|
| `--preset <PRESET>` | Yes | Preset tier: `sss-1`, `sss-2`, `sss-3`, or `custom` |
| `--name <NAME>` | Yes | Token name (max 32 characters) |
| `--symbol <SYMBOL>` | Yes | Token symbol (max 10 characters) |
| `--decimals <N>` | Yes | Decimal places (typically 6 or 9) |

On success, prints the mint address, config PDA, and transaction signature.

### mint

Mint tokens to a recipient. Caller must be a registered active minter with sufficient quota.

```bash
sss mint \
  --mint 7Kp3...xyz \
  --amount 1000000000 \
  --recipient 9Ab2...def
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--amount <U64>` | Yes | Amount to mint in base units (e.g., 1000000000 = 1000 USDC at 6 decimals) |
| `--recipient <PUBKEY>` | Yes | Recipient wallet address (ATA is derived automatically) |

### burn

Burn tokens from the caller's token account.

```bash
sss burn \
  --mint 7Kp3...xyz \
  --amount 500000000
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--amount <U64>` | Yes | Amount to burn in base units |

### freeze

Freeze a token account, preventing all transfers in and out.

```bash
sss freeze \
  --mint 7Kp3...xyz \
  --account 3Fg5...uvw
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--account <PUBKEY>` | Yes | The token account to freeze |

### thaw

Thaw a previously frozen token account.

```bash
sss thaw \
  --mint 7Kp3...xyz \
  --account 3Fg5...uvw
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--account <PUBKEY>` | Yes | The token account to thaw |

### pause

Pause all minting and burning operations for the stablecoin. Requires the pauser role.

```bash
sss pause --mint 7Kp3...xyz
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |

### unpause

Resume operations after a pause. Requires the pauser role.

```bash
sss unpause --mint 7Kp3...xyz
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |

### blacklist add

Add an address to the blacklist and freeze their token account. Requires the blacklister role. SSS-2 only.

```bash
sss blacklist add \
  --mint 7Kp3...xyz \
  --address 5Hj1...abc \
  --account 2Rt4...ghi \
  --reason "sanctioned"
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--address <PUBKEY>` | Yes | The wallet address to blacklist |
| `--account <PUBKEY>` | Yes | The target's token account (to freeze) |
| `--reason <STRING>` | Yes | Reason for blacklisting (max 128 characters) |

### blacklist remove

Remove an address from the blacklist and thaw their token account. Requires the blacklister role. SSS-2 only.

```bash
sss blacklist remove \
  --mint 7Kp3...xyz \
  --address 5Hj1...abc \
  --account 2Rt4...ghi
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--address <PUBKEY>` | Yes | The wallet address to remove from the blacklist |
| `--account <PUBKEY>` | Yes | The target's token account (to thaw) |

### seize

Seize tokens from a blacklisted address. Burns the tokens from the blacklisted account and mints them to the treasury account. Requires the seizer role. SSS-2 only.

```bash
sss seize \
  --mint 7Kp3...xyz \
  --from 2Rt4...ghi \
  --to 8Ks9...jkl \
  --amount 500000000
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--from <PUBKEY>` | Yes | The blacklisted address's token account |
| `--to <PUBKEY>` | Yes | The treasury token account to receive seized tokens |
| `--amount <U64>` | Yes | Amount to seize in base units |

### roles update

Assign or reassign a role to a new holder. Requires master authority.

```bash
sss roles update \
  --mint 7Kp3...xyz \
  --role pauser \
  --new-holder 4Mn6...pqr
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--role <ROLE>` | Yes | Role to update: `pauser`, `blacklister`, or `seizer` |
| `--new-holder <PUBKEY>` | Yes | Public key of the new role holder |

### minter update

Create or update a minter configuration. Requires master authority.

```bash
sss minter update \
  --mint 7Kp3...xyz \
  --wallet 6Lp8...stu \
  --active \
  --quota 1000000000
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--wallet <PUBKEY>` | Yes | The minter's wallet address |
| `--active` | No | Set the minter as active (omit to deactivate) |
| `--quota <U64>` | Yes | Maximum mint allowance in base units (0 = unlimited) |

### attest

Record a reserve attestation on-chain (GENIUS Act compliance). Requires master authority.

```bash
sss attest \
  --mint 7Kp3...xyz \
  --hash a1b2c3d4e5f6...  \
  --reserves-usd 1000000 \
  --outstanding 1000000 \
  --uri "https://example.com/audit/2026-02.pdf"
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |
| `--hash <HEX>` | Yes | SHA-256 hash of the off-chain reserve proof (64-character hex string) |
| `--reserves-usd <U64>` | Yes | Total reserves in USD cents |
| `--outstanding <U64>` | Yes | Total outstanding stablecoins |
| `--uri <URL>` | Yes | URI to the full attestation report (max 200 characters) |

### info

Display detailed information about a stablecoin: configuration, feature flags, supply metrics, roles, and recent attestations.

```bash
sss info --mint 7Kp3...xyz
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |

### dashboard

Launch an interactive TUI dashboard with live-updating views of the stablecoin state.

```bash
sss dashboard --mint 7Kp3...xyz
```

| Flag | Required | Description |
|------|----------|-------------|
| `--mint <PUBKEY>` | Yes | The stablecoin mint address |

The dashboard displays:

- Stablecoin configuration and metadata
- Current supply (minted - burned)
- Pause status
- Role assignments (master authority, pauser, blacklister, seizer)
- Active minters and their quotas
- Recent reserve attestations

Press `q` or `Esc` to exit.

## Examples

### Full SSS-2 Workflow

```bash
# 1. Initialize an SSS-2 compliant stablecoin
sss init --preset sss-2 --name "USD Coin" --symbol USDC --decimals 6

# 2. Configure a minter with a 10B base-unit quota
sss minter update --mint <MINT> --wallet <MINTER_WALLET> --active --quota 10000000000

# 3. Assign compliance roles
sss roles update --mint <MINT> --role blacklister --new-holder <COMPLIANCE_KEY>
sss roles update --mint <MINT> --role seizer --new-holder <COMPLIANCE_KEY>
sss roles update --mint <MINT> --role pauser --new-holder <OPS_KEY>

# 4. Mint tokens
sss mint --mint <MINT> --amount 1000000000 --recipient <RECIPIENT>

# 5. Blacklist a sanctioned address
sss blacklist add --mint <MINT> --address <BAD_ACTOR> --account <BAD_ACTOR_ATA> --reason "OFAC SDN"

# 6. Seize tokens from the blacklisted address
sss seize --mint <MINT> --from <BAD_ACTOR_ATA> --to <TREASURY_ATA> --amount 500000000

# 7. Record a reserve attestation
sss attest --mint <MINT> \
  --hash abc123...def \
  --reserves-usd 1000000000 \
  --outstanding 1000000000 \
  --uri "https://example.com/audit.pdf"

# 8. View stablecoin state
sss info --mint <MINT>
```

## License

MIT
