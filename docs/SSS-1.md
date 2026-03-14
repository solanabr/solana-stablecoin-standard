# SSS-1: Minimal Stablecoin Standard

**Status:** Final  
**Version:** 1.0.0

---

## Abstract

SSS-1 defines the minimum viable standard for a stablecoin on Solana using Token-2022. It covers what every stablecoin needs: a mint, freeze capability, metadata, and role-based operations. Nothing more.

SSS-1 is designed for:
- Internal tokens and ecosystem settlement
- DAO treasury stablecoins
- Stablecoins where on-chain blacklist enforcement is not required
- Compliance implemented reactively (freeze account when a problem is identified)

## Specification

### Required Token-2022 Extensions

| Extension | Required | Notes |
|---|---|---|
| MetadataPointer | YES | Points to metadata stored in the mint account |
| MintCloseAuthority | YES | Allows closing the mint if supply reaches zero |
| DefaultAccountState | NO | Optional — freeze new accounts by default |

### Required Program Features

**Initialization parameters:**
- `name` (string, max 64 chars)
- `symbol` (string, max 16 chars)
- `uri` (string, max 200 chars — points to off-chain metadata JSON)
- `decimals` (u8)

**Required instructions:**
- `initialize` — creates mint and state PDA
- `mint` — mints tokens to a recipient (requires Minter role)
- `burn` — burns tokens (Burner role or token owner)
- `freeze_account` — freeze a token account
- `thaw_account` — unfreeze a token account
- `pause` — halt all minting and burning globally
- `unpause` — resume operations
- `update_minter` — add/update/remove minter with optional quota
- `update_roles` — assign pauser, burner roles
- `propose_authority` — propose master authority transfer
- `accept_authority` — accept pending authority transfer

**Roles:**
- `master_authority` — can do everything
- `minter` — can mint up to their quota (0 = unlimited)
- `burner` — can burn from any account
- `pauser` — can freeze/thaw accounts and pause/unpause

### Compliance Model

SSS-1 uses **reactive compliance**:
- If an address becomes problematic, the pauser or master authority freezes their account.
- Frozen accounts cannot send or receive tokens.
- The master authority can burn tokens from frozen accounts.

This is appropriate for regulated environments where:
- The token is not widely distributed
- The issuer maintains a customer relationship with all holders
- Enforcement is based on manual review, not automated screening

### State Machine

```
State: ACTIVE
  mint ──────────────────────────────→ [tokens exist]
  burn ──────────────────────────────→ [tokens destroyed]
  freeze_account ────────────────────→ State: ACCOUNT_FROZEN
  pause ─────────────────────────────→ State: PAUSED

State: ACCOUNT_FROZEN
  thaw_account ──────────────────────→ State: ACTIVE

State: PAUSED
  mint, burn ───────────────────────✗ (rejected with ProtocolPaused)
  freeze, thaw ─────────────────────✓ (still allowed)
  unpause ───────────────────────────→ State: ACTIVE
```

### Metadata Standard

The metadata URI must point to a JSON document conforming to the Metaplex Token Metadata standard:

```json
{
  "name": "My Stablecoin",
  "symbol": "MYUSD",
  "description": "1:1 USD-backed stablecoin",
  "image": "https://example.com/logo.png",
  "external_url": "https://example.com",
  "attributes": [
    { "trait_type": "Standard", "value": "SSS-1" },
    { "trait_type": "Peg", "value": "USD" }
  ]
}
```

### Reference Implementation

```typescript
import { SolanaStablecoin, Preset } from "solana-stablecoin-sdk";

const stable = await SolanaStablecoin.create({
  connection,
  preset: Preset.SSS_1,
  name: "My Stablecoin",
  symbol: "MYUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  authority: adminKeypair,
});
```

Or via CLI:

```bash
sss-token init --preset sss-1 \
  --name "My Stablecoin" \
  --symbol "MYUSD" \
  --decimals 6
```

## Security Considerations

- The master authority should be a hardware wallet or multisig in production.
- Per-minter quotas should be set to the maximum expected single-day mint volume.
- The pauser role should be assigned to an automated monitoring system that can react to off-chain signals.
- Burn authorization should require two-party approval in regulated environments.