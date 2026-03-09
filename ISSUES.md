# SSS-SDK — Complete GitHub Issues List
> Fine-grained, sequenced, GitHub-ready. Each issue is one atomic unit of work for an AI agent or developer.
> Issues are numbered and ordered by execution sequence. Dependencies are listed per issue.

---

## EPIC 1 — Repository & Monorepo Setup

---

### Issue #1 — Initialize monorepo with pnpm workspaces and Anchor scaffold

**Labels:** `epic:setup` `component:config`
**Depends on:** nothing — start here

#### Description
Set up the root repository structure as a pnpm monorepo with Anchor initialized. This is the foundation every other issue builds on. The repo must match the directory layout defined in `PRD.md` Section 13.1 and `AGENTS.md` Section 5.5 exactly.

#### Acceptance Criteria
- [ ] `pnpm-workspace.yaml` defines packages: `sdk`, `cli`, `services/indexer`, `services/compliance-api`, `services/mint-coordinator`
- [ ] Root `package.json` includes workspace scripts: `build`, `test`, `lint`, `format`
- [ ] `Anchor.toml` is initialized with two program entries: `sss-base` and `sss-compliance`
- [ ] `Cargo.toml` workspace root declares both programs as members
- [ ] `.gitignore` covers: `target/`, `node_modules/`, `.env`, `keypairs/`, `*.json` keypair files, `test-ledger/`
- [ ] `.env.example` contains all required env vars: `SOLANA_NETWORK`, `RPC_URL`, `OPERATOR_KEYPAIR_PATH`, `COMPLIANCE_OFFICER_KEYPAIR_PATH`, `PERMANENT_DELEGATE_KEYPAIR_PATH`, `COMPLIANCE_API_KEY`
- [ ] `programs/sss-base/src/lib.rs` exists with placeholder `declare_id!` and empty program module
- [ ] `programs/sss-compliance/src/lib.rs` exists with placeholder `declare_id!` and empty program module
- [ ] `anchor build` runs without errors (programs may be empty stubs)
- [ ] Directory tree matches the structure in `PRD.md` Section 13.1

---

### Issue #2 — Configure TypeScript SDK package scaffold

**Labels:** `epic:setup` `component:sdk`
**Depends on:** #1

#### Description
Initialize the `sdk/` package with TypeScript, ESM/CJS dual build, and all required dev dependencies. No business logic yet — this issue is purely scaffold and config.

#### Acceptance Criteria
- [ ] `sdk/package.json` with name `@sss-sdk/core`, `"type": "module"`, build scripts
- [ ] `sdk/tsconfig.json` with `"strict": true`, `"declaration": true`, `"outDir": "dist"`
- [ ] `sdk/src/index.ts` exists as empty barrel export file
- [ ] `sdk/src/types.ts` exists as empty file (types to be added per issue)
- [ ] `sdk/src/constants.ts` exists with placeholder program ID constants (all `SystemProgram.programId` until deployment)
- [ ] `sdk/src/errors.ts` exists with base `SSSError` class: `{ code: string; message: string }`
- [ ] `jest.config.ts` configured with `ts-jest` preset
- [ ] `eslint` and `prettier` configs present and passing on empty files
- [ ] `pnpm build` in `sdk/` runs `tsc --noEmit` successfully

---

### Issue #3 — Configure CLI package scaffold

**Labels:** `epic:setup` `component:cli`
**Depends on:** #1

#### Description
Initialize the `cli/` package with Commander.js, TypeScript, and the entry point. No commands implemented yet.

#### Acceptance Criteria
- [ ] `cli/package.json` with name `@sss-sdk/cli`, `"bin": { "sss": "dist/index.js" }`, build scripts
- [ ] `cli/tsconfig.json` with strict mode
- [ ] `cli/src/index.ts` creates root Commander.js program with name `sss`, version, and description
- [ ] Global options registered on root command: `--network`, `--keypair`, `--mint`, `--json`, `--verbose` (as defined in `PRD.md` Section 10.1)
- [ ] `cli/src/utils/connection.ts` — helper that creates a `Connection` from `--network` flag or `SOLANA_NETWORK` env var
- [ ] `cli/src/utils/keypair.ts` — helper that loads a `Keypair` from a file path flag or env var
- [ ] `cli/src/utils/output.ts` — helper that prints formatted table (default) or raw JSON (`--json` flag)
- [ ] `dotenv` loaded at CLI entry point
- [ ] `sss --help` prints usage without error after `pnpm build`

---

---

## EPIC 2 — `sss-base` Anchor Program

---

### Issue #4 — Implement `MintConfig` PDA account struct and errors

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #1

#### Description
Define the `MintConfig` PDA state account and all error codes for the `sss-base` program. This is the foundational state that all `sss-base` instructions read and write. No instructions yet.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/state/mint_config.rs` defines `MintConfig` struct exactly as in `PRD.md` Section 8.2:
  - Fields: `mint: Pubkey`, `standard: u8`, `max_supply: Option<u64>`, `mint_cooldown: Option<i64>`, `last_mint_timestamp: i64`, `bump: u8`
  - Derives: `#[account]`, `InitSpace`
- [ ] `programs/sss-base/src/errors.rs` defines `SSSBaseError` with all 5 codes from `PRD.md` Section 8.4:
  - `NotMintAuthority`, `NotFreezeAuthority`, `MaxSupplyExceeded`, `MintCooldownActive`, `AuthorityRevoked`
  - Each variant has the exact `#[msg("...")]` string from the PRD
- [ ] `programs/sss-base/src/events.rs` defines all 4 events from `PRD.md` Section 8.5:
  - `MintEvent`, `BurnEvent`, `FreezeEvent`, `ThawEvent` — each with exact fields and `#[event]` attribute
- [ ] All types are re-exported from `programs/sss-base/src/lib.rs`
- [ ] `cargo build-bpf` passes with no warnings

---

### Issue #5 — Implement `create_mint` instruction (SSS-1)

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #4

#### Description
Implement the `create_mint` instruction for SSS-1. This creates a Token-2022 mint with `MintCloseAuthority`, `MetadataPointer`, and `TokenMetadata` extensions, and initializes the `MintConfig` PDA. This is the most complex instruction in the base program.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/instructions/create_mint.rs` implemented
- [ ] `CreateMintSSS1` accounts context matches `PRD.md` Section 8.3 exactly:
  - `payer: Signer`, `mint: Box<InterfaceAccount<Mint>>`, `mint_authority`, `freeze_authority`, `update_authority` as `AccountInfo`, `mint_config` PDA, `token_program: Token2022`, `system_program`
- [ ] Token-2022 extensions initialized in correct order: `MintCloseAuthority` → `MetadataPointer` → `TokenMetadata`
- [ ] `MintConfig` PDA initialized with seed `["mint_config", mint.key()]`, `standard = 1`, `bump` stored
- [ ] Instruction accepts parameters: `decimals: u8`, `name: String`, `symbol: String`, `uri: String`, `max_supply: Option<u64>`, `mint_cooldown: Option<i64>`
- [ ] `max_supply` and `mint_cooldown` stored in `MintConfig` if provided
- [ ] `cargo build-bpf` passes, `cargo clippy -- -D warnings` clean

---

### Issue #6 — Implement `mint_tokens` instruction

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #5

#### Description
Implement the `mint_tokens` instruction. Must validate mint authority, enforce `max_supply`, enforce `mint_cooldown`, auto-handle ATA creation, and emit `MintEvent`.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/instructions/mint_tokens.rs` implemented
- [ ] Accounts context: `payer`, `mint_authority: Signer`, `mint`, `destination` (ATA, init_if_needed), `mint_config`, `token_program`, `associated_token_program`, `system_program`
- [ ] Authority check: signer must match `mint.mint_authority` — return `NotMintAuthority` if not
- [ ] Max supply check: if `mint_config.max_supply` is `Some(cap)`, assert `current_supply + amount <= cap` — return `MaxSupplyExceeded` if exceeded
- [ ] Cooldown check: if `mint_config.mint_cooldown` is `Some(seconds)`, assert `now >= last_mint_timestamp + seconds` — return `MintCooldownActive` if not elapsed
- [ ] `mint_config.last_mint_timestamp` updated to `Clock::get()?.unix_timestamp` after successful mint
- [ ] `emit!(MintEvent { mint, destination, amount, authority, timestamp })` on success
- [ ] Uses `checked_add` for all arithmetic
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #7 — Implement `burn_tokens` instruction

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #5

#### Description
Implement `burn_tokens`. The caller must be either the token account owner or the permanent delegate. Emits `BurnEvent`.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/instructions/burn_tokens.rs` implemented
- [ ] Accounts context: `authority: Signer`, `mint`, `source` (token account), `mint_config`, `token_program`
- [ ] Authority validation: signer is either token account owner OR permanent delegate (read from mint extension)
- [ ] Amount uses Token-2022 `burn` CPI
- [ ] `emit!(BurnEvent { mint, source, amount, authority, timestamp })` on success
- [ ] Negative: non-owner non-delegate caller → returns appropriate error
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #8 — Implement `freeze_account` instruction

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #5

#### Description
Implement `freeze_account`. Must validate freeze authority and emit `FreezeEvent`.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/instructions/freeze_account.rs` implemented
- [ ] Accounts context: `freeze_authority: Signer`, `mint`, `token_account`, `token_program`
- [ ] Authority check: signer must match `mint.freeze_authority` — return `NotFreezeAuthority` if not
- [ ] Issues Token-2022 `freeze_account` CPI
- [ ] `emit!(FreezeEvent { mint, account, authority, timestamp })` on success
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #9 — Implement `thaw_account` instruction

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #8

#### Description
Implement `thaw_account`. Mirror of `freeze_account`. Must validate freeze authority and emit `ThawEvent`.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/instructions/thaw_account.rs` implemented
- [ ] Accounts context: `freeze_authority: Signer`, `mint`, `token_account`, `token_program`
- [ ] Authority check: signer must match `mint.freeze_authority` — return `NotFreezeAuthority` if not
- [ ] Issues Token-2022 `thaw_account` CPI
- [ ] `emit!(ThawEvent { mint, account, authority, timestamp })` on success
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #10 — Implement `update_metadata` instruction

**Labels:** `epic:anchor-base` `component:anchor`
**Depends on:** #5

#### Description
Implement `update_metadata`. Allows the update authority to change the token metadata URI and additional metadata fields via the Token-2022 metadata extension.

#### Acceptance Criteria
- [ ] `programs/sss-base/src/instructions/update_metadata.rs` implemented
- [ ] Accounts context: `update_authority: Signer`, `mint`, `token_program`
- [ ] Parameters: `new_uri: Option<String>`, `additional_metadata: Option<Vec<(String, String)>>`
- [ ] Authority check: signer must match mint's `metadata.update_authority` — return `AuthorityRevoked` if revoked
- [ ] Issues Token-2022 metadata update CPI for URI if `new_uri` provided
- [ ] Issues Token-2022 metadata update CPI for each additional metadata field if provided
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #11 — Write Anchor tests for `sss-base` program

**Labels:** `epic:anchor-base` `component:tests`
**Depends on:** #6, #7, #8, #9, #10

#### Description
Write the full Anchor test suite for `sss-base`. Must achieve ≥ 80% instruction coverage. All negative tests for every error code are required.

#### Acceptance Criteria
- [ ] `tests/anchor/sss-base.ts` (or `.rs`) test file created
- [ ] `create_mint` — valid SSS-1 creation: assert mint account exists on-chain, `MintConfig` PDA initialized with correct fields
- [ ] `mint_tokens` — valid mint to new wallet: assert supply increased by minted amount, `MintEvent` emitted
- [ ] `mint_tokens` — called by non-authority keypair → expect `NotMintAuthority`
- [ ] `mint_tokens` — amount exceeds `max_supply` → expect `MaxSupplyExceeded`
- [ ] `mint_tokens` — called within cooldown window → expect `MintCooldownActive`
- [ ] `burn_tokens` — valid burn by token owner: assert supply decreased, `BurnEvent` emitted
- [ ] `freeze_account` — valid freeze: assert account state is frozen, `FreezeEvent` emitted
- [ ] `freeze_account` — called by non-freeze-authority → expect `NotFreezeAuthority`
- [ ] `thaw_account` — valid thaw on frozen account: assert account no longer frozen, `ThawEvent` emitted
- [ ] `update_metadata` — valid URI update: assert metadata URI updated on-chain
- [ ] SSS-1 end-to-end test: deploy → mint 1000 → transfer → freeze → attempt burn (expect error) → thaw → burn 500 → assert supply = 500
- [ ] `anchor test` passes with all tests green

---

---

## EPIC 3 — `sss-compliance` Anchor Program

---

### Issue #12 — Implement `BlacklistRegistry` and `BlacklistEntry` state + compliance errors

**Labels:** `epic:anchor-compliance` `component:anchor`
**Depends on:** #1

#### Description
Define all state accounts and error codes for the `sss-compliance` program. No instructions yet.

#### Acceptance Criteria
- [ ] `programs/sss-compliance/src/state/blacklist_registry.rs` defines `BlacklistRegistry` exactly as in `PRD.md` Section 8.2:
  - Fields: `mint: Pubkey`, `count: u64`, `bump: u8`
  - Derives: `#[account]`, `InitSpace`
  - PDA seed: `["blacklist_registry", mint.key()]`
- [ ] `programs/sss-compliance/src/state/blacklist_entry.rs` defines `BlacklistEntry` exactly as in `PRD.md` Section 8.2:
  - Fields: `mint: Pubkey`, `wallet: Pubkey`, `reason: String` (max 128 chars), `added_by: Pubkey`, `timestamp: i64`, `bump: u8`
  - PDA seed: `["blacklist_entry", mint.key(), wallet.key()]`
- [ ] `programs/sss-compliance/src/errors.rs` defines `SSSComplianceError` with all 6 codes from `PRD.md` Section 8.4:
  - `SourceBlacklisted`, `DestinationBlacklisted`, `NotComplianceOfficer`, `NotPermanentDelegate`, `AddressNotBlacklisted`, `AddressAlreadyBlacklisted`
  - Each with exact `#[msg("...")]` string from PRD
- [ ] `programs/sss-compliance/src/events.rs` defines all 3 events from `PRD.md` Section 8.5:
  - `BlacklistAddedEvent`, `BlacklistRemovedEvent`, `SeizureEvent` — exact fields, `#[event]` attribute
- [ ] All types re-exported from `lib.rs`
- [ ] `cargo build-bpf` passes

---

### Issue #13 — Implement `init_blacklist` instruction

**Labels:** `epic:anchor-compliance` `component:anchor`
**Depends on:** #12

#### Description
Implement `init_blacklist`. Initializes the `BlacklistRegistry` PDA for a given mint. Must be called once per mint during SSS-2 deployment.

#### Acceptance Criteria
- [ ] `programs/sss-compliance/src/instructions/init_blacklist.rs` implemented
- [ ] Accounts context: `payer: Signer`, `mint`, `compliance_officer: AccountInfo` (stored address), `blacklist_registry` PDA (init, seed `["blacklist_registry", mint]`), `system_program`
- [ ] `BlacklistRegistry` initialized with `mint`, `count = 0`, `bump`
- [ ] Instruction is idempotent-safe: attempting to reinitialize returns an Anchor account-already-exists error, not a panic
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #14 — Implement `add_to_blacklist` instruction

**Labels:** `epic:anchor-compliance` `component:anchor`
**Depends on:** #13

#### Description
Implement `add_to_blacklist`. Creates a `BlacklistEntry` PDA for a wallet, increments the registry count, and emits `BlacklistAddedEvent`. Only the compliance officer may call this.

#### Acceptance Criteria
- [ ] `programs/sss-compliance/src/instructions/add_to_blacklist.rs` implemented
- [ ] Accounts context: `compliance_officer: Signer`, `mint`, `wallet: AccountInfo` (the address being blacklisted), `blacklist_registry` (mut), `blacklist_entry` (init, seed `["blacklist_entry", mint, wallet]`), `system_program`
- [ ] Authority check: `compliance_officer` signer must match the address stored in `mint_config` (cross-program read from `sss-base`) — return `NotComplianceOfficer` if not
- [ ] Duplicate check: if `blacklist_entry` already exists → return `AddressAlreadyBlacklisted`
- [ ] `BlacklistEntry` initialized: `mint`, `wallet`, `reason` (param, max 128 chars), `added_by = compliance_officer.key()`, `timestamp`, `bump`
- [ ] `blacklist_registry.count` incremented with `checked_add`
- [ ] `emit!(BlacklistAddedEvent { mint, wallet, reason, officer, timestamp })` on success
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #15 — Implement `remove_from_blacklist` instruction

**Labels:** `epic:anchor-compliance` `component:anchor`
**Depends on:** #14

#### Description
Implement `remove_from_blacklist`. Closes the `BlacklistEntry` PDA, decrements the registry count, and emits `BlacklistRemovedEvent`.

#### Acceptance Criteria
- [ ] `programs/sss-compliance/src/instructions/remove_from_blacklist.rs` implemented
- [ ] Accounts context: `compliance_officer: Signer`, `mint`, `wallet: AccountInfo`, `blacklist_registry` (mut), `blacklist_entry` (mut, close = compliance_officer), `system_program`
- [ ] Authority check: signer must be compliance officer → return `NotComplianceOfficer` if not
- [ ] Existence check: if `blacklist_entry` does not exist → return `AddressNotBlacklisted`
- [ ] `blacklist_registry.count` decremented with `checked_sub`
- [ ] `blacklist_entry` account closed (lamports returned to compliance officer)
- [ ] `emit!(BlacklistRemovedEvent { mint, wallet, officer, timestamp })` on success
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #16 — Implement `execute_transfer_hook` instruction

**Labels:** `epic:anchor-compliance` `component:anchor`
**Depends on:** #12

#### Description
Implement the Token-2022 `TransferHook` interface. This is called automatically by the Token-2022 runtime on every transfer of an SSS-2 token. It must check both source and destination wallets against the blacklist PDAs and reject if either is blacklisted.

#### Acceptance Criteria
- [ ] `programs/sss-compliance/src/instructions/execute_transfer_hook.rs` implemented
- [ ] Accounts context matches `PRD.md` Section 8.3 exactly:
  - `source_token`, `mint`, `destination_token`, `owner`, `extra_account_meta_list` PDA (seed `["extra-account-metas", mint]`), `source_blacklist_entry`, `destination_blacklist_entry`
- [ ] Hook checks if `source_blacklist_entry` account exists and is initialized → return `SourceBlacklisted` if so
- [ ] Hook checks if `destination_blacklist_entry` account exists and is initialized → return `DestinationBlacklisted` if so
- [ ] Returns `Ok(())` if both accounts do not exist (not blacklisted) — this is the happy path
- [ ] `ExtraAccountMetaList` PDA is initialized in a separate `init_extra_account_meta_list` instruction called during SSS-2 mint creation
- [ ] The `init_extra_account_meta_list` instruction is also implemented in this issue
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #17 — Implement `seize_tokens` instruction

**Labels:** `epic:anchor-compliance` `component:anchor`
**Depends on:** #12

#### Description
Implement `seize_tokens`. The permanent delegate forcibly transfers tokens from any account to a designated treasury. Emits `SeizureEvent`.

#### Acceptance Criteria
- [ ] `programs/sss-compliance/src/instructions/seize_tokens.rs` implemented
- [ ] Accounts context: `permanent_delegate: Signer`, `mint`, `source` (token account), `destination` (treasury ATA), `token_program`
- [ ] Authority check: signer must match the permanent delegate stored in the mint's `PermanentDelegate` Token-2022 extension — return `NotPermanentDelegate` if not
- [ ] Issues Token-2022 delegated `transfer_checked` CPI using the permanent delegate authority
- [ ] Parameters: `amount: u64`, `reason: String`
- [ ] `emit!(SeizureEvent { mint, source, destination, amount, reason, delegate, timestamp })` on success
- [ ] `cargo build-bpf` passes, clippy clean

---

### Issue #18 — Write Anchor tests for `sss-compliance` program

**Labels:** `epic:anchor-compliance` `component:tests`
**Depends on:** #14, #15, #16, #17

#### Description
Write the full Anchor test suite for `sss-compliance`. Must achieve ≥ 80% instruction coverage and cover all 6 error codes.

#### Acceptance Criteria
- [ ] `tests/anchor/sss-compliance.ts` test file created
- [ ] `init_blacklist` — assert `BlacklistRegistry` PDA initialized with `count = 0`
- [ ] `add_to_blacklist` — valid add: assert `BlacklistEntry` PDA exists, `registry.count = 1`, `BlacklistAddedEvent` emitted
- [ ] `add_to_blacklist` — duplicate address → expect `AddressAlreadyBlacklisted`
- [ ] `add_to_blacklist` — non-compliance-officer signer → expect `NotComplianceOfficer`
- [ ] `remove_from_blacklist` — valid remove: assert `BlacklistEntry` PDA closed, `registry.count = 0`, `BlacklistRemovedEvent` emitted
- [ ] `remove_from_blacklist` — non-existent address → expect `AddressNotBlacklisted`
- [ ] `execute_transfer_hook` — source blacklisted → expect `SourceBlacklisted`
- [ ] `execute_transfer_hook` — destination blacklisted → expect `DestinationBlacklisted`
- [ ] `execute_transfer_hook` — neither blacklisted → expect `Ok`, transfer completes
- [ ] `seize_tokens` — valid seizure: assert tokens transferred, `SeizureEvent` emitted
- [ ] `seize_tokens` — non-delegate signer → expect `NotPermanentDelegate`
- [ ] SSS-2 end-to-end test: deploy SSS-2 mint → mint 1000 → blacklist destination → attempt transfer → expect `DestinationBlacklisted` → remove from blacklist → transfer succeeds → seize all tokens to treasury
- [ ] `anchor test` passes with all tests green

---

---

## EPIC 4 — TypeScript SDK

---

### Issue #19 — Implement `types.ts` — all SDK TypeScript interfaces

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #2

#### Description
Define every TypeScript interface and type used by the SDK, exactly as specified in `PRD.md` Sections 7 and 9. No implementation logic — types only.

#### Acceptance Criteria
- [ ] `sdk/src/types.ts` defines all of the following, matching PRD exactly:
  - `SSS1Config` — all fields from `PRD.md` Section 7.1
  - `SSS2Config extends SSS1Config` — all additional fields from `PRD.md` Section 7.2
  - `TransactionResult` — `{ signature: string; confirmedAt: number; success: boolean }`
  - `DeploymentResult` — `{ mint: PublicKey; standard: 'SSS-1' | 'SSS-2'; roles: Record<string, PublicKey>; signatures: Record<string, string>; configPDA: PublicKey }`
  - `BlacklistStatus` — `{ blacklisted: boolean; reason?: string; timestamp?: number; addedBy?: PublicKey }`
  - `BlacklistEntry` — on-chain entry shape
  - `MintConfig` — mirrors the on-chain `MintConfig` struct
  - `SSS1DeploymentOutput` — JSON output shape from `PRD.md` Section 7.1
  - `SSS2DeploymentOutput` — JSON output shape from `PRD.md` Section 7.2
- [ ] All types exported from `sdk/src/index.ts`
- [ ] `tsc --noEmit` passes with `--strict`
- [ ] No `any` types in any exported interface

---

### Issue #20 — Implement `utils.ts` — PDA derivation and decimal helpers

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #19

#### Description
Implement all utility functions used by the SDK modules: PDA derivation, decimal conversion (UI units ↔ raw u64), and ATA helpers.

#### Acceptance Criteria
- [ ] `sdk/src/utils.ts` (or `sdk/src/utils/` directory) implements:
  - `deriveMintConfigPDA(mint: PublicKey, programId: PublicKey): [PublicKey, number]` — seed: `["mint_config", mint]`
  - `deriveBlacklistRegistryPDA(mint: PublicKey, programId: PublicKey): [PublicKey, number]` — seed: `["blacklist_registry", mint]`
  - `deriveBlacklistEntryPDA(mint: PublicKey, wallet: PublicKey, programId: PublicKey): [PublicKey, number]` — seed: `["blacklist_entry", mint, wallet]`
  - `deriveExtraAccountMetaListPDA(mint: PublicKey, programId: PublicKey): [PublicKey, number]` — seed: `["extra-account-metas", mint]`
  - `uiAmountToRaw(amount: number, decimals: number): bigint` — converts UI amount to raw token units
  - `rawAmountToUi(raw: bigint, decimals: number): number` — reverse conversion
  - `getOrCreateATA(connection, payer, mint, owner, ...): Promise<PublicKey>` — creates ATA if not exists
- [ ] All PDA seeds match the Anchor program seeds exactly
- [ ] Unit tests in `tests/sdk/utils.test.ts`:
  - PDA derivation — assert output matches a known expected address
  - `uiAmountToRaw(100.5, 6)` → `100500000n`
  - `rawAmountToUi(100500000n, 6)` → `100.5`
- [ ] Exported from `sdk/src/index.ts`

---

### Issue #21 — Implement `SSSClient` main class

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #19, #20

#### Description
Implement the `SSSClient` class — the main entry point for the SDK. It holds the `Connection`, `Wallet`, and lazily instantiates `BaseModule` and `ComplianceModule`.

#### Acceptance Criteria
- [ ] `sdk/src/client.ts` implements `SSSClient` class:
  - Constructor: `constructor(connection: Connection, wallet: Wallet, config?: { commitment?: Commitment })`
  - Property `base: BaseModule` — lazily initialized
  - Property `compliance: ComplianceModule` — lazily initialized
  - Methods `deploySSS1(config: SSS1Config): Promise<DeploymentResult>` and `deploySSS2(config: SSS2Config): Promise<DeploymentResult>` as thin wrappers delegating to preset classes (to be implemented in #24 and #25)
- [ ] `SSSClient` exported from `sdk/src/index.ts`
- [ ] `tsc --noEmit` passes
- [ ] Unit test in `tests/sdk/client.test.ts` — assert `client.base` returns a `BaseModule` instance

---

### Issue #22 — Implement `BaseModule` — `mint()` method

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #21

#### Description
Implement `BaseModule.mint()`. Converts UI amount to raw units, builds the `mint_tokens` instruction, submits transaction, and returns `TransactionResult`.

#### Acceptance Criteria
- [ ] `sdk/src/modules/base.ts` `BaseModule` class created with `mint()` method
- [ ] Method signature matches `PRD.md` Section 9.2 exactly: `mint(params: { mint, destination, amount, authority }): Promise<TransactionResult>`
- [ ] UI amount converted to raw units using `uiAmountToRaw` (fetches decimals from mint account)
- [ ] ATA created for destination if it doesn't exist
- [ ] Instruction built using Anchor-generated program client with correct accounts
- [ ] Transaction submitted with `sendAndConfirmTransaction`
- [ ] Returns `TransactionResult` with `signature`, `confirmedAt`, `success: true`
- [ ] Throws `SSSError` with code `"SSS_NOT_MINT_AUTHORITY"` on authority rejection from program
- [ ] Unit test in `tests/sdk/base.test.ts`: mock RPC connection, assert instruction built with correct accounts and amount

---

### Issue #23 — Implement `BaseModule` — `burn()`, `freeze()`, `thaw()`, `updateMetadata()` methods

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #22

#### Description
Implement the remaining `BaseModule` methods: `burn`, `freeze`, `thaw`, `updateMetadata`, `getBalance`, `getTotalSupply`, `getMintConfig`.

#### Acceptance Criteria
- [ ] `BaseModule.burn(params: { mint, source, amount, authority })` — converts amount, builds `burn_tokens` instruction, returns `TransactionResult`
- [ ] `BaseModule.freeze(mint, account, authority)` — builds `freeze_account` instruction
- [ ] `BaseModule.thaw(mint, account, authority)` — builds `thaw_account` instruction
- [ ] `BaseModule.updateMetadata(params: { mint, newUri?, additionalMetadata?, authority })` — builds `update_metadata` instruction
- [ ] `BaseModule.getBalance(mint, wallet): Promise<number>` — fetches ATA balance, returns UI amount
- [ ] `BaseModule.getTotalSupply(mint): Promise<number>` — fetches mint supply, returns UI amount
- [ ] `BaseModule.getMintConfig(mint): Promise<MintConfig>` — fetches and deserializes `MintConfig` PDA
- [ ] All methods exported via `SSSClient.base`
- [ ] Unit tests: `burn` amount conversion, `freeze`/`thaw` correct token account passed
- [ ] `tsc --noEmit` passes

---

### Issue #24 — Implement `ComplianceModule` — `addToBlacklist()` and `removeFromBlacklist()`

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #21

#### Description
Implement the blacklist management methods on `ComplianceModule`.

#### Acceptance Criteria
- [ ] `sdk/src/modules/compliance.ts` `ComplianceModule` class created
- [ ] `addToBlacklist(params: { mint, wallet, reason, officer })` — derives `BlacklistEntry` PDA, builds `add_to_blacklist` instruction, submits, returns `TransactionResult`
- [ ] `removeFromBlacklist(params: { mint, wallet, officer })` — derives PDA, builds `remove_from_blacklist` instruction
- [ ] PDA derivation uses `deriveBlacklistEntryPDA` utility — no inline derivation
- [ ] Throws `SSSError` with code `"SSS_ADDRESS_ALREADY_BLACKLISTED"` on duplicate
- [ ] Throws `SSSError` with code `"SSS_NOT_COMPLIANCE_OFFICER"` on authority rejection
- [ ] Unit tests: `addToBlacklist` — assert correct PDA derived; `removeFromBlacklist` — assert correct accounts passed
- [ ] `tsc --noEmit` passes

---

### Issue #25 — Implement `ComplianceModule` — `isBlacklisted()`, `seize()`, `getBlacklist()`

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #24

#### Description
Implement the remaining `ComplianceModule` methods.

#### Acceptance Criteria
- [ ] `isBlacklisted(mint, wallet): Promise<BlacklistStatus>` — derives `BlacklistEntry` PDA, fetches account; if exists returns `{ blacklisted: true, reason, timestamp, addedBy }`; if not exists returns `{ blacklisted: false }`
- [ ] `seize(params: { mint, source, destination, amount, reason, delegate })` — builds `seize_tokens` instruction, submits, returns `TransactionResult`
- [ ] `getBlacklist(mint): Promise<BlacklistEntry[]>` — fetches `BlacklistRegistry` to get count, then fetches all `BlacklistEntry` PDAs, returns array
- [ ] Unit tests: `isBlacklisted` — mock account fetch returning entry → assert `blacklisted: true`; mock null → assert `blacklisted: false`
- [ ] `tsc --noEmit` passes

---

### Issue #26 — Implement `SSS1Preset` — `deploySSS1()`

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #22, #23

#### Description
Implement the `SSS1Preset` class and `deploySSS1()` method. This is the primary DX entry point — deploy a full SSS-1 stablecoin in one call.

#### Acceptance Criteria
- [ ] `sdk/src/presets/sss1.ts` implements `SSS1Preset` class with `deploy(config: SSS1Config): Promise<DeploymentResult>`
- [ ] Validates `SSS1Config`: all required fields present, `decimals` in range 0–9, `symbol` ≤ 10 chars
- [ ] Calls `create_mint` instruction with SSS-1 extensions: `MintCloseAuthority`, `MetadataPointer`, `TokenMetadata`
- [ ] Returns `DeploymentResult` matching the schema in `PRD.md` Section 7.1
- [ ] Writes deployment JSON file to disk at `./sss-deployment-<SYMBOL>-<timestamp>.json`
- [ ] `SSSClient.deploySSS1()` delegates to `SSS1Preset.deploy()`
- [ ] Unit test: `deploySSS1` with mocked RPC — assert output matches `SSS1DeploymentOutput` schema
- [ ] `tsc --noEmit` passes

---

### Issue #27 — Implement `SSS2Preset` — `deploySSS2()`

**Labels:** `epic:sdk` `component:sdk`
**Depends on:** #26, #25

#### Description
Implement `SSS2Preset` and `deploySSS2()`. More complex than SSS-1: requires additional extensions, hook program registration, blacklist registry initialization, and a multi-transaction deployment sequence.

#### Acceptance Criteria
- [ ] `sdk/src/presets/sss2.ts` implements `SSS2Preset` class with `deploy(config: SSS2Config): Promise<DeploymentResult>`
- [ ] Validates `SSS2Config`: all SSS-1 validations plus `hookProgramId`, `complianceOfficer`, `permanentDelegate`, `seizureTreasury` all provided
- [ ] Creates mint with SSS-2 extensions: SSS-1 extensions + `PermanentDelegate` + `TransferHook` (pointing to `hookProgramId`)
- [ ] Calls `init_extra_account_meta_list` on the hook program after mint creation
- [ ] Calls `init_blacklist` on `sss-compliance` program after mint creation
- [ ] Returns `DeploymentResult` with all three transaction signatures: `mintCreation`, `hookInit`, `blacklistInit`
- [ ] Output matches `SSS2DeploymentOutput` schema in `PRD.md` Section 7.2
- [ ] `SSSClient.deploySSS2()` delegates to `SSS2Preset.deploy()`
- [ ] Unit test: assert deployment output matches `SSS2DeploymentOutput` schema
- [ ] `tsc --noEmit` passes

---

### Issue #28 — Write SDK unit tests (full coverage pass)

**Labels:** `epic:sdk` `component:tests`
**Depends on:** #22, #23, #24, #25, #26, #27

#### Description
Write any remaining SDK unit tests to bring coverage to ≥ 70% and ensure all required test cases from `PRD.md` Section 14.2 are present.

#### Acceptance Criteria
- [ ] All tests listed in `PRD.md` Section 14.2 are implemented and passing:
  - `BaseModule.mint` — mock RPC, assert instruction built correctly
  - `BaseModule.burn` — assert amount conversion (UI → raw units)
  - `ComplianceModule.addToBlacklist` — assert PDA derivation
  - `ComplianceModule.isBlacklisted` — mock true and false paths
  - `SSS1Config` validation — required fields, invalid decimals rejected
  - `SSS2Config` validation — `hookProgramId` required
- [ ] `jest --coverage` reports ≥ 70% line coverage across `sdk/src/`
- [ ] All tests pass: `pnpm test` in `sdk/`

---

---

## EPIC 5 — CLI Tool

---

### Issue #29 — Implement `sss deploy` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #26, #27, #3

#### Description
Implement the `sss deploy` CLI command. Wires CLI flags to `SSSClient.deploySSS1()` or `deploySSS2()` depending on `--preset`.

#### Acceptance Criteria
- [ ] `cli/src/commands/deploy.ts` exports a Commander.js `Command`
- [ ] Options implemented exactly as in `PRD.md` Section 10.2: `--preset`, `--config`, `--name`, `--symbol`, `--decimals`, `--uri`, `--dry-run`
- [ ] `--preset sss1` path: reads flags or config file, builds `SSS1Config`, calls `client.deploySSS1()`
- [ ] `--preset sss2` path: reads config file (required for SSS-2 due to additional keypairs), calls `client.deploySSS2()`
- [ ] `--dry-run` simulates the transaction without broadcasting (uses `simulateTransaction`)
- [ ] Successful output matches the format in `PRD.md` Section 10.2 (checkmark lines + "Saved to:" line)
- [ ] Error path: invalid config → print to stderr + exit code 1
- [ ] Command registered in `cli/src/index.ts`
- [ ] `sss deploy --help` shows correct usage

---

### Issue #30 — Implement `sss mint` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #22, #3

#### Description
Implement `sss mint`. Calls `BaseModule.mint()`.

#### Acceptance Criteria
- [ ] `cli/src/commands/mint.ts` exports a Commander.js `Command`
- [ ] Required options: `--mint <address>`, `--to <wallet>`, `--amount <number>`
- [ ] Loads operator keypair from `--keypair` flag or `OPERATOR_KEYPAIR_PATH` env var
- [ ] Calls `client.base.mint({ mint, destination, amount, authority })`
- [ ] Outputs transaction signature and confirmed slot on success
- [ ] Registered in `cli/src/index.ts`

---

### Issue #31 — Implement `sss burn` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #23, #3

#### Description
Implement `sss burn`. Calls `BaseModule.burn()`.

#### Acceptance Criteria
- [ ] `cli/src/commands/burn.ts` exports a Commander.js `Command`
- [ ] Required options: `--mint <address>`, `--from <wallet>`, `--amount <number>`
- [ ] Calls `client.base.burn({ mint, source, amount, authority })`
- [ ] Outputs transaction signature on success
- [ ] Registered in `cli/src/index.ts`

---

### Issue #32 — Implement `sss freeze` and `sss thaw` commands

**Labels:** `epic:cli` `component:cli`
**Depends on:** #23, #3

#### Description
Implement `sss freeze` and `sss thaw`. Both call corresponding `BaseModule` methods.

#### Acceptance Criteria
- [ ] `cli/src/commands/freeze.ts` and `cli/src/commands/thaw.ts` each export a `Command`
- [ ] Both require: `--mint <address>`, `--account <wallet>`
- [ ] Freeze loads freeze-authority keypair from `--keypair` or env
- [ ] Thaw loads freeze-authority keypair from `--keypair` or env
- [ ] Output: confirm message with account address and transaction signature
- [ ] Both registered in `cli/src/index.ts`

---

### Issue #33 — Implement `sss blacklist add` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #24, #3

#### Description
Implement `sss blacklist add`. Calls `ComplianceModule.addToBlacklist()`.

#### Acceptance Criteria
- [ ] `cli/src/commands/blacklist-add.ts` exports a `Command`
- [ ] Required options: `--mint <address>`, `--wallet <address>`, `--reason <string>`
- [ ] `--reason` enforced max 128 characters at CLI level with helpful error message
- [ ] Loads compliance officer keypair from `COMPLIANCE_OFFICER_KEYPAIR_PATH` env var or `--keypair` flag
- [ ] Calls `client.compliance.addToBlacklist({ mint, wallet, reason, officer })`
- [ ] Output: confirmed blacklist entry with timestamp
- [ ] Registered in `cli/src/index.ts`

---

### Issue #34 — Implement `sss blacklist remove` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #24, #3

#### Description
Implement `sss blacklist remove`. Calls `ComplianceModule.removeFromBlacklist()`.

#### Acceptance Criteria
- [ ] `cli/src/commands/blacklist-remove.ts` exports a `Command`
- [ ] Required options: `--mint <address>`, `--wallet <address>`
- [ ] Loads compliance officer keypair
- [ ] Calls `client.compliance.removeFromBlacklist({ mint, wallet, officer })`
- [ ] Output: confirms removal with transaction signature
- [ ] Registered in `cli/src/index.ts`

---

### Issue #35 — Implement `sss blacklist check` and `sss blacklist list` commands

**Labels:** `epic:cli` `component:cli`
**Depends on:** #25, #3

#### Description
Implement `sss blacklist check` (single address status) and `sss blacklist list` (all blacklisted addresses for a mint).

#### Acceptance Criteria
- [ ] `cli/src/commands/blacklist-check.ts`: required `--mint`, `--wallet`; calls `client.compliance.isBlacklisted()`; output matches `PRD.md` Section 10.2 format exactly (Status, Reason, Added by, Timestamp lines)
- [ ] `cli/src/commands/blacklist-list.ts`: required `--mint`; optional `--limit` (default 50), `--offset` (default 0); calls `client.compliance.getBlacklist()`; outputs table of entries
- [ ] Both registered in `cli/src/index.ts`

---

### Issue #36 — Implement `sss seize` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #25, #3

#### Description
Implement `sss seize`. Calls `ComplianceModule.seize()`.

#### Acceptance Criteria
- [ ] `cli/src/commands/seize.ts` exports a `Command`
- [ ] Required options: `--mint`, `--from`, `--to`, `--amount`, `--reason`
- [ ] Loads permanent delegate keypair from `PERMANENT_DELEGATE_KEYPAIR_PATH` env var or `--keypair`
- [ ] Calls `client.compliance.seize({ mint, source, destination, amount, reason, delegate })`
- [ ] Output: confirms seizure with amount, source, destination, and transaction signature
- [ ] Registered in `cli/src/index.ts`

---

### Issue #37 — Implement `sss info` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #23, #25, #3

#### Description
Implement `sss info`. Fetches and displays all on-chain information about a deployed mint — supply, authorities, extension status, and blacklist count.

#### Acceptance Criteria
- [ ] `cli/src/commands/info.ts` exports a `Command`
- [ ] Required option: `--mint <address>`
- [ ] Fetches: mint account (Token-2022 extensions), `MintConfig` PDA, `BlacklistRegistry` PDA (if SSS-2)
- [ ] Output matches the full table format in `PRD.md` Section 10.2: Standard, Name, Symbol, Decimals, Total Supply, Mint Authority, Freeze Authority, Compliance Officer (SSS-2), Permanent Delegate (SSS-2), Blacklisted addresses count (SSS-2), Hook Program (SSS-2), Network
- [ ] `--json` flag outputs raw JSON
- [ ] Registered in `cli/src/index.ts`

---

### Issue #38 — Implement `sss events` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #3

#### Description
Implement `sss events`. Queries the indexer service (or on-chain logs directly) for events associated with a mint.

#### Acceptance Criteria
- [ ] `cli/src/commands/events.ts` exports a `Command`
- [ ] Options: `--mint <address>`, `--type <mint|burn|freeze|blacklist|seize>`, `--follow`, `--since`, `--limit` (default 20)
- [ ] Without `--follow`: calls indexer `GET /events?mint=&type=&limit=` and prints results as table
- [ ] With `--follow`: opens WebSocket or polling loop and streams new events as they arrive (like `tail -f`)
- [ ] If indexer service is unavailable, falls back to fetching recent transaction logs from RPC with a clear warning printed to stderr
- [ ] Registered in `cli/src/index.ts`

---

### Issue #39 — Implement `sss validate` command

**Labels:** `epic:cli` `component:cli`
**Depends on:** #3, #23, #25

#### Description
Implement `sss validate`. Reads a deployment JSON file and verifies every field against on-chain state.

#### Acceptance Criteria
- [ ] `cli/src/commands/validate.ts` exports a `Command`
- [ ] Required option: `--file <path>` pointing to a deployment output JSON
- [ ] Performs all checks listed in `PRD.md` Section 10.2:
  - ✓ Mint account exists on-chain
  - ✓ All authority addresses match deployment file
  - ✓ Correct Token-2022 extensions present
  - ✓ Transfer hook registered (SSS-2 only)
  - ✓ Blacklist registry initialized (SSS-2 only)
- [ ] Prints a checkmark or cross per check with a summary pass/fail
- [ ] Exit code 0 if all checks pass; exit code 1 if any fail
- [ ] Registered in `cli/src/index.ts`

---

### Issue #40 — Write CLI E2E integration test scripts

**Labels:** `epic:cli` `component:tests`
**Depends on:** #29, #30, #31, #32, #33, #34, #35, #36, #37, #39

#### Description
Write the two Bash E2E integration test scripts for SSS-1 and SSS-2 full lifecycle as defined in `PRD.md` Section 14.3.

#### Acceptance Criteria
- [ ] `tests/cli/sss1-e2e.sh` implements the full SSS-1 lifecycle:
  1. `sss deploy --preset sss1` → capture mint address
  2. `sss mint --mint $MINT --to $WALLET --amount 1000`
  3. `sss info --mint $MINT` → assert supply = 1000
  4. `sss freeze --mint $MINT --account $WALLET`
  5. `sss burn --mint $MINT --from $WALLET --amount 500` → expect error (frozen)
  6. `sss thaw --mint $MINT --account $WALLET`
  7. `sss burn --mint $MINT --from $WALLET --amount 500`
  8. `sss info --mint $MINT` → assert supply = 500
- [ ] `tests/cli/sss2-e2e.sh` implements the full SSS-2 lifecycle:
  1. `sss deploy --preset sss2 --config ./tests/cli/fixtures/sss2-config.json` → capture mint address
  2. `sss mint --mint $MINT --to $WALLET --amount 5000`
  3. `sss blacklist add --mint $MINT --wallet $WALLET --reason "test"`
  4. Attempt token transfer → expect rejection
  5. `sss blacklist remove --mint $MINT --wallet $WALLET`
  6. `sss seize --mint $MINT --from $WALLET --to $TREASURY --amount 1000 --reason "test seizure"`
  7. `sss info --mint $MINT` → assert supply = 4000
  8. `sss validate --file ./sss-deployment-*.json` → assert all checks pass
- [ ] Both scripts are executable (`chmod +x`) and include a usage comment header
- [ ] `tests/cli/fixtures/sss2-config.json` fixture file created with test keypair paths

---

---

## EPIC 6 — Backend Services

---

### Issue #41 — Implement `services/indexer` — event listener and SQLite storage

**Labels:** `epic:services` `component:indexer`
**Depends on:** #1

#### Description
Implement the blockchain event indexer service. It subscribes to `sss-base` and `sss-compliance` program logs via WebSocket, decodes Anchor events, and stores them in a local SQLite database.

#### Acceptance Criteria
- [ ] `services/indexer/package.json` with Node.js TypeScript setup, `better-sqlite3` dependency
- [ ] SQLite database initialized at `events.db` with table: `id INTEGER PRIMARY KEY, event_type TEXT, mint TEXT, data_json TEXT, signature TEXT, slot INTEGER, timestamp INTEGER`
- [ ] `connection.onLogs(programId, callback)` subscribed for both `sss-base` and `sss-compliance` program IDs
- [ ] Anchor event discriminators parsed from logs to decode: `MintEvent`, `BurnEvent`, `FreezeEvent`, `ThawEvent`, `BlacklistAddedEvent`, `BlacklistRemovedEvent`, `SeizureEvent`
- [ ] Decoded events inserted into `events.db`
- [ ] WebSocket reconnection on disconnect with exponential backoff: initial 1s, max 30s
- [ ] Express server exposes `GET /events` with query params: `mint`, `type`, `limit` (default 20), `offset` (default 0)
- [ ] Service handles `SIGINT`/`SIGTERM` cleanly (closes DB connection, unsubscribes)
- [ ] `README.md` in `services/indexer/` with startup instructions

---

### Issue #42 — Implement `services/compliance-api` — blacklist REST API

**Labels:** `epic:services` `component:compliance-api`
**Depends on:** #24, #25, #1

#### Description
Implement the compliance API service. Provides REST endpoints for blacklist management with in-memory LRU cache and API key authentication.

#### Acceptance Criteria
- [ ] `services/compliance-api/package.json` with Express, `zod`, `lru-cache` dependencies
- [ ] Routes implemented:
  - `POST /blacklist/add` — body: `{ mint, wallet, reason }`; calls `ComplianceModule.addToBlacklist()` via SDK; requires API key auth
  - `POST /blacklist/remove` — body: `{ mint, wallet }`; requires API key auth
  - `GET /blacklist/:address?mint=<address>` — returns blacklist status for address + mint
  - `POST /check` — body: `{ address, mint }`; returns `{ blacklisted: bool, reason?: string }`; uses LRU cache first, falls back to on-chain
- [ ] LRU cache: 1,000 entries, 60-second TTL (as per `PRD.md` Section 6.4)
- [ ] API key authentication on write endpoints: `Authorization: Bearer <COMPLIANCE_API_KEY>` from env var
- [ ] `zod` validation on all request bodies; HTTP 400 on invalid input
- [ ] HTTP 401 on missing/invalid API key
- [ ] Service handles `SIGINT`/`SIGTERM` cleanly
- [ ] `README.md` in `services/compliance-api/` with startup and API usage instructions

---

### Issue #43 — Implement `services/mint-coordinator` — mint/burn coordination API

**Labels:** `epic:services` `component:mint-coordinator`
**Depends on:** #22, #23, #1

#### Description
Implement the mint coordinator service. Provides REST endpoints for mint and burn operations with transaction retry logic.

#### Acceptance Criteria
- [ ] `services/mint-coordinator/package.json` with Express, `zod` dependencies
- [ ] Routes implemented:
  - `POST /mint` — body: `{ mint, destination, amount }`; calls SDK `BaseModule.mint()`; returns `{ signature, status, confirmedAt }`
  - `POST /burn` — body: `{ mint, source, amount }`; calls SDK `BaseModule.burn()`; returns `{ signature, status, confirmedAt }`
- [ ] Exponential backoff retry: max 5 attempts, initial delay 500ms, backoff factor 2x
- [ ] API key authentication via `Authorization: Bearer` header
- [ ] `zod` body validation; HTTP 400 on invalid input
- [ ] On final retry failure, returns HTTP 500 with `{ error: "Transaction failed after N attempts", lastError: "..." }`
- [ ] Service handles `SIGINT`/`SIGTERM` cleanly
- [ ] `README.md` in `services/mint-coordinator/` with startup instructions

---

---

## EPIC 7 — Devnet Deployment

---

### Issue #44 — Deploy `sss-base` and `sss-compliance` programs to Devnet

**Labels:** `epic:deployment` `component:deploy`
**Depends on:** #11, #18

#### Description
Build both Anchor programs with `--verifiable` flag and deploy them to Solana Devnet. Record the program IDs in all required locations.

#### Acceptance Criteria
- [ ] `anchor build --verifiable` completes successfully for both programs
- [ ] `anchor deploy --provider.cluster devnet` deploys both programs
- [ ] `sss-base` program ID recorded in `Anchor.toml` under `[programs.devnet]`
- [ ] `sss-compliance` program ID recorded in `Anchor.toml` under `[programs.devnet]`
- [ ] `sdk/src/constants.ts` updated with both deployed program IDs (replacing placeholder `SystemProgram.programId`)
- [ ] `anchor test --provider.cluster devnet` runs and passes against live Devnet
- [ ] Both program IDs documented in `README.md` under a "Devnet Deployments" section
- [ ] `deployments/devnet-programs-<YYYY-MM-DD>.json` created with: `{ sssBASE: "<id>", sssCompliance: "<id>", deployedAt: "<ISO>", network: "devnet" }`

---

### Issue #45 — Deploy SSS-1 example token to Devnet

**Labels:** `epic:deployment` `component:deploy`
**Depends on:** #44, #29

#### Description
Deploy a live SSS-1 example stablecoin to Devnet using the CLI. Record the deployment artifact.

#### Acceptance Criteria
- [ ] `sss deploy --preset sss1 --name "SSS Demo USD" --symbol "SUSD" --uri <metadata-uri>` runs successfully against Devnet
- [ ] Deployment output JSON saved to `deployments/devnet-sss1-<YYYY-MM-DD>.json`
- [ ] `sss validate --file deployments/devnet-sss1-*.json` passes all checks
- [ ] `sss mint` of 1,000,000 SUSD to a demo wallet confirmed on Devnet
- [ ] Devnet explorer URL for the mint address documented in `README.md`

---

### Issue #46 — Deploy SSS-2 example token to Devnet

**Labels:** `epic:deployment` `component:deploy`
**Depends on:** #44, #29

#### Description
Deploy a live SSS-2 example stablecoin to Devnet. More involved than SSS-1 due to hook registration and blacklist initialization.

#### Acceptance Criteria
- [ ] `sss deploy --preset sss2 --config ./examples/sss2-devnet-config.json` runs successfully
- [ ] Transfer hook registered and `ExtraAccountMetaList` PDA initialized on Devnet
- [ ] `BlacklistRegistry` PDA initialized on Devnet
- [ ] Deployment output JSON saved to `deployments/devnet-sss2-<YYYY-MM-DD>.json` with all three transaction signatures
- [ ] `sss validate --file deployments/devnet-sss2-*.json` passes all checks including hook and blacklist checks
- [ ] `sss mint` of 1,000,000 SCUSD to a demo wallet confirmed on Devnet
- [ ] Devnet explorer URL for the mint address documented in `README.md`

---

### Issue #47 — Run full Devnet smoke test (SSS-1 and SSS-2 E2E)

**Labels:** `epic:deployment` `component:deploy`
**Depends on:** #45, #46, #40

#### Description
Run both CLI E2E test scripts against live Devnet. Verify complete lifecycle of both presets end-to-end on real infrastructure.

#### Acceptance Criteria
- [ ] `bash tests/cli/sss1-e2e.sh` runs to completion against Devnet with all assertions passing
- [ ] `bash tests/cli/sss2-e2e.sh` runs to completion against Devnet with all assertions passing
- [ ] All test output captured to `deployments/devnet-smoke-test-<YYYY-MM-DD>.log`
- [ ] No unexpected errors or panics in program logs during the test run
- [ ] Results summarized in a `deployments/SMOKE_TEST_RESULTS.md` file

---

---

## EPIC 8 — Documentation

---

### Issue #48 — Write `README.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #44, #45, #46

#### Description
Write the root `README.md`. Must be completable by a junior developer in under 30 minutes, as defined in `PRD.md` Section 3.

#### Acceptance Criteria
- [ ] README contains: project overview (1 paragraph), problem statement (2–3 sentences), architecture diagram (lifted from PRD)
- [ ] Quickstart section: install → configure keypair → airdrop → deploy SSS-1 in 5 commands, copy-pasteable without modification
- [ ] Both deployed Devnet program IDs listed under "Devnet Deployments"
- [ ] Both live example token addresses (SSS-1 and SSS-2) with Devnet explorer links
- [ ] Links to all `docs/` files
- [ ] Link to `SECURITY.md`
- [ ] Prerequisites section: Node.js ≥ 18, Rust, Anchor CLI, Solana CLI — with version numbers
- [ ] Badge row: build status, license, Solana network
- [ ] No content that duplicates the full docs — README stays scannable

---

### Issue #49 — Write `docs/getting-started.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #3

#### Description
Write the getting started guide. Target: a developer who has never used the SDK can deploy their first SSS-1 token from scratch.

#### Acceptance Criteria
- [ ] Covers: prerequisites, installation (`npm install -g @sss-sdk/cli`), keypair generation, devnet SOL airdrop, environment configuration
- [ ] Step-by-step SSS-1 deployment walkthrough with expected output shown at each step
- [ ] Troubleshooting section covering: insufficient SOL, RPC timeout, keypair file not found
- [ ] Links to `sss1-guide.md` and `sss2-guide.md` for next steps

---

### Issue #50 — Write `docs/sss1-guide.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #26, #29

#### Description
Write the complete SSS-1 guide covering every operation from deployment to burn.

#### Acceptance Criteria
- [ ] Covers: what SSS-1 is, required extensions and why, deploying via CLI, deploying via SDK (code example), minting, burning, freezing, thawing, updating metadata
- [ ] Every operation has a CLI example AND a TypeScript SDK code example
- [ ] Config schema (`SSS1Config`) documented with field descriptions and valid ranges
- [ ] Deployment output schema documented with field descriptions
- [ ] Role model section: who holds what authority and what they can do
- [ ] Link to `api-reference.md` for full method signatures

---

### Issue #51 — Write `docs/sss2-guide.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #27, #29, #33, #34, #35, #36

#### Description
Write the complete SSS-2 guide. More complex than SSS-1 — must explain the transfer hook, blacklist, and seizure mechanics clearly.

#### Acceptance Criteria
- [ ] Covers: what SSS-2 adds over SSS-1, transfer hook mechanics (with data flow diagram from PRD Section 12.2), deploying SSS-2, blacklist operations (add, remove, check, list), seizure workflow
- [ ] Transfer hook data flow explained step by step
- [ ] Every operation has CLI and SDK code examples
- [ ] `SSS2Config` schema documented with all additional fields
- [ ] Compliance officer and permanent delegate roles explained with security best practices
- [ ] Warning about irreversibility of extension choices at mint creation
- [ ] Link to `api-reference.md`

---

### Issue #52 — Write `docs/api-reference.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #23, #25, #26, #27

#### Description
Write the full SDK API reference. Every exported class, method, interface, and type documented.

#### Acceptance Criteria
- [ ] `SSSClient` class documented: constructor signature, all methods with params and return types
- [ ] `BaseModule` documented: every method with `@param`, `@returns`, `@throws`, and example
- [ ] `ComplianceModule` documented: every method with `@param`, `@returns`, `@throws`, and example
- [ ] `SSS1Preset` and `SSS2Preset` documented
- [ ] All exported types/interfaces documented with field descriptions
- [ ] All `SSSError` codes listed with triggering conditions
- [ ] Organized by class, with a table of contents at the top

---

### Issue #53 — Write `docs/cli-reference.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #29, #30, #31, #32, #33, #34, #35, #36, #37, #38, #39

#### Description
Write the complete CLI reference. All 12 commands documented with every flag and example output.

#### Acceptance Criteria
- [ ] Every command from `PRD.md` Section 10.2 documented: `deploy`, `mint`, `burn`, `freeze`, `thaw`, `blacklist add`, `blacklist remove`, `blacklist check`, `blacklist list`, `seize`, `info`, `events`, `validate`
- [ ] Each command entry includes: description, all options with types and defaults, at least 2 usage examples, expected output sample
- [ ] Global options documented at the top
- [ ] Environment variables section: all env vars, what they control, whether required or optional
- [ ] Error messages section: common errors and how to resolve them

---

### Issue #54 — Write `docs/architecture.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #44

#### Description
Write the architecture document. Explains the system design, component boundaries, data flows, and security model.

#### Acceptance Criteria
- [ ] System architecture layered diagram (from `PRD.md` Section 5) included
- [ ] Component map table (from `PRD.md` Section 5) included
- [ ] Data flow diagrams for all 4 flows from `PRD.md` Section 12: SSS-1 deployment, SSS-2 transfer with hook, blacklist add, seizure
- [ ] Component boundaries explained: what belongs in program vs SDK vs CLI
- [ ] PDA registry: all PDAs listed with seeds, owning program, and purpose
- [ ] Token-2022 extensions table: which extensions are used by SSS-1 vs SSS-2 and why
- [ ] Role model diagram from `PRD.md` Section 11.1

---

### Issue #55 — Write `SECURITY.md`

**Labels:** `epic:docs` `component:docs`
**Depends on:** #11, #18

#### Description
Write the `SECURITY.md` file covering the role model, threat vectors, and operational security best practices.

#### Acceptance Criteria
- [ ] Role hierarchy documented (all 5 roles: `MintAuthority`, `FreezeAuthority`, `UpdateAuthority`, `ComplianceOfficer`, `PermanentDelegate`) with what each can and cannot do
- [ ] On-chain security checks table from `PRD.md` Section 11.2 included
- [ ] Threat vectors table from `PRD.md` Section 11.3 included with mitigations
- [ ] Operational security section: keypair storage recommendations, multisig recommendation (Squads), separation of roles across different keypairs
- [ ] Known limitations section: authority revocation is irreversible in v1, no multisig built-in, Devnet only
- [ ] Responsible disclosure section with contact information placeholder

---

### Issue #56 — Add JSDoc to all exported SDK symbols

**Labels:** `epic:docs` `component:sdk`
**Depends on:** #28

#### Description
Audit all exported SDK symbols and ensure every class, method, interface, and type has complete JSDoc documentation as required by `PRD.md` Section 16.2.

#### Acceptance Criteria
- [ ] Every exported class has a JSDoc comment with description and `@example`
- [ ] Every exported method has `@param` for each parameter, `@returns`, `@throws` for each `SSSError` that can be thrown, and `@example`
- [ ] Every exported interface has a comment on the interface and on each field
- [ ] Every `SSSError` code has a comment explaining when it is thrown
- [ ] `tsc --noEmit` still passes after adding JSDoc

---

### Issue #57 — Create `examples/` directory with working example scripts

**Labels:** `epic:docs` `component:docs`
**Depends on:** #26, #27, #22, #24, #25

#### Description
Create the three example TypeScript scripts from `PRD.md` Section 13.1 that demonstrate real SDK usage.

#### Acceptance Criteria
- [ ] `examples/deploy-sss1.ts` — deploys an SSS-1 token using SDK; self-contained; runnable with `ts-node examples/deploy-sss1.ts`
- [ ] `examples/deploy-sss2.ts` — deploys an SSS-2 token using SDK; self-contained
- [ ] `examples/compliance-workflow.ts` — demonstrates: deploy SSS-2 → mint → add to blacklist → attempt transfer → seize
- [ ] All examples have comment headers explaining prerequisites and expected output
- [ ] All examples use only the public SDK API (no internal imports)
- [ ] Each example is referenced from `README.md`

---

---

## EPIC 9 — Release

---

### Issue #58 — Final test pass and coverage report

**Labels:** `epic:release`
**Depends on:** #11, #18, #28, #40, #47

#### Description
Run the complete test suite across all components and verify all coverage targets from `PRD.md` Section 3 are met.

#### Acceptance Criteria
- [ ] `anchor test` passes: ≥ 80% instruction coverage on `sss-base` and `sss-compliance`
- [ ] Every error code in both programs has at least one negative test (100% error code coverage)
- [ ] `pnpm test` in `sdk/` passes: ≥ 70% line coverage
- [ ] `tests/cli/sss1-e2e.sh` passes on Devnet
- [ ] `tests/cli/sss2-e2e.sh` passes on Devnet
- [ ] No skipped tests (`it.skip`, `#[ignore]`) in the codebase
- [ ] Coverage reports saved to `coverage/` directory

---

### Issue #59 — `cargo fmt`, `cargo clippy`, `eslint`, `prettier` — full codebase clean pass

**Labels:** `epic:release`
**Depends on:** #11, #18, #28

#### Description
Run all linters and formatters across the entire codebase. Resolve every warning and formatting inconsistency before tagging the release.

#### Acceptance Criteria
- [ ] `cargo fmt --all` applied across all Rust code — no diffs
- [ ] `cargo clippy --all -- -D warnings` passes with zero warnings
- [ ] `pnpm lint` passes across `sdk/`, `cli/`, all `services/` packages — zero ESLint errors
- [ ] `pnpm format:check` passes — zero Prettier diffs
- [ ] No `TODO`, `FIXME`, or `// BLOCKED:` comments remain unresolved (or are documented as known issues)

---

### Issue #60 — Tag `v1.0.0` and prepare submission artifacts

**Labels:** `epic:release`
**Depends on:** #55, #56, #57, #58, #59, #47, #48

#### Description
Final release preparation. Tag the version, commit all deployment artifacts, and assemble hackathon submission materials.

#### Acceptance Criteria
- [ ] All deployment JSON files committed to `deployments/` directory
- [ ] `README.md` Devnet section shows live, working program IDs and example token addresses
- [ ] `sdk/package.json` and `cli/package.json` versions set to `1.0.0`
- [ ] `CHANGELOG.md` created summarizing all features shipped in v1.0.0
- [ ] Git tag `v1.0.0` created and pushed
- [ ] GitHub Release created with tag `v1.0.0`, including:
  - Release notes summarizing SSS-1 and SSS-2 features
  - Links to live Devnet deployments on Solana Explorer
  - Link to `docs/getting-started.md`
- [ ] All required documentation files exist: `README.md`, `SECURITY.md`, `docs/getting-started.md`, `docs/sss1-guide.md`, `docs/sss2-guide.md`, `docs/api-reference.md`, `docs/cli-reference.md`, `docs/architecture.md`

---

## Summary Table

| # | Title | Epic | Depends On |
|---|---|---|---|
| 1 | Initialize monorepo with pnpm workspaces and Anchor scaffold | Setup | — |
| 2 | Configure TypeScript SDK package scaffold | Setup | #1 |
| 3 | Configure CLI package scaffold | Setup | #1 |
| 4 | Implement `MintConfig` PDA, events, and errors (`sss-base`) | Anchor Base | #1 |
| 5 | Implement `create_mint` instruction (SSS-1) | Anchor Base | #4 |
| 6 | Implement `mint_tokens` instruction | Anchor Base | #5 |
| 7 | Implement `burn_tokens` instruction | Anchor Base | #5 |
| 8 | Implement `freeze_account` instruction | Anchor Base | #5 |
| 9 | Implement `thaw_account` instruction | Anchor Base | #8 |
| 10 | Implement `update_metadata` instruction | Anchor Base | #5 |
| 11 | Write Anchor tests for `sss-base` | Tests | #6–#10 |
| 12 | Implement `BlacklistRegistry`, `BlacklistEntry`, errors (`sss-compliance`) | Anchor Compliance | #1 |
| 13 | Implement `init_blacklist` instruction | Anchor Compliance | #12 |
| 14 | Implement `add_to_blacklist` instruction | Anchor Compliance | #13 |
| 15 | Implement `remove_from_blacklist` instruction | Anchor Compliance | #14 |
| 16 | Implement `execute_transfer_hook` instruction | Anchor Compliance | #12 |
| 17 | Implement `seize_tokens` instruction | Anchor Compliance | #12 |
| 18 | Write Anchor tests for `sss-compliance` | Tests | #14–#17 |
| 19 | Implement `types.ts` — all SDK interfaces | SDK | #2 |
| 20 | Implement `utils.ts` — PDA derivation and decimal helpers | SDK | #19 |
| 21 | Implement `SSSClient` main class | SDK | #19, #20 |
| 22 | Implement `BaseModule.mint()` | SDK | #21 |
| 23 | Implement `BaseModule.burn/freeze/thaw/updateMetadata/getters` | SDK | #22 |
| 24 | Implement `ComplianceModule.addToBlacklist/removeFromBlacklist` | SDK | #21 |
| 25 | Implement `ComplianceModule.isBlacklisted/seize/getBlacklist` | SDK | #24 |
| 26 | Implement `SSS1Preset.deploySSS1()` | SDK | #22, #23 |
| 27 | Implement `SSS2Preset.deploySSS2()` | SDK | #26, #25 |
| 28 | Write SDK unit tests (full coverage pass) | Tests | #22–#27 |
| 29 | Implement `sss deploy` command | CLI | #26, #27, #3 |
| 30 | Implement `sss mint` command | CLI | #22, #3 |
| 31 | Implement `sss burn` command | CLI | #23, #3 |
| 32 | Implement `sss freeze` and `sss thaw` commands | CLI | #23, #3 |
| 33 | Implement `sss blacklist add` command | CLI | #24, #3 |
| 34 | Implement `sss blacklist remove` command | CLI | #24, #3 |
| 35 | Implement `sss blacklist check` and `list` commands | CLI | #25, #3 |
| 36 | Implement `sss seize` command | CLI | #25, #3 |
| 37 | Implement `sss info` command | CLI | #23, #25, #3 |
| 38 | Implement `sss events` command | CLI | #3 |
| 39 | Implement `sss validate` command | CLI | #3, #23, #25 |
| 40 | Write CLI E2E integration test scripts | Tests | #29–#39 |
| 41 | Implement `services/indexer` | Services | #1 |
| 42 | Implement `services/compliance-api` | Services | #24, #25, #1 |
| 43 | Implement `services/mint-coordinator` | Services | #22, #23, #1 |
| 44 | Deploy programs to Devnet | Deployment | #11, #18 |
| 45 | Deploy SSS-1 example token to Devnet | Deployment | #44, #29 |
| 46 | Deploy SSS-2 example token to Devnet | Deployment | #44, #29 |
| 47 | Run full Devnet smoke test | Deployment | #45, #46, #40 |
| 48 | Write `README.md` | Docs | #44–#46 |
| 49 | Write `docs/getting-started.md` | Docs | #3 |
| 50 | Write `docs/sss1-guide.md` | Docs | #26, #29 |
| 51 | Write `docs/sss2-guide.md` | Docs | #27, #29, #33–#36 |
| 52 | Write `docs/api-reference.md` | Docs | #23, #25–#27 |
| 53 | Write `docs/cli-reference.md` | Docs | #29–#39 |
| 54 | Write `docs/architecture.md` | Docs | #44 |
| 55 | Write `SECURITY.md` | Docs | #11, #18 |
| 56 | Add JSDoc to all exported SDK symbols | Docs | #28 |
| 57 | Create `examples/` directory with working scripts | Docs | #26, #27, #22, #24, #25 |
| 58 | Final test pass and coverage report | Release | #11, #18, #28, #40, #47 |
| 59 | Full codebase lint and format clean pass | Release | #11, #18, #28 |
| 60 | Tag `v1.0.0` and prepare submission artifacts | Release | #55–#59, #47, #48 |
