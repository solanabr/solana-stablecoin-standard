# Bounty Requirement Gap Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all 8 gaps between the SSS implementation and the Superteam bounty requirements.

**Architecture:** Expand the Role enum from 4 to 7 variants (add Burner, Blacklister, Seizer). Add per-minter quota tracking to RoleAccount with a new `update_minter` instruction. Add custom config support via TOML (CLI) and extension flags (SDK). Add sanctions screening integration point and fiat lifecycle verification to backend.

**Tech Stack:** Anchor 0.32 (Rust), TypeScript SDK, Express backend, clap CLI with `toml` crate

---

## Task 1: Expand Role Enum (Burner, Blacklister, Seizer)

**Files:**
- Modify: `programs/sss-core/src/state/role.rs`
- Modify: `programs/sss-core/src/instructions/manage_roles.rs:57-63`
- Modify: `sdk/src/types.ts`
- Modify: `cli/src/utils.rs` (role parsing)

**Step 1: Update Role enum**

In `programs/sss-core/src/state/role.rs`, expand the enum:

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Admin,       // 0
    Minter,      // 1
    Freezer,     // 2
    Pauser,      // 3
    Burner,      // 4
    Blacklister, // 5
    Seizer,      // 6
}

impl Role {
    pub fn as_u8(&self) -> u8 {
        match self {
            Role::Admin => 0,
            Role::Minter => 1,
            Role::Freezer => 2,
            Role::Pauser => 3,
            Role::Burner => 4,
            Role::Blacklister => 5,
            Role::Seizer => 6,
        }
    }
}
```

**Step 2: Update handler_grant match**

In `programs/sss-core/src/instructions/manage_roles.rs:57-63`:

```rust
let role_enum = match role {
    0 => Role::Admin,
    1 => Role::Minter,
    2 => Role::Freezer,
    3 => Role::Pauser,
    4 => Role::Burner,
    5 => Role::Blacklister,
    6 => Role::Seizer,
    _ => return Err(error!(crate::error::SssError::InvalidRole)),
};
```

**Step 3: Update SDK types**

In `sdk/src/types.ts`:

```typescript
export type RoleType = "admin" | "minter" | "freezer" | "pauser" | "burner" | "blacklister" | "seizer";

export const ROLE_MAP: Record<RoleType, number> = {
  admin: 0,
  minter: 1,
  freezer: 2,
  pauser: 3,
  burner: 4,
  blacklister: 5,
  seizer: 6,
};
```

**Step 4: Update CLI role parsing**

In `cli/src/utils.rs`, find the `parse_role` function and add:

```rust
"burner" => Ok(4),
"blacklister" => Ok(5),
"seizer" => Ok(6),
```

Also update `role_name` to handle 4/5/6.

Also update CLI `--role` help text in `main.rs` RoleAction::Grant and Revoke to include new roles:
```
/// Role: "admin", "minter", "freezer", "pauser", "burner", "blacklister", "seizer"
```

**Step 5: Build to verify**

Run: `anchor build`
Expected: Clean build

**Step 6: Commit**

```bash
git add programs/sss-core/src/state/role.rs programs/sss-core/src/instructions/manage_roles.rs sdk/src/types.ts cli/src/utils.rs cli/src/main.rs
git commit -m "feat(program): expand Role enum with Burner, Blacklister, Seizer roles"
```

---

## Task 2: Per-Minter Quotas + update_minter Instruction

**Files:**
- Modify: `programs/sss-core/src/state/role.rs` (add quota fields to RoleAccount)
- Modify: `programs/sss-core/src/constants.rs` (update ROLE_SPACE)
- Modify: `programs/sss-core/src/instructions/mint_tokens.rs` (check quota)
- Create: `programs/sss-core/src/instructions/update_minter.rs`
- Modify: `programs/sss-core/src/instructions/mod.rs` (export new module)
- Modify: `programs/sss-core/src/lib.rs` (add instruction)
- Modify: `programs/sss-core/src/error.rs` (add QuotaExceeded error)

**Step 1: Add quota fields to RoleAccount**

In `programs/sss-core/src/state/role.rs`, add to `RoleAccount`:

```rust
#[account]
pub struct RoleAccount {
    pub config: Pubkey,
    pub address: Pubkey,
    pub role: Role,
    pub granted_by: Pubkey,
    pub granted_at: i64,
    pub bump: u8,
    /// Per-minter quota (only meaningful for Minter role). None = unlimited.
    pub mint_quota: Option<u64>,
    /// Total amount minted by this role holder (only tracked for Minter role).
    pub amount_minted: u64,
}
```

**Step 2: Update ROLE_SPACE**

In `programs/sss-core/src/constants.rs`:

```rust
/// RoleAccount space:
/// discriminator(8) + config(32) + address(32) + role(1)
/// + granted_by(32) + granted_at(8) + bump(1)
/// + mint_quota Option<u64>(1+8) + amount_minted(8) = 131
pub const ROLE_SPACE: usize = 131;
```

**Step 3: Add QuotaExceeded error**

In `programs/sss-core/src/error.rs`, add:

```rust
#[msg("Minter quota exceeded")]
QuotaExceeded,
```

**Step 4: Check quota in mint_tokens**

In `programs/sss-core/src/instructions/mint_tokens.rs`, after the supply cap check and before `config.total_minted` update, add:

```rust
// Per-minter quota check
let minter_role = &mut ctx.accounts.minter_role;
if let Some(quota) = minter_role.mint_quota {
    let new_minted = minter_role.amount_minted
        .checked_add(amount)
        .ok_or(SssError::ArithmeticOverflow)?;
    require!(new_minted <= quota, SssError::QuotaExceeded);
    minter_role.amount_minted = new_minted;
}
```

Also make `minter_role` mutable in the `MintTokens` struct:
```rust
#[account(
    mut,  // <-- ADD mut
    seeds = [
        SSS_ROLE_SEED,
        config.key().as_ref(),
        minter.key().as_ref(),
        &[Role::Minter.as_u8()],
    ],
    bump = minter_role.bump,
)]
pub minter_role: Account<'info, RoleAccount>,
```

**Step 5: Create update_minter instruction**

Create `programs/sss-core/src/instructions/update_minter.rs`:

```rust
use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::SssError;
use crate::events::ConfigUpdated;
use crate::state::{Role, RoleAccount, StablecoinConfig};

#[derive(Accounts)]
pub struct UpdateMinter<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [SSS_CONFIG_SEED, config.mint.as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [
            SSS_ROLE_SEED,
            config.key().as_ref(),
            admin.key().as_ref(),
            &[Role::Admin.as_u8()],
        ],
        bump = admin_role.bump,
    )]
    pub admin_role: Account<'info, RoleAccount>,

    /// The minter's role PDA to update.
    #[account(
        mut,
        constraint = minter_role.config == config.key(),
        constraint = minter_role.role == Role::Minter @ SssError::InvalidRole,
    )]
    pub minter_role: Account<'info, RoleAccount>,
}

pub fn handler_update_minter(
    ctx: Context<UpdateMinter>,
    new_quota: Option<u64>,
) -> Result<()> {
    let minter_role = &mut ctx.accounts.minter_role;
    minter_role.mint_quota = new_quota;

    emit!(ConfigUpdated {
        config: ctx.accounts.config.key(),
        field: format!("minter_quota:{}", minter_role.address),
        updater: ctx.accounts.admin.key(),
    });

    Ok(())
}
```

**Step 6: Wire into mod.rs and lib.rs**

In `programs/sss-core/src/instructions/mod.rs`, add:
```rust
pub mod update_minter;
```
and the pub use.

In `programs/sss-core/src/lib.rs`, add:
```rust
pub fn update_minter(ctx: Context<UpdateMinter>, new_quota: Option<u64>) -> Result<()> {
    instructions::update_minter::handler_update_minter(ctx, new_quota)
}
```

**Step 7: Update handler_grant to initialize quota fields**

In `programs/sss-core/src/instructions/manage_roles.rs`, after setting role_account fields, add:

```rust
role_account.mint_quota = None;
role_account.amount_minted = 0;
```

**Step 8: Build to verify**

Run: `anchor build`
Expected: Clean build

**Step 9: Commit**

```bash
git commit -m "feat(program): add per-minter quotas and update_minter instruction"
```

---

## Task 3: Wire New Roles into Instructions + Update Tests

**Files:**
- Modify: `programs/sss-core/src/instructions/burn_tokens.rs` (Burner role)
- Modify: `programs/sss-core/src/instructions/seize.rs` (Seizer OR Admin)
- Modify: `programs/sss-transfer-hook/src/instructions/add_to_blacklist.rs` (Blacklister OR Admin)
- Modify: `programs/sss-transfer-hook/src/instructions/remove_from_blacklist.rs` (Blacklister OR Admin)
- Modify: `tests/helpers.ts` (add ROLE_BURNER, ROLE_BLACKLISTER, ROLE_SEIZER constants)
- Modify: `tests/sss-1.test.ts` (grant Burner role for burn tests)
- Modify: `tests/sss-2.test.ts` (use Blacklister/Seizer roles)
- Modify: `tests/roles.test.ts` (add tests for new roles)
- Modify: `tests/security.test.ts` (update role checks)

**Step 1: Update burn_tokens.rs to use Burner role**

Change the `BurnTokens` struct's role check from `Role::Minter` to `Role::Burner`:

```rust
/// Burner role PDA — its existence proves authorization.
#[account(
    seeds = [
        SSS_ROLE_SEED,
        config.key().as_ref(),
        burner.key().as_ref(),
        &[Role::Burner.as_u8()],
    ],
    bump = burner_role.bump,
)]
pub burner_role: Account<'info, RoleAccount>,
```

**Step 2: Update seize.rs to accept Seizer OR Admin**

Replace the admin-only check with a remaining_accounts approach, or more simply, add a `seizer_role` field that checks for `Role::Seizer`:

```rust
#[account(
    seeds = [
        SSS_ROLE_SEED,
        config.key().as_ref(),
        admin.key().as_ref(),
        &[Role::Seizer.as_u8()],
    ],
    bump = admin_role.bump,
)]
pub admin_role: Account<'info, RoleAccount>,
```

Rename `admin` to `seizer` and `admin_role` to `seizer_role` throughout seize.rs for clarity.

**Step 3: Update blacklist instructions for Blacklister role**

In `programs/sss-transfer-hook/src/instructions/admin_verify.rs`, add a `verify_blacklister_for_mint` function similar to `verify_admin_for_mint` but checking role byte = 5 (Blacklister).

Update `add_to_blacklist.rs` and `remove_from_blacklist.rs` to call `verify_blacklister_for_mint` instead of `verify_admin_for_mint`. Rename `admin_role` account to `blacklister_role` and `authority` to `blacklister`.

**Step 4: Update test helpers**

In `tests/helpers.ts`, add constants:

```typescript
export const ROLE_BURNER = 4;
export const ROLE_BLACKLISTER = 5;
export const ROLE_SEIZER = 6;
```

**Step 5: Update SSS-1 tests**

In `tests/sss-1.test.ts`:
- Where burn tests grant `ROLE_MINTER` for the burner, change to grant `ROLE_BURNER`
- Derive the burner role PDA with `ROLE_BURNER` constant
- Update any assertions about role type

**Step 6: Update SSS-2 tests**

In `tests/sss-2.test.ts`:
- Blacklist tests: grant `ROLE_BLACKLISTER` instead of using admin
- Seize tests: grant `ROLE_SEIZER` instead of using admin
- Update account names in instruction calls

**Step 7: Update roles tests**

In `tests/roles.test.ts`:
- Add test for granting/revoking Burner, Blacklister, Seizer roles
- Test that Burner can burn but not mint
- Test that Blacklister can manage blacklist but not seize

**Step 8: Update security tests**

In `tests/security.test.ts`:
- Update unauthorized access tests to verify new role boundaries
- Test that Minter cannot burn, Burner cannot mint

**Step 9: Update SDK instruction builders**

In `sdk/src/instructions/core.ts`:
- Update `buildBurnTokensIx` to derive Burner role PDA (role = "burner")
- Update `buildSeizeIx` to derive Seizer role PDA (role = "seizer")

In `sdk/src/instructions/hook.ts`:
- Update `buildAddToBlacklistIx` and `buildRemoveFromBlacklistIx` to derive Blacklister role PDA

In `sdk/src/client.ts`:
- Update `burn()` to use "burner" role
- Update `seize()` to use "seizer" role
- Update `blacklist.add()` and `blacklist.remove()` to use "blacklister" role

**Step 10: Build and test**

```bash
anchor build
anchor test
pnpm test:sdk
```

**Step 11: Commit**

```bash
git commit -m "feat: wire Burner/Blacklister/Seizer roles into instructions and tests"
```

---

## Task 4: Custom Config Support (CLI + SDK)

**Files:**
- Modify: `cli/Cargo.toml` (add `toml` + `serde` dependencies)
- Modify: `cli/src/main.rs` (add `--config` flag to Init)
- Modify: `cli/src/commands/init.rs` (read TOML, map to init params)
- Create: `cli/example-config.toml` (example config file)
- Modify: `sdk/src/types.ts` (add StablecoinCustomOptions)
- Modify: `sdk/src/client.ts` (add SSS.createCustom factory method)
- Create: `sdk/src/presets/custom.ts` (custom mint creation)

**Step 1: Add dependencies to CLI**

In `cli/Cargo.toml`, add:
```toml
toml = "0.8"
serde = { version = "1", features = ["derive"] }
```

**Step 2: Add --config flag to CLI Init**

In `cli/src/main.rs`, modify the `Init` command:

```rust
Init {
    /// Preset tier: "sss-1", "sss-2", "sss-3"
    #[arg(long, required_unless_present = "config")]
    preset: Option<String>,
    /// Path to custom TOML config file
    #[arg(long, conflicts_with = "preset")]
    config: Option<String>,
    /// Token name
    #[arg(long, required_unless_present = "config")]
    name: Option<String>,
    // ... symbol, uri, decimals, supply_cap remain optional
}
```

**Step 3: Create TOML config struct and parsing**

In `cli/src/commands/init.rs`, add:

```rust
use serde::Deserialize;

#[derive(Deserialize)]
struct TomlConfig {
    name: String,
    symbol: String,
    #[serde(default)]
    uri: String,
    #[serde(default = "default_decimals")]
    decimals: u8,
    supply_cap: Option<u64>,
    #[serde(default = "default_true")]
    enable_permanent_delegate: bool,
    #[serde(default)]
    enable_transfer_hook: bool,
    #[serde(default)]
    default_account_frozen: bool,
}

fn default_decimals() -> u8 { 6 }
fn default_true() -> bool { true }
```

Update `execute()` to accept optional config path, read the TOML, infer preset from flags:
- If `enable_transfer_hook` → SSS-2
- Else → SSS-1

**Step 4: Create example config file**

Create `cli/example-config.toml`:

```toml
# SSS Custom Configuration
name = "My Stablecoin"
symbol = "MUSD"
uri = "https://example.com/metadata.json"
decimals = 6
supply_cap = 1000000000

# Token-2022 Extensions
enable_permanent_delegate = true
enable_transfer_hook = false
default_account_frozen = false
```

**Step 5: Add SDK custom options type**

In `sdk/src/types.ts`, add:

```typescript
export interface StablecoinExtensionConfig {
  permanentDelegate?: boolean;
  transferHook?: boolean;
  defaultAccountFrozen?: boolean;
  confidentialTransfer?: boolean;
}

export interface StablecoinCustomOptions {
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  supplyCap?: bigint;
  extensions: StablecoinExtensionConfig;
}
```

**Step 6: Add SSS.createCustom factory method**

In `sdk/src/client.ts`, add:

```typescript
static async createCustom(
    provider: AnchorProvider,
    options: StablecoinCustomOptions,
    mintKeypair?: Keypair,
): Promise<SSS> {
    // Infer preset from extension flags
    const preset: Preset = options.extensions.confidentialTransfer
        ? "sss-3"
        : options.extensions.transferHook
        ? "sss-2"
        : "sss-1";

    return SSS.create(provider, {
        preset,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri,
        decimals: options.decimals,
        supplyCap: options.supplyCap,
    }, mintKeypair);
}
```

**Step 7: Build and verify**

```bash
cargo build --bin sss
pnpm --filter @stbr/sss-token build
```

**Step 8: Commit**

```bash
git commit -m "feat: add custom TOML config support (CLI) and custom extension API (SDK)"
```

---

## Task 5: Backend — Sanctions Screening + Fiat Lifecycle

**Files:**
- Create: `backend/src/services/compliance-provider.ts`
- Modify: `backend/src/routes/operations.ts` (add verification step)
- Modify: `backend/src/routes/compliance.ts` (add sanctions check endpoint)

**Step 1: Create ComplianceProvider interface**

Create `backend/src/services/compliance-provider.ts`:

```typescript
import { logger } from "./logger";

export interface ScreeningResult {
  approved: boolean;
  reason?: string;
  provider: string;
  checkedAt: Date;
}

export interface ComplianceProvider {
  screenAddress(address: string): Promise<ScreeningResult>;
  screenTransaction(params: {
    from?: string;
    to: string;
    amount: string;
    action: "mint" | "burn" | "transfer";
  }): Promise<ScreeningResult>;
}

/**
 * Default no-op provider. Replace with Chainalysis, Elliptic, or TRM Labs
 * integration for production use.
 */
class DefaultComplianceProvider implements ComplianceProvider {
  async screenAddress(address: string): Promise<ScreeningResult> {
    logger.info("Compliance screening (no-op)", { address });
    return {
      approved: true,
      provider: "default",
      checkedAt: new Date(),
    };
  }

  async screenTransaction(params: {
    from?: string;
    to: string;
    amount: string;
    action: "mint" | "burn" | "transfer";
  }): Promise<ScreeningResult> {
    logger.info("Transaction screening (no-op)", params);
    return {
      approved: true,
      provider: "default",
      checkedAt: new Date(),
    };
  }
}

let provider: ComplianceProvider = new DefaultComplianceProvider();

export function setComplianceProvider(p: ComplianceProvider): void {
  provider = p;
}

export function getComplianceProvider(): ComplianceProvider {
  return provider;
}
```

**Step 2: Add verification step to mint/burn routes**

In `backend/src/routes/operations.ts`, update the mint route to follow the fiat lifecycle pattern (request → verify → execute → log):

```typescript
router.post("/mint", async (req: Request, res: Response) => {
  const parsed = mintToSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const { mint, to, amount } = parsed.data;

    // Step 1: REQUEST — validated above via zod schema

    // Step 2: VERIFY — compliance screening
    const compliance = getComplianceProvider();
    const screening = await compliance.screenTransaction({
      to,
      amount,
      action: "mint",
    });
    if (!screening.approved) {
      logger.warn("Mint blocked by compliance", { mint, to, amount, reason: screening.reason });
      res.status(403).json({ error: "Compliance check failed", reason: screening.reason });
      return;
    }

    // Step 3: EXECUTE — on-chain transaction
    const solana = getSolanaService();
    const sss = await solana.loadStablecoin(new PublicKey(mint));
    const signature = await sss.mintTokens(new PublicKey(to), BigInt(amount));

    // Step 4: LOG — structured audit log
    logger.info("Mint operation completed", {
      mint, to, amount, signature,
      compliance: { provider: screening.provider, checkedAt: screening.checkedAt },
    });
    res.json({ success: true, signature, compliance: screening });
  } catch (err) {
    handleRouteError(res, err, "Mint");
  }
});
```

Apply the same pattern to the burn route (screenTransaction with action "burn").

**Step 3: Add sanctions check endpoint**

In `backend/src/routes/compliance.ts`, add:

```typescript
router.get("/screen/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  try {
    new PublicKey(address); // validate
  } catch {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  try {
    const compliance = getComplianceProvider();
    const result = await compliance.screenAddress(address);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Screening failed", { address, error: message });
    res.status(500).json({ error: message });
  }
});
```

**Step 4: Add import for compliance provider**

In `backend/src/routes/operations.ts`, add:
```typescript
import { getComplianceProvider } from "../services/compliance-provider";
```

**Step 5: Build and verify**

```bash
cd backend && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git commit -m "feat(backend): add sanctions screening integration and fiat lifecycle verification"
```

---

## Task 6: Update SDK Exports + Rebuild IDL + Final Tests

**Files:**
- Modify: `sdk/src/index.ts` (export new types)
- Rebuild IDL after program changes
- Copy updated IDL to SDK

**Step 1: Rebuild programs and copy IDL**

```bash
anchor build
cp target/types/sss_core.ts sdk/src/idl/sss_core.ts
cp target/types/sss_transfer_hook.ts sdk/src/idl/sss_transfer_hook.ts
```

**Step 2: Build SDK**

```bash
pnpm --filter @stbr/sss-token build
```

**Step 3: Run integration tests**

```bash
anchor test
```

Fix any test failures caused by the role changes. The main changes:
- Tests that burn tokens need to grant `ROLE_BURNER` (4) instead of `ROLE_MINTER` (1) for the burner account
- Tests that seize need to grant `ROLE_SEIZER` (6)
- Tests that manage blacklist need to grant `ROLE_BLACKLISTER` (5)

**Step 4: Run SDK tests**

```bash
pnpm test:sdk
```

**Step 5: Run Rust tests**

```bash
cargo test --workspace
```

**Step 6: Update docs**

Update `docs/CLI.md` to mention `--config` flag on init and new role names.
Update `docs/SDK.md` to mention `SSS.createCustom()` and new role types.
Update `docs/API.md` to add `GET /compliance/screen/:address` endpoint.
Update `README.md` preset comparison table if needed.

**Step 7: Final commit**

```bash
git commit -m "chore: rebuild IDL, update docs, fix tests for expanded role system"
```

---

## Summary of Changes

| Gap | Fix | Files |
|-----|-----|-------|
| Per-minter quotas | `mint_quota` + `amount_minted` on RoleAccount, checked in `mint_tokens` | role.rs, constants.rs, mint_tokens.rs |
| Burner role | `Role::Burner` (4), used in `burn_tokens.rs` | role.rs, burn_tokens.rs, SDK, tests |
| Blacklister role | `Role::Blacklister` (5), used in blacklist instructions | role.rs, add/remove_from_blacklist.rs, SDK, tests |
| Seizer role | `Role::Seizer` (6), used in `seize.rs` | role.rs, seize.rs, SDK, tests |
| update_minter | New instruction to set per-minter quota | update_minter.rs, lib.rs |
| Custom config CLI | `--config config.toml` flag on init | main.rs, init.rs, Cargo.toml |
| Custom config SDK | `SSS.createCustom()` with extension flags | types.ts, client.ts |
| Sanctions screening | `ComplianceProvider` interface + fiat lifecycle | compliance-provider.ts, operations.ts |

**Risk notes:**
- ROLE_SPACE changes from 114 → 131 bytes. All existing role PDAs in tests are ephemeral (local validator), so no migration needed.
- Role enum expansion preserves existing numbering (0-3 unchanged, 4-6 added).
- Burn instruction role change from Minter→Burner requires updating all burn-related tests.
- The blacklist instruction changes are in `sss-transfer-hook`, not `sss-core` — need to update that program's admin_verify module.
