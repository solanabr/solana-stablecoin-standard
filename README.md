# Solana Stablecoin Standard (SSS)

![Tests](https://img.shields.io/badge/tests-254%20passing-brightgreen)
![Fuzz](https://img.shields.io/badge/fuzz-22%20invariants-blue)
![Devnet](https://img.shields.io/badge/devnet-28%20tx%20verified-blueviolet)
![Token-2022](https://img.shields.io/badge/Solana-Token--2022-blue)

A modular two-program framework for issuing compliant stablecoins on Solana using Token-2022
extensions: PermanentDelegate, TransferHook, DefaultAccountState, and ConfidentialTransferMint.

---

## Key Differentiators

**MasterMinter + Decrementing Allowance** (Circle USDC pattern) — Each minter receives a
capped allowance that decrements on every mint call. Admins increment allowances independently,
enabling delegated minting without unlimited authority.

**Burn+Mint Seize** (Tether destroyBlackFunds pattern) — Atomically thaws a frozen account,
burns tokens via PermanentDelegate, re-freezes the account, and mints the equivalent amount
to the treasury. Single instruction, no front-running window.

**Two-Step Admin Transfer** (Circle transferOwnership pattern) — `transfer_admin` sets a
pending admin; `accept_admin` confirms. The current admin retains control until the new admin
explicitly accepts, preventing accidental lockout.

**Blacklist on ALL Operations** — Blacklisted addresses are rejected on transfers (TransferHook),
`mint_to`, and `burn_from`. Protocol-level enforcement, not application-level.

---

## Architecture

```
                         Off-chain Layer
  ┌──────────────────────────────────────────────────────────────┐
  │  @sss/cli  ──────►  @sss/sdk  ──────►  @sss/frontend        │
  │ (20 commands)       (SolanaStablecoin   (React dashboard,    │
  │                      PriceFeedMonitor)   Wallet Adapter)     │
  └──────────────────────┬───────────────────────────────────────┘
                         │ RPC
                         ▼
                       On-chain Layer
  ┌──────────────────────────────────────────────────────────────┐
  │  sss-core (Anchor, 17 instructions)                          │
  │  GmG49Q2d988k5C6dkTLLCihGfH5G6QVg5Rbgv54Z7iw4              │
  │                                                              │
  │  create_mint · mint_to · burn_from · seize                   │
  │  grant_role · revoke_role · increment_allowance              │
  │  blacklist · unblacklist · pause · unpause                   │
  │  transfer_admin · accept_admin · initialize_hook             │
  │  freeze_account · thaw_account · set_metadata                │
  │                     │                                        │
  │                     │ CPI (invoke_signed via config PDA)     │
  │                     ▼                                        │
  │  sss-transfer-hook (Anchor, 5 instructions)                  │
  │  2b5HCPo4PC7w63MmUnXxuR9kwtaQpni8AXktfZHiMf2p              │
  │                                                              │
  │  initialize_hook_config · initialize_extra_account_meta_list │
  │  transfer_hook · add_to_blacklist · remove_from_blacklist    │
  └──────────────────────────────────────────────────────────────┘
```

The `StablecoinConfig` PDA is the single authority for all privileged operations (mint authority,
freeze authority, permanent delegate). No private key holds these authorities — only the config
PDA can sign via `invoke_signed`.

---

## Presets

| Feature                          | SSS-1 (Minimal) | SSS-2 (Compliant) | SSS-3 (Confidential) |
|----------------------------------|:---------------:|:-----------------:|:--------------------:|
| MetadataPointer + TokenMetadata  | Yes             | Yes               | Yes                  |
| Role-based Access (5 roles)      | Yes             | Yes               | Yes                  |
| Pause / Unpause                  | Yes             | Yes               | Yes                  |
| PermanentDelegate                | -               | Yes               | Yes                  |
| DefaultAccountState (Frozen)     | -               | Yes               | Yes                  |
| TransferHook (Blacklist)         | -               | Yes               | Yes                  |
| ConfidentialTransferMint         | -               | -                 | Yes (PoC)            |

**SSS-1** — Internal tokenization, rewards points, development/testing. No compliance extensions.

**SSS-2** — Regulated stablecoins. New accounts start frozen (KYC gate). Transfer hook enforces
blacklist on every transfer. PermanentDelegate enables burn-from and atomic seize.

**SSS-3** — Extends SSS-2 with Token-2022 `ConfidentialTransferMint`. Encrypted transfer amounts
via ElGamal/ZK-proofs. Auditor key can decrypt for regulatory reporting. Current PoC reserves
extension space; full auditor key registration is outside current scope.

---

## Quick Start

### Prerequisites

- Solana CLI v2.1+, Anchor CLI v0.32.1, Node.js v20+, Rust 1.85+

### Build & Test

```bash
yarn install                # Install all workspace dependencies
anchor build                # Compile on-chain programs
anchor test                 # Run full test suite (254 tests)

cd sdk && yarn build        # Build TypeScript SDK
cd cli && yarn build        # Build CLI
cd frontend && yarn dev     # Launch admin dashboard
```

### Create a Stablecoin

```bash
# SSS-1: minimal issuance
sss-token create --name "My Dollar" --symbol MUSD --decimals 6 --preset sss-1

# SSS-2: full compliance stack
sss-token create --name "Compliant Dollar" --symbol CUSD --decimals 6 \
  --preset sss-2 \
  --transfer-hook-program 2b5HCPo4PC7w63MmUnXxuR9kwtaQpni8AXktfZHiMf2p \
  --treasury <TREASURY_PUBKEY>
```

---

## Role-Based Access Control

| Role               | Capabilities                                                          | Allowance |
|--------------------|-----------------------------------------------------------------------|-----------|
| Minter             | `mint_to` up to remaining allowance cap                               | Decrements on each mint |
| Burner             | `burn_from` any token account via PermanentDelegate                   | No |
| Seizer             | `seize` — atomic burn+mint from blacklisted accounts to treasury      | No |
| Pauser             | `pause` and `unpause` — global circuit breaker                        | No |
| ComplianceOfficer  | `freeze_account` and `thaw_account` on individual accounts            | No |

Roles are stored as individual `RoleAccount` PDAs per (config, holder, role).
The admin can call any instruction that checks `config.admin` directly — no role PDA required.

---

## Compliance Patterns

### Blacklisting

Enforced at three layers:
1. **sss-core** checks blacklist before `mint_to` and `burn_from` via `remainingAccounts`
2. **sss-transfer-hook** checks both sender and recipient on every transfer (called automatically by Token-2022)

BlacklistEntry PDA (`["blacklist", hookConfig, wallet]`) — existence = blacklisted.
Only sss-core can create/close entries via `invoke_signed` with the config PDA.

### Account Freezing (KYC Gate)

`DefaultAccountState(Frozen)` means every new token account starts frozen. Accounts cannot
transact until a ComplianceOfficer or Admin calls `thaw_account` after KYC verification.

### Atomic Seize

Single instruction: thaw → burn → refreeze → mint-to-treasury. Eliminates the race condition
between freeze and burn. `total_seized` on `StablecoinConfig` accumulates all seized amounts.

### Two-Step Admin Transfer

```
Step 1: transfer_admin(new_admin)  →  config.pending_admin = new_admin
Step 2: accept_admin()             →  config.admin = pending_admin (must be signed by new_admin)
```

If `pending_admin` never calls `accept_admin`, the current admin remains in control.

---

## Security Model

### Threat Vectors and Mitigations

| Threat | Mitigation |
|--------|-----------|
| **Authority escalation** | Every privileged instruction requires a `RoleAccount` PDA derived from `["sss_role", config, signer, role_discriminant]`. The PDA can only be created by the admin via `grant_role`. |
| **Blacklist bypass** | `TransferHook` extension registered on the mint. Token-2022 always invokes the hook regardless of caller. `DefaultAccountState(Frozen)` provides a second layer. |
| **Reentrancy** | `transfer_hook` only reads PDA data — no CPI calls or state mutations. Solana's runtime prevents reentrancy via the account borrow model. `seize` is atomic (single instruction). |
| **Integer overflow** | All arithmetic uses `checked_add` / `checked_sub` with `ok_or(SssError::Overflow)`. |
| **Seize front-running** | Accounts with `DefaultAccountState(Frozen)` can only be thawed by the config PDA. Seize performs thaw as its first atomic step. |
| **Admin key compromise** | Two-step transfer means a compromised key can nominate but not finalize. The admin key does not hold mint/freeze/delegate authority — these are held by the config PDA. |
| **Unauthorized hook CPI** | `add_to_blacklist` requires the config PDA signer. External programs cannot generate a valid signature for the config PDA seeds. |

### Architectural Security Properties

- **No admin private key holds on-chain authority.** Mint, freeze, and delegate authorities all point to the config PDA.
- **Decrementing allowances** cap per-minter risk without requiring trust in individual operators.
- **Transfer hook blacklist** is enforced by Token-2022 runtime — cannot be bypassed by direct token transfer.
- **CPI trust chain**: User → sss-core (Anchor, verified) → invoke_signed → sss-transfer-hook / Token-2022.

---

## PDA Hierarchy

### sss-core

| Account | Seeds | Purpose |
|---------|-------|---------|
| `StablecoinConfig` | `["sss_config", mint]` | Global state per stablecoin mint |
| `RoleAccount` | `["sss_role", config, holder, role_discriminant]` | One role grant per (config, holder, role) tuple |

### sss-transfer-hook

| Account | Seeds | Purpose |
|---------|-------|---------|
| `HookConfig` | `["hook_config", mint]` | Per-mint hook state; stores authority (config PDA) |
| `BlacklistEntry` | `["blacklist", hookConfig, wallet]` | Existence = blacklisted |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | Required by SPL transfer hook interface |

---

## SDK Reference

### Setup

```typescript
import { AnchorProvider } from "@coral-xyz/anchor";
import { SolanaStablecoin, Role } from "@sss/sdk";
import SssCoreIDL from "@sss/idl/sss_core.json";

const provider = new AnchorProvider(connection, wallet, {});
const sss = new SolanaStablecoin(provider, SssCoreIDL);
```

### Core Operations

```typescript
// Create mint
const { mint, config } = await sss.createMint({
  name: "Compliant Dollar", symbol: "CUSD", uri: "", decimals: 6,
  preset: Preset.SSS2,
  transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
  treasury: treasuryPubkey,
});
await sss.initializeHook(mint);  // required for SSS-2/SSS-3

// Mint (caller must have Minter role)
await sss.mintTo({ mint, to: recipientAta, toOwner: recipientWallet, amount: new BN(1_000_000) });

// Burn (caller must have Burner role)
await sss.burnFrom({ mint, from: sourceAta, fromOwner: sourceWallet, amount: new BN(500_000) });

// Seize (caller must have Seizer role, source must be blacklisted)
await sss.seize({ mint, from: blacklistedAta, fromOwner: blacklistedWallet, treasuryAta, amount: new BN(1_000_000) });
```

### Role Management

```typescript
await sss.grantRole({ mint, holder: minterWallet, role: Role.Minter, allowance: new BN(1_000_000_000) });
await sss.revokeRole(mint, minterWallet, Role.Minter);
await sss.incrementAllowance(mint, minterWallet, new BN(500_000_000));
```

### Compliance

```typescript
await sss.blacklist({ mint, wallet: sanctionedAddress });
await sss.unblacklist({ mint, wallet: address });
await sss.freezeAccount(mint, userTokenAccount);
await sss.thawAccount(mint, userTokenAccount);
await sss.pause(mint);
await sss.unpause(mint);
```

### Admin Transfer (Two-Step)

```typescript
await sss.transferAdmin(mint, newAdminAddress);  // Step 1: current admin
await sss.acceptAdmin(mint);                      // Step 2: new admin signs
```

### Query Methods

```typescript
const info = await sss.getStablecoinInfo(mint);
// → { admin, pendingAdmin, mint, preset, paused, transferHookProgram, treasury,
//      totalMinted, totalBurned, totalSeized }

const roleInfo = await sss.getRoleInfo(mint, holder, Role.Minter);
// → { config, holder, role, allowance } | null

const blacklisted = await sss.isBlacklisted(mint, wallet);
// → boolean
```

### PDA Helpers

```typescript
import { findConfigPda, findRolePda, findHookConfigPda, findBlacklistEntryPda } from "@sss/sdk";

const [config] = findConfigPda(mint);                           // ["sss_config", mint]
const [roleAccount] = findRolePda(config, holder, Role.Minter); // ["sss_role", config, holder, 0]
const [hookConfig] = findHookConfigPda(mint);                   // ["hook_config", mint]
const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet); // ["blacklist", hookConfig, wallet]
```

### Error Handling

| Error | Cause |
|-------|-------|
| `Insufficient allowance` | Minter's remaining allowance < requested amount |
| `Blacklisted` | Sender or recipient is on the blacklist |
| `Paused` | Protocol is paused |
| `Unauthorized` | Caller lacks required role |

---

## CLI Tool

20 commands covering all stablecoin operations.

```bash
cd cli && npm install && npm run build
sss-token --help
```

| Category | Commands |
|----------|----------|
| Core | `info`, `mint-to`, `burn-from`, `seize` |
| Roles | `grant-role`, `revoke-role`, `increment-allowance`, `role-info` |
| Compliance | `blacklist`, `unblacklist`, `is-blacklisted`, `freeze`, `thaw`, `pause`, `unpause` |
| Admin | `transfer-admin`, `accept-admin`, `init-hook` |
| Oracle | `oracle-price`, `oracle-check-peg` |

Global options: `--rpc-url <url>` (default: devnet), `--keypair <path>`.

### Example Workflows

```bash
# Full SSS-2 lifecycle
sss-token init-hook <MINT>
sss-token grant-role <MINT> <MINTER_ADDR> minter 100000000
sss-token mint-to <MINT> <USER_ATA> 1000000
sss-token oracle-check-peg USDC/USD

# Compliance enforcement
sss-token blacklist <MINT> <BAD_ACTOR>
sss-token seize <MINT> <BAD_ACTOR_ATA> <TREASURY_ATA> 1000000 --from-owner <BAD_ACTOR>

# Emergency pause
sss-token pause <MINT>
sss-token unpause <MINT>

# Two-step admin transfer
sss-token transfer-admin <MINT> <NEW_ADMIN>
sss-token --keypair new-admin.json accept-admin <MINT>
```

---

## Oracle Module

Client-side price monitoring via Pyth oracle feeds. No on-chain oracle dependency.

```typescript
import { PriceFeedMonitor, PYTH_FEEDS_DEVNET } from "@sss/sdk";

const monitor = new PriceFeedMonitor(connection);

// Get current price
const price = await monitor.getPrice(PYTH_FEEDS_DEVNET["USDC/USD"]);
// → { price: 1.000234, confidence: 0.0001, status: "trading", publishTime, feedAddress }

// Check peg status
const peg = await monitor.checkPeg(PYTH_FEEDS_DEVNET["USDC/USD"], 1.0, 50);
// → { price, targetPrice, deviationBps, toleranceBps, isPegged, status: "pegged"|"warning"|"depegged" }

// Batch query
const prices = await monitor.getMultiplePrices([usdcFeed, usdtFeed, solFeed]);
```

**Peg Status Levels:**
- **pegged** (deviation <= tolerance) — normal operation
- **warning** (tolerance < deviation <= 2x tolerance) — investigate market conditions
- **depegged** (deviation > 2x tolerance) — immediate intervention required

**CLI:**
```bash
sss-token oracle-price USDC/USD
sss-token oracle-check-peg USDC/USD --target 1.0 --tolerance 50
```

---

## Frontend Dashboard

React admin dashboard with Wallet Adapter integration. Built with Vite + Tailwind CSS.

```bash
cd frontend && yarn dev
```

| Page | Features |
|------|----------|
| Dashboard | Supply stats (totalMinted, totalBurned, totalSeized), preset badge, admin info, pause status |
| Operations | Mint, burn, seize with amount inputs and tx confirmation |
| Compliance | Blacklist add/remove, freeze/thaw, pause/unpause |
| Roles | Grant/revoke roles, manage minter allowances |
| Admin | Two-step admin transfer, metadata updates |
| Info | Full stablecoin configuration viewer (read-only) |

---

## Test Suite

**254 tests passing, 0 failing.**

| Category | Files | Coverage |
|----------|-------|---------|
| sss-core unit | 14 | All 17 instructions, role enforcement, allowance logic, pause checks |
| sss-transfer-hook unit | 3 | Hook initialization, blacklist add/remove, transfer gate |
| E2E | 6 | Full mint lifecycle, seize flow, pause/unpause, admin transfer, SSS-1/2/3 |
| Security | 4 | Reentrancy, authority escalation, blacklist bypass, integer overflow |

### Fuzz Testing (Trident)

22 invariants across 2 fuzz targets:

**fuzz_0 — Supply Invariants:**
- `total_minted >= total_burned` at all times
- `total_seized <= total_burned`
- Allowance decrements by exactly the minted amount
- All counters use `checked_add`/`checked_sub`, never wrap
- Pause blocks all token operations
- Minting to blacklisted wallet always fails

**fuzz_1 — Role Escalation:**
- A minter PDA cannot authorize burner/seizer/pauser instructions
- Revoked role PDA cannot authorize any instruction
- Admin/treasury addresses cannot be blacklisted
- Cross-config PDA reuse is rejected
- Only `pending_admin` can call `accept_admin`

```bash
cargo install trident-cli
trident fuzz run-hfuzz fuzz_0 -- --run_time 60
trident fuzz run-hfuzz fuzz_1 -- --run_time 60
```

---

## Devnet Deployment

Both programs deployed on Solana Devnet. **28/28 operations verified.**

| Program | Program ID |
|---------|-----------|
| sss-core | `GmG49Q2d988k5C6dkTLLCihGfH5G6QVg5Rbgv54Z7iw4` |
| sss-transfer-hook | `2b5HCPo4PC7w63MmUnXxuR9kwtaQpni8AXktfZHiMf2p` |

| Mint | Address |
|------|---------|
| SSS-1 | `B7nvubrRXuwD1N99M8PtHHhjUwJpZRS4xv3BJUWd8SAL` |
| SSS-2 | `HRbKjqeC3oztqeY1HijEs1XEz5u3map7Q5RF8bcHebXC` |

| # | Operation | Explorer |
|---|-----------|----------|
| 1 | Create SSS-1 mint | [View](https://explorer.solana.com/tx/7XEFoQMSjUrvjTKw2coPnmyjVDP1DdCtyJCKePMPY7aVkTLxLJ4HqLZ4JGdbvEPV5NPy8y1LGboaYnbPBm76EmD?cluster=devnet) |
| 2 | Grant Minter role | [View](https://explorer.solana.com/tx/2YC7sQJ51M2NoKpoQDdHirzF5tYbzcRJwdgDyr5xDZaKmGyZavzPHouTGHGncv6V3itKm9riKpAtUFkX5jj5CM7c?cluster=devnet) |
| 3 | Grant Burner role | [View](https://explorer.solana.com/tx/64gxkSTLLAMtpbcjNiBXbdk7qdSAZ64pWFqoh8t3pirMBr9Hq3gfmBgkGVcJPKgrHdABtdwz738uF2CpXyewDPt9?cluster=devnet) |
| 4 | mint_to 1000 tokens | [View](https://explorer.solana.com/tx/5ymRymCt9sK31ZTUAXLT8jQXXjGbhQ5K9iLHva3c7jC4jER8VNJN4wRm91vUmZ41uimgE7TERmJJh5eSbxGZG17z?cluster=devnet) |
| 5 | pause | [View](https://explorer.solana.com/tx/5UuXN9wdTfP2gSvLn7wfBw12jTEoDn1LzZMDuzxfUijDdGvy2rf3qmDGowc3haZmKhn8cguYtmWYkgXFgZ5pxD8w?cluster=devnet) |
| 6 | unpause | [View](https://explorer.solana.com/tx/3defmAXwcWUSXzrKxvt6GhGYcSZwfCTZznG8LpgRufe6nqZwuYU1bhbBVZf41buNkznkuLccW8TZnE8wtLQyCiLV?cluster=devnet) |
| 7 | transfer_admin | [View](https://explorer.solana.com/tx/468aKKbTgYdBHxtG71uk8dwRpn5dMaqqL9etSWozTZAtqrLFNKLx5TXk5dPAqAgPymCPUHLELq44uQHWq8YTymdj?cluster=devnet) |
| 8 | accept_admin | [View](https://explorer.solana.com/tx/54f3JSnaYxECGEUMhnC5TYewmNPsAmaqxKk7y7Hbq5UGfGtgyWtGb3ZNT6EXghUPeKSgBthWHzeTTUd7uDoT5DwV?cluster=devnet) |
| 9 | transfer_admin back | [View](https://explorer.solana.com/tx/5NsuYNaf5vPFKhjMiZKeSyEFoLD7ovrHZkVufVXUJe1NnM78JPmoXPQAc5WC11MFRLgmtx4VRC2aTQHfaPSy3or2?cluster=devnet) |
| 10 | accept_admin back | [View](https://explorer.solana.com/tx/35ey1BjDCa44ciXriBY1WWFc6s2fzJbkLuSpJY8JGnkgEped9qS6hPFUvR5BC7ivNHRqErXrh45XDLARfNjgDi7S?cluster=devnet) |
| 11 | Create SSS-2 mint (with hook) | [View](https://explorer.solana.com/tx/diAENEe6m1nbHVXdiJvHtT23t3zUvni3ZY3gMhch9JRKBn5wN63ERhowRiNuQ3LjEaLBz2QXwV5Dg1x1uNeBe4i?cluster=devnet) |
| 12 | initialize_hook | [View](https://explorer.solana.com/tx/3DTHikgPQM54288NmxnYAxhgcNihcSGwaMPXoYE7prcZu7dfAyv8TYrsphLVq6ygjJ7UkuHzJzmAoi7UjZTqYmWn?cluster=devnet) |
| 13 | Grant Minter (SSS-2) | [View](https://explorer.solana.com/tx/3zmQYeBYbFnW8wPTDtMAgEcPxPzEnzNqz3eWA7WXJpaKLSjeFVAgp1q1rh6STHQgK2ZqFzBvw8c1CNVz7eXAZSui?cluster=devnet) |
| 14 | Grant Burner (SSS-2) | [View](https://explorer.solana.com/tx/3fkm12VipMfqFitHJ6Co9RYvTwfThb72NPTa485Su7NRgVC5omYjyy8tMn759G7UiFnqbYDQXQP5GxVgK4vL95AU?cluster=devnet) |
| 15 | mint_to 500 (SSS-2) | [View](https://explorer.solana.com/tx/26nTeQJRftcn9x8KcStMMHF8NQqXXsVSDwLc1XUMyESaef6SFBLznQX3f3JwaVYx1E5ic2tsCEPRgzseuzr8spUn?cluster=devnet) |
| 16 | burn_from 50 (SSS-2) | [View](https://explorer.solana.com/tx/3gCp3bqPttQfUDiN1LppAbnZzkqJygbs2AicFrP1cghGCZfbkph872XqioEZyeMVxGF98CwyHJgJSsn3yfNEpG1X?cluster=devnet) |
| 17 | Grant ComplianceOfficer | [View](https://explorer.solana.com/tx/3dbGMUWsCDSLBo6FCKF6bhjCCBWAZJZ3kJzw5LBqdAQb3J887vRNM6MSbwzQe8SBEELgyVUNRJNdaQAvDaiff4nz?cluster=devnet) |
| 18 | blacklist | [View](https://explorer.solana.com/tx/3CXTUUZ5rbwCtN8ePdG36KCmgSaFwu8SkgrTUcEiBj9AAxPwcack5TuA5XVZrPwsWE4FarGig23bq37HsrTg4PoZ?cluster=devnet) |
| 19 | unblacklist | [View](https://explorer.solana.com/tx/3rLQ4CCRrvkKKtLjmuNSLbsyyBWpPbZdVyMDoYWL8SUj9ASSPz1hgAUgcb8pTK698Fgh1tJ2i3PB3jJ6a8sLiqo?cluster=devnet) |
| 20 | thaw_account | [View](https://explorer.solana.com/tx/sVb53XxS92rm6CZCcNMZtfBvpWcA9gY2FtEH6ussi6MPHRU4d4pBD2f2nVNHRaguqjRDfY8oDyXqNTvRmjjVXaJ?cluster=devnet) |
| 21 | mint_to 100 to user (SSS-2) | [View](https://explorer.solana.com/tx/5qzQAzCF3musWMkdiczSoAuhkTT4gyikqmoctLsuxo6zDB5DsH12cxj1xneZ8AazZYX7iQGWKJB7ky1Sy7ihe3ZR?cluster=devnet) |
| 22 | freeze_account | [View](https://explorer.solana.com/tx/oqxxHVJXnDL4HTuseWRkY1FcmQwuPQXEGBXSYjGWfy9587vEErqPcPM14GqRH3K2MMrm3uxnZDUnGrpGqvkYgQf?cluster=devnet) |
| 23 | thaw_account (pre-seize) | [View](https://explorer.solana.com/tx/1LKoQeWBbkYeuEEHRw4qro8zxtjN272nuwtcwfKAcY4XuPLfUCSGJ7nczc8WvTxpaYZ1de3ZFnRry2pc1fnqvTe?cluster=devnet) |
| 24 | Grant Seizer (SSS-2) | [View](https://explorer.solana.com/tx/23nze3QvVdSXJMh2CstkFQYrWoFFipY9avDrBLsqGKHw2MEBEBi2z5j1exYDprzYUjNUp8jAxjTg6xy2bG2GHuyt?cluster=devnet) |
| 25 | blacklist user (pre-seize) | [View](https://explorer.solana.com/tx/5RGqEwBaVmTSkL15vPceGBE7ZN8q69AeQtux1hRqm8z8wNAH5QoBxz3YTpmhcZ6KYW1RxEzbBKnohgtEhMgFxGqr?cluster=devnet) |
| 26 | seize 100 to treasury | [View](https://explorer.solana.com/tx/473JvzyvD4hmc2nFp25QKZStgYaT7FPfFBAypAPoznKBcRQDjquzTnp1WSxnpeD5SMQzni43KoHDBTy3xSeYcThA?cluster=devnet) |
| 27 | thaw user2 (pre-transfer) | [View](https://explorer.solana.com/tx/27L6GcTh4w5ZQMsYSzjAprM3i2VKKfvzgmV7ZnNcusyW3cfCxbbUv1r4K9ts1ziKbqXXCYnLKajgmSw5mKcny1zh?cluster=devnet) |
| 28 | transferChecked with hook | [View](https://explorer.solana.com/tx/25B9wxbQvfP7yxVNdzbrSSVkzkNWJwCcRz48ekfZPADWdBwnFYaXdx6Ke6sMmSA19fvngFu3zGQuFXc2CvAZuTXD?cluster=devnet) |

---

## Instruction Flows

### Seize (Atomic)

```
Seizer ──seize(amount)──► sss-core
  ├─ verify role_account.role == Seizer
  ├─ verify !config.paused
  ├─ verify source is blacklisted (remainingAccounts)
  ├─ CPI token_2022::thaw_account(from)     [signer: config PDA]
  ├─ CPI token_2022::burn(from, amount)     [signer: config PDA, permanent delegate]
  ├─ CPI token_2022::freeze_account(from)   [signer: config PDA]
  ├─ CPI token_2022::mint_to(treasury, amount) [signer: config PDA]
  └─ config.total_seized += amount (checked_add)
```

### Blacklist

```
Admin ──blacklist(wallet)──► sss-core
  ├─ verify admin == config.admin
  └─ invoke_signed(sss-transfer-hook::add_to_blacklist) [signer: config PDA]
       └─ creates BlacklistEntry PDA { hookConfig, wallet }

On next transfer involving wallet:
  Token-2022 ──transfer_hook CPI──► sss-transfer-hook
    ├─ check BlacklistEntry(hookConfig, sender)   → revert if exists
    └─ check BlacklistEntry(hookConfig, recipient) → revert if exists
```

### Transfer Hook Flow

```
User initiates transfer_checked
  → Token-2022 reads TransferHook extension on mint
  → CPI into sss-transfer-hook::transfer_hook
  → ExtraAccountMetaList tells Token-2022 which accounts to pass
  → Hook checks BlacklistEntry PDAs for sender and receiver
  → If either exists → Err(Blacklisted)
  → If neither exists → transfer proceeds
```

---

## Token-2022 Extensions

| Extension | Presets | Purpose |
|-----------|---------|---------|
| `MetadataPointer` | All | Points mint to itself; embedded on-chain metadata |
| Token Metadata Interface | All | Stores name, symbol, URI on the mint account |
| `DefaultAccountState(Frozen)` | SSS-2, SSS-3 | New ATAs start frozen; must be thawed after KYC |
| `PermanentDelegate` | SSS-2, SSS-3 | Config PDA can burn/transfer from any token account |
| `TransferHook` | SSS-2, SSS-3 | Registers sss-transfer-hook; called on every transfer |
| `ConfidentialTransferMint` | SSS-3 | Reserves space for confidential ZK transfer capability |

---

## Compliance Workflows

### Sanctions Response

```
1. OFAC designates address      →  blacklist(wallet)
2. All operations blocked        →  mint_to, burn_from, transfers fail
3. Asset recovery if required    →  seize(from, amount)
```

### KYC Onboarding

```
1. User creates token account   →  starts frozen (DefaultAccountState)
2. User submits KYC documents
3. ComplianceOfficer verifies   →  thawAccount()
4. User can now transact
   If fails AML later           →  freezeAccount() or blacklist()
```

### Emergency Response

```
1. Security incident detected   →  pause()
2. All transfers and mints halt
3. Investigation proceeds        →  freeze/blacklist affected accounts
4. After resolution             →  unpause()
```

### USDC / USDT Comparison

| Feature | USDC | USDT | SSS-2 |
|---------|------|------|-------|
| Blacklisting | Yes | Yes | Yes |
| Account freezing | Yes | Yes | Yes (DefaultAccountState) |
| Asset seizure | Yes | destroyBlackFunds | Yes (atomic burn+mint) |
| MasterMinter / allowance | Yes | - | Yes |
| Two-step admin transfer | Yes | - | Yes |
| Pause | Yes | Yes | Yes |
| On-chain metadata | Yes | - | Yes |

---

## Project Structure

```
solana-stablecoin-standard/
  programs/
    sss-core/              17 instructions, Anchor
    sss-transfer-hook/     5 instructions, Anchor
  sdk/
    src/core/              SolanaStablecoin class
    src/utils/             PDA helpers, types
    src/oracle/            PriceFeedMonitor, Pyth constants
  cli/                     20 CLI commands (Commander.js)
  frontend/                React + Vite + Tailwind admin dashboard
  tests/
    unit/                  14 sss-core + 3 hook unit tests
    e2e/                   6 end-to-end test suites
    security/              4 security test suites
  trident-tests/           2 fuzz targets, 22 invariants
  scripts/                 Devnet smoke test
```

---

## License

MIT
