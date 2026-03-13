# CLI Reference

Admin CLI for Solana Stablecoin Standard. Run via `pnpm cli` or `node packages/cli/dist/index.js`.

## Global options

| Option | Env | Description |
|--------|-----|-------------|
| `-k, --keypair <path>` | `KEYPAIR` | Path to keypair JSON (default: `~/.config/solana/id.json`) |
| `-u, --rpc-url <url>` | `RPC_URL` | RPC URL (default: devnet) |
| `-m, --mint <address>` | — | Stablecoin mint address (required for all non-init commands) |

## Commands

### init

Initialize a new stablecoin. Creates mint, stablecoin PDA, and grants all roles to the authority. **Uses SDK** (`SolanaStablecoin.create` with preset or custom config).

```
pnpm cli init -p sss-1 -n "My USD" -s MUSD --uri "https://example.com"
pnpm cli init -p sss-2 -n "Compliant USD" -s cUSD --uri "" --decimals 6
```

| Option | Description |
|--------|-------------|
| `-p, --preset <sss-1\|sss-2>` | Preset: sss-1 (minimal) or sss-2 (compliant) |
| `-c, --custom <file>` | Custom config TOML/JSON file |
| `-n, --name <name>` | Token name (required) |
| `-s, --symbol <symbol>` | Token symbol (required) |
| `--uri <uri>` | Metadata URI (default: "") |
| `--decimals <n>` | Decimals (default: 6) |

---

### mint

Mint tokens to recipient. Requires minter role and quota. **Uses SDK.**

```
pnpm cli -m <MINT> mint <RECIPIENT_PUBKEY> <AMOUNT>
pnpm cli -m 9zsXSvAxz1opCQvwgeXswGnMbG4xV8dWmdT1emAFy9nY mint <RECIPIENT> 1000000
```

---

### burn

Burn tokens from signer's token account. Requires burner role. **Uses SDK.**

```
pnpm cli -m <MINT> burn <AMOUNT>
pnpm cli -m <MINT> burn 500000
```

---

### freeze

Freeze a token account (owner's ATA). Requires pauser or freezer role. **Uses SDK.**

```
pnpm cli -m <MINT> freeze <OWNER_PUBKEY>
```

---

### thaw

Thaw a token account. Requires pauser or freezer role. **Uses SDK.**

```
pnpm cli -m <MINT> thaw <OWNER_PUBKEY>
```

---

### pause

Pause the stablecoin. Mint and burn are blocked. Requires pauser role. **Uses SDK.**

```
pnpm cli -m <MINT> pause
```

---

### unpause

Unpause the stablecoin. Requires pauser role. **Uses SDK.**

```
pnpm cli -m <MINT> unpause
```

---

### status

Show stablecoin status: name, symbol, decimals, paused, SSS-2, totals.

```
pnpm cli -m <MINT> status
```

---

### supply

Show total supply (minted − burned).

```
pnpm cli -m <MINT> supply
```

---

### supply-cap

Supply cap management (authority only). Cap is optional; when set, mint cannot exceed it.

**set &lt;amount&gt;**

Set supply cap. Use `0` to remove cap (sets to u64::MAX internally).

```
pnpm cli -m <MINT> supply-cap set 1000000000
pnpm cli -m <MINT> supply-cap set 0   # remove cap
```

**clear**

Remove supply cap (alias for `set 0`).

```
pnpm cli -m <MINT> supply-cap clear
```

**get**

Show current supply cap. Prints `null (no cap)` when no cap is set.

```
pnpm cli -m <MINT> supply-cap get
```

---

### blacklist

Blacklist management (SSS-2 only). Requires blacklister role. **Uses SDK.**

**add &lt;address&gt;**

Add address to blacklist. Transfers from/to this address are blocked.

```
pnpm cli -m <MINT> blacklist add <ADDRESS> -r "OFAC match"
```

| Option | Description |
|--------|-------------|
| `-r, --reason <reason>` | Reason for blacklisting (default: "CLI") |

**remove &lt;address&gt;**

Remove address from blacklist.

```
pnpm cli -m <MINT> blacklist remove <ADDRESS>
```

---

### seize

Seize full balance from a token account to a destination. SSS-2 only. Requires seizer role. **Uses SDK.**

```
pnpm cli -m <MINT> seize <SOURCE_TOKEN_ACCOUNT> --to <DESTINATION_TOKEN_ACCOUNT>
```

| Option | Description |
|--------|-------------|
| `--to <address>` | Destination token account (e.g. treasury ATA) |

---

### minters

Minter management (authority only).

**list**

List minters and their quotas.

```
pnpm cli -m <MINT> minters list
```

**add &lt;address&gt;**

Grant minter and burner roles and set quota.

```
pnpm cli -m <MINT> minters add <ADDRESS> -q 1000000000
```

| Option | Description |
|--------|-------------|
| `-q, --quota <amount>` | Mint quota (default: 0) |

**remove &lt;address&gt;**

Revoke minter and burner roles.

```
pnpm cli -m <MINT> minters remove <ADDRESS>
```

---

### roles

Granular role management (authority only).

**grant &lt;address&gt;**

Grant specific roles. Pass flags for each role.

```
pnpm cli -m <MINT> roles grant <ADDRESS> --minter --burner
pnpm cli -m <MINT> roles grant <ADDRESS> --pauser --blacklister --seizer
```

| Option | Description |
|--------|-------------|
| `--minter` | Grant minter role |
| `--burner` | Grant burner role |
| `--pauser` | Grant pauser role |
| `--freezer` | Grant freezer role (freeze/thaw accounts) |
| `--blacklister` | Grant blacklister role (SSS-2) |
| `--seizer` | Grant seizer role (SSS-2) |

---

### holders

List token holders by mint.

```
pnpm cli -m <MINT> holders
pnpm cli -m <MINT> holders --min-balance 1000
```

| Option | Description |
|--------|-------------|
| `--min-balance <amount>` | Minimum balance to include (default: 0) |

---

### audit-log

Fetch audit log from backend. **Calls backend** when `BACKEND_URL` is set; requires backend to be running.

```
BACKEND_URL=http://localhost:3000 pnpm cli -m <MINT> audit-log
BACKEND_URL=http://localhost:3000 pnpm cli -m <MINT> audit-log --action mint
```

| Option | Description |
|--------|-------------|
| `--action <name>` | Filter by action (mint, burn, freeze, thaw, pause, blacklist, seize, roles) |

---

## Examples

```bash
# Create SSS-1 stablecoin
pnpm cli init -p sss-1 -n "Test USD" -s TUSD --uri "https://example.com" -k ~/.config/solana/id.json

# Set mint and mint tokens
MINT=$(pnpm cli init -p sss-1 -n "T" -s T --uri "" 2>&1 | grep "Mint:" | awk '{print $2}')
pnpm cli -m "$MINT" minters add $(solana address -k ~/.config/solana/id.json) -q 1000000000
pnpm cli -m "$MINT" mint $(solana address -k ~/.config/solana/id.json) 1000000

# Freeze and thaw
pnpm cli -m "$MINT" freeze <OWNER_PUBKEY>
pnpm cli -m "$MINT" thaw <OWNER_PUBKEY>

# Supply cap
pnpm cli -m "$MINT" supply-cap set 10000000000
pnpm cli -m "$MINT" supply-cap get
```
