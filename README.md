# Solana Stablecoin Standard (SSS)

A preset-based stablecoin framework built on Token-2022. Deploy a minimal or fully compliant stablecoin with a single instruction — no boilerplate, no footguns.

## What This Is

Most stablecoin deployments on Solana reinvent the wheel: custom freeze logic, bespoke blacklisting, fragile authority management. SSS gives you two battle-tested presets that cover the overwhelming majority of real-world issuance scenarios:

- **SSS-1 (Minimal):** Mint authority, freeze authority, on-chain metadata, role-based access. Everything you need for a basic stablecoin or wrapped asset. No compliance overhead.

- **SSS-2 (Compliant):** Everything in SSS-1, plus permanent delegate (for seizure), transfer hook (for blacklist enforcement on every transfer), and a full blacklist system. Designed for regulated issuers who need OFAC/sanctions compliance built into the token itself.

Both presets use Token-2022 extensions natively — no wrapper contracts, no proxies. The mint authority is a PDA, so no single key can unilaterally mint.

## Feature Matrix

| Feature | SSS-1 | SSS-2 |
|---------|-------|-------|
| Mint / Burn | Yes | Yes |
| Freeze / Thaw | Yes | Yes |
| Pause / Unpause | Yes | Yes |
| Role Management | Yes | Yes |
| Supply Cap | Yes | Yes |
| Token-2022 Metadata | Yes | Yes |
| Permanent Delegate | - | Yes |
| Transfer Hook | - | Yes |
| Blacklist | - | Yes |
| Account Seizure | - | Yes |

## Architecture

The system is two programs:

### `sss-token` (Core Program)

Handles initialization, minting, burning, freezing, pausing, role management, blacklisting, and seizure. Every SSS token gets a `TokenConfig` PDA that stores the preset, supply cap, pause state, and deployer reference. Role assignment uses a per-authority `RoleAccount` PDA with a bitmask — one account per (config, wallet) pair.

For SSS-2 tokens, a `Blacklist` PDA is created alongside the config. It holds up to 256 entries (enough for most compliance workflows without blowing rent costs).

### `sss-transfer-hook` (Transfer Hook Program)

Installed on SSS-2 mints via the Token-2022 TransferHook extension. Every `transfer_checked` call routes through this program, which reads the `TokenConfig` and `Blacklist` from the core program (passed as extra account metas) and rejects the transfer if:

1. The token is paused.
2. The source owner is blacklisted.
3. The destination owner is blacklisted.

The hook program doesn't maintain its own state. It reads directly from the core program's PDAs, so there's a single source of truth for compliance status.

## Role System

Access control uses a bitmask stored in each `RoleAccount`. Six roles, combinable on a single wallet:

| Role | Flag | Description |
|------|------|-------------|
| ADMIN | 1 | Assign/revoke roles, pause/unpause. Cannot mint. |
| MINTER | 2 | Mint tokens up to the supply cap. |
| BURNER | 4 | Burn tokens from own account. |
| FREEZER | 8 | Freeze/thaw any token account for this mint. |
| BLACKLISTER | 16 | Add/remove addresses on the blacklist. SSS-2 only. |
| SEIZER | 32 | Seize all tokens from a blacklisted account. SSS-2 only. |

The deployer gets `ADMIN | MINTER | BURNER | FREEZER` on SSS-1, and all six roles on SSS-2. Separation of duties is enforced at the protocol level — a MINTER can't freeze, a FREEZER can't blacklist, etc.

## PDA Layout

```
TokenConfig:  [b"sss_config",   mint.key()]            → one per mint
RoleAccount:  [b"sss_role",     config.key(), wallet]   → one per (mint, authority)
Blacklist:    [b"sss_blacklist", config.key()]           → SSS-2 only, one per mint
ExtraMetas:   [b"extra-account-metas", mint.key()]      → transfer hook program, one per mint
```

All authority operations (minting, freezing, seizure) go through the config PDA as the signing authority. No single EOA holds mint or freeze authority.

## Build & Test

Prerequisites: Rust 1.75+, Solana CLI 1.18+, Anchor CLI 0.30.1, Node.js 18+, Yarn.

```bash
# Install dependencies
yarn install

# Build both programs
anchor build

# Generate real program IDs (do this once, then update Anchor.toml and declare_id! macros)
anchor keys list

# Run the full integration test suite (starts a local validator automatically)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

After `anchor keys list`, update the placeholder IDs in:
- `Anchor.toml` (both `[programs.localnet]` and `[programs.devnet]`)
- `programs/sss-token/src/lib.rs` (`declare_id!`)
- `programs/transfer-hook/src/lib.rs` (`declare_id!`)

### Running Tests

The integration suite covers:
- SSS-1 and SSS-2 initialization
- Token minting with supply cap enforcement
- Burning tokens
- Freeze/thaw cycle
- Pause/unpause with mint rejection while paused
- Role grants to secondary wallets
- Blacklist add/remove (SSS-2)
- Seizure of blacklisted accounts (SSS-2)
- Transfer hook extra account meta initialization (SSS-2)
- Negative tests: unauthorized callers, preset mismatches, non-blacklisted seizure attempts

## Security Design

A few deliberate choices worth calling out:

**PDA-only authority.** The config PDA is the mint authority, freeze authority, and (for SSS-2) permanent delegate. No EOA can sign for these operations directly — they must go through the program's instruction handlers, which enforce role checks.

**Supply cap enforcement.** Checked on every mint. If `supply_cap > 0`, the program rejects any mint that would push `current_supply + amount` over the cap. Overflow is caught with `checked_add`.

**Seizure uses burn+mint, not transfer.** Transferring from a blacklisted account would trigger the transfer hook, which blocks blacklisted senders — creating a deadlock. Instead, seizure burns from the blacklisted account (using the permanent delegate — burn doesn't trigger the hook) and mints equivalent tokens to the treasury. Net supply is preserved.

**Transfer hook reads from core program PDAs.** No duplicated state, no sync issues. The hook program references the same `TokenConfig` and `Blacklist` that the core program writes to.

**Last admin protection.** The program prevents an admin from revoking their own ADMIN role. You can't accidentally lock yourself out.

## Project Structure

```
programs/
  sss-token/          Core Anchor program (initialize, mint, burn, freeze, pause, roles, blacklist, seize)
  transfer-hook/      Token-2022 transfer hook for SSS-2 compliance enforcement
sdk/                  TypeScript SDK with PDA helpers and an instruction client
cli/                  Command-line tool for managing SSS tokens
backend/              Backend services (REST API, compliance checks, mint/burn lifecycle)
tests/
  integration/        Anchor integration tests against local validator
```

## License

MIT
