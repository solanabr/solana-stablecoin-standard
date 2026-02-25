# Architecture

## Layer Model

The system is organized into four layers, each depending only on the layer below it.

```
Service Layer      Operator scripts, custodial backends, wallets
     |
CLI Layer          sss-token CLI (Commander.js, TypeScript)
     |
SDK Layer          @stbr/sss-sdk (TypeScript, Anchor client)
     |
Program Layer      sss-token + transfer-hook (Rust, Anchor, SBF)
```

**Program layer** — two on-chain programs. `sss-token` owns all business logic: mint creation, role management, compliance, and authority control. `transfer-hook` is a stateless validator invoked by Token-2022 on every transfer.

**SDK layer** — `SolanaStablecoin` and `ComplianceModule` classes wrap Anchor RPC calls, derive PDAs, and present a typed API. Program IDs and preset constants are centralized in `presets.ts`.

**CLI layer** — thin Commander.js shell over the SDK. Reads a keypair from disk, resolves the mint from `--mint` or `.sss-config.json`, calls an SDK method, and prints the result.

**Service layer** — external systems that call the CLI or SDK. Not part of this repository.

---

## SSS-1 vs SSS-2 Extension Sets

Both presets use the Token-2022 program. The preset is selected at `initialize` and cannot be changed after deployment.

| Extension | SSS-1 | SSS-2 |
|---|---|---|
| `MintCloseAuthority` | no | no |
| `PermanentDelegate` | no | yes — set to the `sss-token` program PDA |
| `TransferHook` | no | yes — points to `transfer-hook` program |
| `DefaultAccountState(Frozen)` | no | yes — every new token account starts frozen |
| `MetadataPointer` | yes | yes |

**SSS-2 implications:**

- All new token accounts are frozen by default. Recipients must be thawed before their first transfer.
- Every transfer invokes the `transfer-hook` program. If either the sender or recipient wallet has a live `BlacklistEntry` PDA, the transfer is rejected.
- The permanent delegate is set to the `sss-token` program's config PDA. This allows the `seize` instruction to transfer tokens without the token owner's signature.

---

## State Accounts

### StablecoinConfig

Primary configuration account. One per mint.

Seeds: `["stablecoin", mint]` — owned by `sss-token`.

| Field | Type | Description |
|---|---|---|
| `authority` | `Pubkey` | Master authority; only this key can call privileged instructions |
| `mint` | `Pubkey` | The Token-2022 mint this config governs |
| `name` | `String` | Human-readable token name (max 32 chars) |
| `symbol` | `String` | Token symbol (max 10 chars) |
| `uri` | `String` | Metadata URI (max 200 chars) |
| `decimals` | `u8` | Decimal places |
| `enable_permanent_delegate` | `bool` | True if SSS-2 preset |
| `enable_transfer_hook` | `bool` | True if SSS-2 preset |
| `enable_default_frozen` | `bool` | True if SSS-2 preset |
| `paused` | `bool` | Global pause flag; blocks mint, burn, and transfer |
| `total_minted` | `u64` | Cumulative tokens minted across all minters |
| `total_burned` | `u64` | Cumulative tokens burned |
| `bump` | `u8` | PDA bump seed |
| `_reserved` | `[u8; 64]` | Reserved for future fields |

### RoleManager

Stores the member lists for each operational role. One per stablecoin.

Seeds: `["roles", stablecoin_config]` — owned by `sss-token`.

| Field | Type | Description |
|---|---|---|
| `stablecoin` | `Pubkey` | Back-reference to the StablecoinConfig PDA |
| `minters` | `Vec<Pubkey>` | Addresses with Minter role |
| `burners` | `Vec<Pubkey>` | Addresses with Burner role |
| `pausers` | `Vec<Pubkey>` | Addresses with Pauser role |
| `blacklisters` | `Vec<Pubkey>` | Addresses with Blacklister role (SSS-2) |
| `seizers` | `Vec<Pubkey>` | Addresses with Seizer role (SSS-2) |
| `bump` | `u8` | PDA bump seed |

Each vec has a fixed capacity set in `constants.rs`. Attempting to add beyond the limit returns `RoleCapacityReached`.

### MinterInfo

Per-minter quota tracker. Created by `add_minter`, one per (config, minter) pair.

Seeds: `["minter", stablecoin_config, minter]` — owned by `sss-token`.

| Field | Type | Description |
|---|---|---|
| `minter` | `Pubkey` | The minter's wallet address |
| `stablecoin` | `Pubkey` | Back-reference to the StablecoinConfig PDA |
| `quota` | `u64` | Maximum tokens this minter may mint; 0 = unlimited |
| `minted` | `u64` | Running total minted by this minter |
| `bump` | `u8` | PDA bump seed |

### BlacklistEntry

Presence-checked PDA. Exists when an address is blacklisted; closing it removes the entry.

Seeds: `["blacklist", mint, address]` — owned by `sss-token`.

| Field | Type | Description |
|---|---|---|
| `address` | `Pubkey` | The blacklisted wallet |
| `stablecoin` | `Pubkey` | The mint this entry applies to |
| `reason` | `String` | Human-readable reason (max 64 chars) |
| `blacklisted_at` | `i64` | Unix timestamp |
| `blacklisted_by` | `Pubkey` | Blacklister who created this entry |
| `bump` | `u8` | PDA bump seed |

---

## Role-Based Access Control

The `authority` field in `StablecoinConfig` is the master key. It has unrestricted access to all instructions. Delegated roles are stored in `RoleManager`.

| Role | Granted by | Can call |
|---|---|---|
| **Authority** | Initial deployer; transferable via `transfer_authority` | All instructions |
| **Minter** | Authority via `add_minter` | `mint_tokens` |
| **Burner** | Authority via `add_role(Burner, ...)` | `burn_tokens` |
| **Pauser** | Authority via `add_role(Pauser, ...)` | `pause`, `unpause`, `freeze_account`, `thaw_account` |
| **Blacklister** | Authority via `add_role(Blacklister, ...)` | `add_to_blacklist`, `remove_from_blacklist` (SSS-2 only) |
| **Seizer** | Authority via `add_role(Seizer, ...)` | `seize` (SSS-2 only) |

Minters are managed separately from other roles because they require a `MinterInfo` PDA for quota tracking. Calling `add_role(Minter, ...)` returns `UseDedicatedAddMinter`.

---

## Transfer Hook Execution Flow

For SSS-2 tokens, Token-2022 calls the `transfer-hook` program synchronously during every transfer instruction. The flow is:

1. Caller submits a Token-2022 transfer instruction.
2. Token-2022 reads the `TransferHook` extension on the mint and resolves the hook program ID.
3. Token-2022 fetches the `ExtraAccountMetaList` PDA (seeds: `["extra-account-metas", mint]`, owned by `transfer-hook`) and appends its accounts to the instruction.
4. Token-2022 invokes `transfer-hook` using the SPL Transfer Hook Interface discriminator `[105, 37, 101, 197, 75, 251, 102, 26]`.
5. The hook's `fallback` handler receives eight accounts:
   - `[0]` source token account
   - `[1]` mint
   - `[2]` destination token account
   - `[3]` source authority (wallet or permanent delegate)
   - `[4]` ExtraAccountMetaList PDA
   - `[5]` `sss-token` program (from ExtraAccountMetaList)
   - `[6]` sender BlacklistEntry PDA
   - `[7]` recipient BlacklistEntry PDA
6. The hook derives the expected PDA addresses for sender and recipient and verifies the passed accounts match.
7. If either `BlacklistEntry` account has non-zero lamports (i.e., the account exists), the hook returns `SenderBlacklisted` or `RecipientBlacklisted` and the transfer fails.
8. If both accounts have zero lamports (accounts do not exist), the hook returns `Ok` and Token-2022 completes the transfer.

The hook reads the destination account owner from the raw account data at byte offset 32 (Token-2022 token account layout: `[mint(32) | owner(32) | ...]`).

---

## Seize Instruction Flow

`seize` transfers tokens from a frozen account to a treasury without requiring the token owner's signature. It is available only on SSS-2 tokens.

1. The caller (must hold the Seizer role) submits the `seize` instruction with the source token account, destination token account, and amount.
2. The program verifies:
   - The stablecoin has `enable_permanent_delegate = true`.
   - The caller is listed in `RoleManager.seizers`.
   - The source token account is frozen (`AccountNotFrozen` if not).
   - The stablecoin is not globally paused.
3. The program calls `spl_token_2022::onchain::invoke_transfer_checked` using the config PDA as the permanent delegate signer. This function automatically appends the extra account metas required by the transfer hook so Token-2022 can invoke the hook correctly.
4. The transfer hook runs and checks blacklist PDAs as described above.
5. On success, a `TokensSeized` event is emitted.

The source account is **not** automatically re-frozen after seizure. Callers should issue a `freeze_account` instruction afterward if the account should remain frozen.

---

## Security Model

**Authority key custody** — the `authority` address is the single root of trust. It should be a hardware wallet or multisig. `transfer_authority` is irreversible without the new authority's cooperation.

**Quota enforcement** — each minter's `MinterInfo.minted` counter is incremented atomically on-chain. A quota of 0 means unlimited. Once the quota is reached, `mint_tokens` returns `QuotaExceeded`.

**Pause circuit breaker** — the `paused` flag on `StablecoinConfig` blocks `mint_tokens` and `burn_tokens` at the program level. Transfers are not blocked by the pause flag directly, but freezing all accounts (or relying on DefaultAccountState) achieves a full halt for SSS-2.

**Blacklist atomicity** — the transfer hook check is performed inside the same atomic Token-2022 transfer instruction. There is no window between the check and the token movement.

**Seizure requires freeze** — the program enforces that the source account is frozen before seizure proceeds. This provides an audit trail: a separate freeze transaction must appear on-chain before the seize transaction.

**No upgrade authority** — programs should be deployed with upgrade authority revoked for production use. This repository does not automate that step; it is an operator responsibility documented in the [Operations Runbook](OPERATIONS.md).
