# Security Policy

## Security Contact

If you discover a vulnerability in the Solana Stablecoin Standard, please report it responsibly.

- **Email:** security@[project-domain] *(replace with your actual security contact)*
- **Disclosure:** Do not open public issues for security vulnerabilities. Use private disclosure only.
- **Response time:** We aim to acknowledge reports within 48 hours and provide a remediation timeline within 7 days.

If the vulnerability is critical (e.g., unauthorized minting, authority bypass), include "CRITICAL" in the subject line.

---

## Threat Model

### Actors

| Actor | Trust Level | Capabilities |
|---|---|---|
| **Authority** | Highest | Update roles, transfer authority, seize tokens (SSS-2) |
| **Master Minter** | High | Configure minters, set quotas, remove minters |
| **Pauser** | Medium | Pause and unpause all operations |
| **Blacklister** | Medium | Add/remove wallets from the blacklist (SSS-2 only) |
| **Minter** | Low | Mint tokens up to assigned quota |
| **Token Holder** | None (public) | Transfer and burn tokens |
| **External Attacker** | Adversarial | No valid keys; attempts to exploit program logic |

### Attacks Considered

- Unauthorized minting or infinite mint exploits
- Bypassing pause state to execute transfers
- Transferring tokens to or from blacklisted accounts
- Escalating privileges across roles
- Bricking the deployment by setting roles to unreachable addresses
- Exploiting arithmetic overflow to corrupt state
- Direct invocation of the transfer hook outside a genuine transfer
- Cross-mint confusion (using one stablecoin's config against another's mint)

---

## Architecture Security

### PDA Authority Model

The mint authority is a **Program Derived Address (PDA)** seeded with `[b"mint-authority", mint.key().as_ref()]`. No private key exists for this address. Only the sss-core program can sign CPI calls on its behalf, which means:

- Minting requires a CPI through `sss-core`, enforcing quota and pause checks before the `mint_to` instruction is signed.
- Seizing (SSS-2) uses the same PDA as a permanent delegate, executing `transfer_checked` via `invoke_signed`.
- No external entity can independently mint or transfer tokens as the mint authority.

### CPI Usage

- **Minting:** `sss-core` validates the minter's quota and pause state, then signs a `mint_to` CPI to Token-2022.
- **Burning:** The token holder signs directly; `sss-core` updates its audit counters (`total_burned`) after the Token-2022 `burn` CPI.
- **Seizing:** The authority initiates; `sss-core` builds a `transfer_checked` instruction with remaining accounts for the transfer hook, then calls `invoke_signed` with the mint authority PDA seeds.
- **Transfer Hook:** Token-2022 invokes `sss-hook` during every `transfer_checked`. The hook reads the core program's `StablecoinConfig` account cross-program (by deserialization, not CPI) to check pause state.

### Account Validation

All PDA accounts are validated by Anchor seed constraints. The config PDA is seeded with the mint pubkey, binding each config to exactly one mint. Minter state PDAs are seeded with both the config key and minter wallet, preventing cross-minter and cross-mint confusion.

---

## Access Control

### Four-Role Model

The access control model follows the Circle USDC pattern with four distinct roles stored in `StablecoinConfig`:

| Role | Field | Permissions |
|---|---|---|
| **Authority** | `authority` | Update roles (`update_role`), initiate authority transfer, seize tokens (SSS-2) |
| **Master Minter** | `master_minter` | Configure minters, set quotas, remove minters |
| **Pauser** | `pauser` | Pause / unpause operations |
| **Blacklister** | `blacklister` | Manage the blacklist (SSS-2 only) |

Each instruction validates the signer against the corresponding role field. For example, `mint` validates the minter's PDA state (which was configured by the master minter), while `seize` requires `authority.key() == config.authority`.

### Role Separation

No instruction accepts multiple role fields as valid signers. Each operation is gated by exactly one role. The authority can reassign the other three roles via `update_role`, but cannot directly perform their functions (e.g., the authority cannot pause unless it is also assigned as the pauser).

### Two-Step Authority Transfer

Authority transfer is a two-step process to prevent accidental or malicious transfers to unreachable addresses:

1. **`transfer_authority`** — The current authority sets `pending_authority` to the new address.
2. **`accept_authority`** — The pending authority signs a transaction to accept. On success, `authority` is updated and `pending_authority` is reset to `Pubkey::default()`.

Both steps reject the zero address (`Pubkey::default()`), preventing the authority from being permanently bricked.

---

## Invariants

### Quota Irreversibility

`MinterState.minted_amount` only increases. Burning tokens does **not** reduce `minted_amount`. Disabling and re-enabling a minter does **not** reset `minted_amount`. This prevents infinite mint loops where a minter could mint, burn, and mint again to exceed their intended quota.

### Supply Conservation

For any mint: `total_minted - total_burned` equals the on-chain token supply (excluding seized amounts, which are transfers, not creation/destruction). Both counters use `checked_add` and can only increase.

### Pause Enforcement

- **Core program:** `mint` and `burn` instructions include an Anchor constraint `!config.paused`, rejecting transactions when paused.
- **Hook program:** The `check_paused` function reads the `StablecoinConfig` account and blocks transfers if `paused == true`.
- Combined, pausing halts minting, burning, and transferring.

### Fail-Closed Hook

The transfer hook uses a fail-closed design for the pause check:

- If the `StablecoinConfig` account is missing (empty data) &rarr; transfer blocked.
- If the account data is too short (`< 8 bytes`) &rarr; transfer blocked.
- If the Anchor discriminator does not match `StablecoinConfig` &rarr; transfer blocked.
- If deserialization fails &rarr; transfer blocked.

A misconfigured deployment blocks all transfers rather than allowing unchecked ones.

---

## Attack Vectors Considered

### 1. Infinite Mint via Quota Reset

**Attack:** A minter mints up to quota, burns the tokens, then mints again.

**Mitigation:** `minted_amount` is monotonically increasing and is never decremented. The remaining quota is computed as `quota - minted_amount` using `checked_sub`. Burning does not alter `minted_amount`, so the minter cannot reclaim consumed quota.

### 2. Unauthorized Minting

**Attack:** An arbitrary signer calls `mint` without being a configured minter.

**Mitigation:** The `MinterState` PDA is derived from `[b"minter", config.key(), minter.key()]`. Anchor's seed constraint ensures only the matching signer can use a given `MinterState`. The PDA must also have `enabled == true` and `config == config.key()`. The `mint_to` CPI is signed by the mint authority PDA, which only `sss-core` can produce.

### 3. Transfer to Blacklisted Account

**Attack:** A blacklisted wallet receives tokens via a normal transfer.

**Mitigation:** The transfer hook checks blacklist entries for **both** the source and destination owners. Blacklist PDAs are derived from `[b"blacklist", mint.key(), wallet.key()]`. If either is blacklisted, the hook returns `HookError::Blacklisted`, causing the Token-2022 `transfer_checked` to fail.

### 4. Pause Bypass

**Attack:** Transferring tokens while the contract is paused, bypassing core program checks.

**Mitigation:** The transfer hook independently reads the `StablecoinConfig` and checks `paused`. Even if a transfer is initiated outside `sss-core`, Token-2022 will invoke the hook, which enforces the pause. The fail-closed design means a missing or malformed config also blocks transfers.

### 5. Authority Bricking

**Attack:** Setting a role or authority to `Pubkey::default()` (the zero address), permanently locking out that function.

**Mitigation:** Both `update_role` and `transfer_authority` include an explicit guard: `require!(new_address != Pubkey::default(), SSSError::InvalidAuthority)`. The two-step authority transfer adds a second layer: the pending authority must sign `accept_authority`, proving the target address is reachable.

### 6. Cross-Mint Attacks

**Attack:** Using one stablecoin's config or minter state to operate on a different mint.

**Mitigation:** PDA seeds include the mint pubkey at every level:
- Config: `[b"config", mint.key()]`
- Mint authority: `[b"mint-authority", mint.key()]`
- Minter state: `[b"minter", config.key(), minter.key()]` (config is itself mint-scoped)
- Hook config: `[b"hook-config", mint.key()]`
- Blacklist entry: `[b"blacklist", mint.key(), wallet.key()]`

Anchor's seed constraints ensure cross-mint substitution fails PDA derivation.

### 7. Arithmetic Overflow

**Attack:** Crafting amounts that cause `u64` overflow, corrupting `minted_amount`, `total_minted`, `total_burned`, or `total_seized`.

**Mitigation:** All arithmetic on these counters uses `checked_add` or `checked_sub`, returning `SSSError::ArithmeticOverflow` on overflow instead of wrapping. There is no use of unchecked arithmetic on security-critical counters.

### 8. Direct Hook Invocation

**Attack:** Calling the transfer hook's `execute` instruction directly (not via Token-2022's `transfer_checked`) to manipulate state.

**Mitigation:** The hook's `check_is_transferring` function reads the `TransferHookAccount` extension from the source token account and verifies that the `transferring` flag is set. This flag is only set by the Token-2022 program during a genuine `transfer_checked` call. Direct invocation fails with `HookError::IsNotCurrentlyTransferring`.

### 9. Stale Pending Authority

**Attack:** A previously set `pending_authority` accepts the transfer long after it was initiated, even if the authority's intent has changed.

**Mitigation (partial):** This is a documented design decision. There is **no timeout** on `pending_authority`. The current authority can overwrite the pending authority at any time by calling `transfer_authority` again with a different address (or any non-zero address to effectively cancel). However, there is no explicit "cancel pending transfer" instruction. See [Known Limitations](#known-limitations).

---

## Fuzz Testing

The project includes two Trident-based fuzzers under `trident-tests/`:

### fuzz_0 — Single-Minter Core Flow

Fuzzes the basic lifecycle (initialize, configure minter, mint, burn, pause/unpause) and verifies:
- Minted amount never exceeds quota.
- Burned tokens are tracked correctly.
- Pause state is enforced.

### fuzz_1 — Multi-User Chaos Fuzzer

Exercises concurrent multi-user interactions with randomized operation sequences. Verifies the following invariants across thousands of iterations:

| Invariant | Description |
|---|---|
| **Quota isolation** | Each minter's `minted_amount` is independent; one minter's activity never affects another's quota. |
| **Supply conservation** | `sum(all mints) - sum(all burns) == on-chain supply` at every checkpoint. |
| **Role enforcement after update** | After `update_role`, the old role holder loses access and the new holder gains it. |
| **Authority transfer correctness** | Transfer is two-step; `pending_authority` must sign; old authority loses power after acceptance. |
| **Remove/re-enable persistence** | Disabling a minter preserves `minted_amount`; re-enabling does not reset the counter. |
| **Unauthorized access rejection** | Random signers cannot execute privileged operations. |

---

## Audit Status

| Item | Status |
|---|---|
| Internal code review | Complete |
| Fuzz testing (Trident) | 2 fuzzers, covering single-minter and multi-user flows |
| External security audit | **Not yet performed** |
| Formal verification | Not performed |
| Bug bounty program | Not yet established |

This project has not undergone an independent third-party security audit. It should not be used in production with real funds until a professional audit has been completed.

---

## Known Limitations

### No Pending Authority Timeout

The `pending_authority` field has no expiration. Once set, it remains valid until:
- The pending authority calls `accept_authority`, or
- The current authority overwrites it with a new `transfer_authority` call.

There is no dedicated "cancel pending transfer" instruction. The workaround is to call `transfer_authority` with a different (non-zero) address.

### 64-Character Reason Limit

The `BlacklistEntry.reason` field is capped at 64 characters (`#[max_len(64)]`). Longer reasons are rejected with `HookError::ReasonTooLong`. This is a fixed limit set at account initialization and cannot be changed without redeploying.

### Fixed Account Sizes

All accounts use `#[derive(InitSpace)]` with fixed-size fields. Account schemas cannot be extended after deployment without migration. Adding new fields to `StablecoinConfig`, `MinterState`, `HookConfig`, or `BlacklistEntry` would require a program upgrade and data migration strategy.
