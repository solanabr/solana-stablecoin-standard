# SSS -- Solana Stablecoin Standard

## Quick Reference
- **Anchor programs:** `programs/sss-core/`, `programs/sss-transfer-hook/`
- **TypeScript SDK:** `sdk/` (pnpm workspace: `@stbr/sss-token`)
- **Rust CLI:** `cli/` (cargo workspace: `sss-cli`)
- **Backend:** `backend/` (Express/Fastify)
- **TUI:** `tui/` (ratatui)
- **Frontend:** `frontend/` (Next.js 15)
- **Integration tests:** `tests/`
- **Fuzz tests:** `trident-tests/`

## Architecture
Two Anchor programs composed by SDK into 3 presets:
- SSS-1 (minimal): sss-core only
- SSS-2 (compliant): sss-core + sss-transfer-hook
- SSS-3 (private): sss-core + Token-2022 ConfidentialTransfer (no hook -- incompatible)

## Build & Test
- `anchor build` -- build programs
- `anchor test` -- integration tests
- `pnpm test:sdk` -- SDK unit tests
- `cargo test` -- Rust unit tests
- `cargo run --bin sss-cli -- --help` -- CLI

## Key Design Decisions
- Presets are SDK-level, not program-level
- Transfer hooks + confidential transfers are INCOMPATIBLE
- SSS-3 uses auditor key for compliance instead of hooks
- Role-based access: admin(0), minter(1), freezer(2), pauser(3), burner(4), blacklister(5), seizer(6) — PDA per role per address
- Per-minter quotas: `mint_quota: Option<u64>`, `amount_minted: u64` on RoleAccount (ROLE_SPACE=131)

## PDA Seeds
- StablecoinConfig: `["sss-config", mint.key()]`
- RoleAccount: `["sss-role", config.key(), address.key(), role_u8]`
- BlacklistEntry: `["blacklist", mint.key(), address.key()]`
- ExtraAccountMetas: `["extra-account-metas", mint.key()]`

## Program IDs
- sss-core: `Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB`
- sss-transfer-hook: `hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH`
