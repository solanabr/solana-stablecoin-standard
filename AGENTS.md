# AGENTS.md — Autonomous Agent Operating Manual
# Solana Stablecoin Standards SDK (SSS-SDK)

> **This file is authoritative.** Every AI agent working in this repository must read and comply with all instructions in this document before performing any work. No exceptions.

---

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Development Workflow](#3-development-workflow)
4. [Issue Execution Protocol](#4-issue-execution-protocol)
5. [Coding Standards](#5-coding-standards)
6. [Commit and Branching Rules](#6-commit-and-branching-rules)
7. [Testing Requirements](#7-testing-requirements)
8. [Documentation Rules](#8-documentation-rules)
9. [Safety Rules](#9-safety-rules)
10. [Agent Behavior Guidelines](#10-agent-behavior-guidelines)

---

## 1. Repository Overview

This repository implements the **Solana Stablecoin Standards SDK (SSS-SDK)** — an open-source developer toolkit analogous to OpenZeppelin on Ethereum. It provides opinionated, auditable, and composable primitives for creating and operating stablecoins on Solana using Token-2022 extensions.

The SDK ships two canonical stablecoin standards:

- **SSS-1 (Minimal Stablecoin):** A production-ready, permissioned stablecoin with mint/burn controls, freeze authority, and token metadata. Suitable for trusted-issuer models.
- **SSS-2 (Compliant Stablecoin):** Extends SSS-1 with blacklisting, permanent delegation for asset seizure, transfer hooks, and regulatory tooling. Suitable for fintechs and regulated institutions.

The complete authoritative product specification is located at `PRD.md` in the repository root. **The agent must read `PRD.md` before starting any issue.**

**Target network:** Solana Devnet (mainnet-ready architecture).

---

## 2. Architecture Overview

The system is organized into four layers:

```
LAYER 3: PRESETS          → SSS-1 (Minimal), SSS-2 (Compliant), Custom Configs
LAYER 2: MODULES          → Compliance Module (blacklist, seizure, transfer hooks)
LAYER 1: BASE SDK         → Token Creation, Mint/Burn, Freeze/Thaw, Role Mgmt, Metadata
SOLANA RUNTIME            → SPL Token-2022, Anchor Programs, Metaplex Metadata
```

### 2.1 Component Map

| Directory | Technology | Purpose |
|---|---|---|
| `programs/sss-base/` | Rust + Anchor | Base token operations: create, mint, burn, freeze, metadata |
| `programs/sss-compliance/` | Rust + Anchor | Blacklist, transfer hook, seizure |
| `sdk/` | TypeScript | Developer-facing SDK: `SSSClient`, `BaseModule`, `ComplianceModule`, presets |
| `cli/` | Node.js + Commander.js | Operator CLI: 12 core commands |
| `services/indexer/` | Node.js | Blockchain event listener + SQLite storage |
| `services/compliance-api/` | Node.js + Express | Blacklist management REST API |
| `services/mint-coordinator/` | Node.js | Mint/burn coordination with retry |
| `docs/` | Markdown | All user-facing documentation |
| `tests/` | Rust (Anchor), Jest, Bash | Unit, integration, and E2E tests |
| `deployments/` | JSON | Devnet deployment artifacts |

### 2.2 Anchor Programs (`programs/`)

**`programs/sss-base/src/`**
- `lib.rs` — program entrypoint, `declare_id!`
- `instructions/create_mint.rs` — creates Token-2022 mint with metadata
- `instructions/mint_tokens.rs` — mints to ATA, enforces authority + max supply + cooldown
- `instructions/burn_tokens.rs` — burns tokens, enforces authority
- `instructions/freeze_account.rs` — freezes token account
- `instructions/thaw_account.rs` — thaws token account
- `instructions/update_metadata.rs` — updates token metadata URI
- `state/mint_config.rs` — `MintConfig` PDA (seed: `["mint_config", mint]`)
- `events.rs` — `MintEvent`, `BurnEvent`, `FreezeEvent`, `ThawEvent`
- `errors.rs` — `SSSBaseError` codes

**`programs/sss-compliance/src/`**
- `lib.rs` — program entrypoint
- `instructions/init_blacklist.rs` — initializes `BlacklistRegistry` PDA
- `instructions/add_to_blacklist.rs` — adds `BlacklistEntry` PDA
- `instructions/remove_from_blacklist.rs` — removes `BlacklistEntry` PDA
- `instructions/seize_tokens.rs` — permanent delegate seizes tokens
- `instructions/execute_transfer_hook.rs` — Token-2022 `TransferHook` interface
- `state/blacklist_registry.rs` — `BlacklistRegistry` PDA (seed: `["blacklist_registry", mint]`)
- `state/blacklist_entry.rs` — `BlacklistEntry` PDA (seed: `["blacklist_entry", mint, wallet]`)
- `events.rs` — `BlacklistAddedEvent`, `BlacklistRemovedEvent`, `SeizureEvent`
- `errors.rs` — `SSSComplianceError` codes

### 2.3 TypeScript SDK (`sdk/src/`)

- `index.ts` — all public exports
- `client.ts` — `SSSClient` main class (accepts `Connection`, `Wallet`, optional config)
- `presets/sss1.ts` — `SSS1Preset` class, `deploySSS1(config: SSS1Config)`
- `presets/sss2.ts` — `SSS2Preset` class, `deploySSS2(config: SSS2Config)`
- `modules/base.ts` — `BaseModule`: `mint()`, `burn()`, `freeze()`, `thaw()`, `updateMetadata()`
- `modules/compliance.ts` — `ComplianceModule`: `addToBlacklist()`, `removeFromBlacklist()`, `isBlacklisted()`, `seize()`
- `types.ts` — all TypeScript interfaces (`SSS1Config`, `SSS2Config`, `DeploymentOutput`, etc.)
- `constants.ts` — deployed program IDs, PDA seeds, network endpoints
- `utils/` — PDA derivation helpers, decimal conversion, ATA creation

### 2.4 CLI (`cli/src/`)

- `index.ts` — CLI entrypoint, Commander.js root command
- `commands/` — one file per command: `deploy`, `mint`, `burn`, `freeze`, `thaw`, `blacklist-add`, `blacklist-remove`, `blacklist-check`, `seize`, `info`, `validate`, `config`
- `utils/` — keypair loading, config file parsing, RPC connection setup, pretty-print output

### 2.5 Backend Services (`services/`)

- `indexer/` — WebSocket subscriber to program logs; decodes Anchor events; writes to `events.db` (SQLite); exposes `GET /events`
- `compliance-api/` — Express REST API; manages blacklist state; LRU cache; routes: `POST /blacklist/add`, `POST /blacklist/remove`, `GET /blacklist/:address`, `POST /check`
- `mint-coordinator/` — REST API for mint/burn with transaction retry (exponential backoff, max 5 attempts); routes: `POST /mint`, `POST /burn`

### 2.6 Key Architectural Boundaries

- **On-chain enforcement is authoritative.** The transfer hook is the sole gate for blacklist enforcement at the protocol level. Off-chain services are advisory only.
- **The SDK wraps programs.** The SDK must not implement business logic that belongs in the Anchor program. Program instructions are the source of truth.
- **CLI wraps SDK.** The CLI must call SDK methods — it must never call Solana RPC directly or build raw transactions outside of the SDK layer.
- **Services are optional.** Backend services are standalone Node.js processes. They do not depend on each other (except compliance-api calling the compliance program via the SDK).

---

## 3. Development Workflow

### 3.1 Issue-Driven Development

All development in this repository is driven by GitHub Issues. The developer converts PRD sections into scoped GitHub Issues and the agent implements them one at a time.

**The agent's job is to implement exactly one issue per session.** No more, no less.

### 3.2 Work Order

The 7-day build plan in `PRD.md` Section 19 defines the intended sequencing:

| Day | Focus Area |
|---|---|
| 1 | Monorepo setup + `sss-base` program core (create_mint, mint_tokens, burn_tokens) |
| 2 | `sss-base` completion (freeze, thaw, metadata) + SSS-1 E2E test |
| 3 | `sss-compliance` program (blacklist, transfer hook, seize) + SSS-2 tests |
| 4 | TypeScript SDK (`SSSClient`, `BaseModule`, `ComplianceModule`, presets) |
| 5 | CLI tool (all 12 commands) |
| 6 | Devnet deployment + backend services (indexer, compliance-api) |
| 7 | Documentation, polish, final test pass, `v1.0.0` tag |

Issues will generally align with this sequence. The agent must not jump ahead or implement work from a future day unless the current issue explicitly includes it.

### 3.3 Source of Truth

The agent must treat the following files as authoritative, in this priority order:

1. **Current GitHub Issue** — defines the exact scope of work for this session
2. **`PRD.md`** — defines the full product specification, interfaces, and constraints
3. **`AGENTS.md`** (this file) — defines operating rules

If the issue conflicts with the PRD, flag the discrepancy in a comment on the issue and implement the PRD-compliant version unless the issue explicitly says to override the PRD.

---

## 4. Issue Execution Protocol

The agent **must follow these steps in order** for every issue. Do not skip steps.

### Step 1 — Read PRD.md
Open and read `PRD.md` in full (or the relevant sections) before writing any code. Identify which PRD sections are relevant to the current issue.

### Step 2 — Read the Current Issue
Read the issue title, description, and all acceptance criteria carefully. Identify:
- Exactly what must be implemented
- Exactly what must NOT be implemented (scope boundaries)
- Any referenced PRD sections, interfaces, or account structures

### Step 3 — Identify Affected Files
List every file that will need to be created or modified. Confirm that no out-of-scope files are on the list. If a required file does not exist, create it. If a file is not related to the issue, do not touch it.

### Step 4 — Verify Interfaces Before Coding
Before writing implementation code:
- Confirm TypeScript interfaces from `PRD.md` Section 9 match what you are about to write
- Confirm Anchor account structures from `PRD.md` Section 8 match what you are about to write
- Confirm CLI command signatures from `PRD.md` Section 10 match what you are about to write
- Confirm error codes from `PRD.md` Section 8.4 are used exactly as specified

### Step 5 — Implement the Issue Scope
Write code strictly within the issue's scope. Follow all coding standards in Section 5. Do not refactor adjacent code. Do not optimize unrelated functions.

### Step 6 — Write Tests
Write all required tests for the code introduced in this issue (see Section 7). Tests are not optional. Do not mark an issue complete without tests.

### Step 7 — Update Documentation
Update all affected documentation files (see Section 8). At minimum, update any JSDoc comments for new SDK methods and any relevant `docs/` files.

### Step 8 — Self-Review Checklist
Before committing, verify every item below:

- [ ] All acceptance criteria in the issue are satisfied
- [ ] No files outside the issue scope were modified
- [ ] All new Anchor instructions have authority checks and signer checks
- [ ] All new PDAs are validated with correct seeds and bump
- [ ] All new TypeScript exports are added to `sdk/src/index.ts`
- [ ] All new CLI commands are registered in `cli/src/index.ts`
- [ ] All new error codes match `PRD.md` Section 8.4 exactly
- [ ] All new events match `PRD.md` Section 8.5 exactly
- [ ] Tests pass (`anchor test` or `jest` or both, as applicable)
- [ ] JSDoc comments are present on all new exported SDK symbols
- [ ] Commit message follows the format in Section 6

### Step 9 — Commit
Create a single logical commit (or a small sequence of commits) following the rules in Section 6.

---

## 5. Coding Standards

### 5.1 Rust (Anchor Programs)

**Style and formatting:**
- Run `cargo fmt` before every commit. All Rust code must be `cargo fmt` clean.
- Run `cargo clippy -- -D warnings` and resolve all warnings before committing.
- Use `snake_case` for all variable, function, and module names.
- Use `PascalCase` for struct and enum names.
- Maximum line length: 100 characters.

**Anchor-specific rules:**
- Every instruction handler must have a corresponding `#[derive(Accounts)]` context struct in the same or adjacent file.
- Every account in a context struct that modifies state must be marked `#[account(mut)]`.
- Every signer that authorizes an operation must be a `Signer<'info>` — never use `AccountInfo` as a signer check substitute.
- Every PDA must be validated with `seeds` and `bump` constraints in the `#[account(...)]` attribute. Never derive a PDA manually inside an instruction handler without also constraining it in the context.
- Use `has_one` or `constraint` attributes to enforce account ownership relationships. Do not perform these checks in instruction body code when they can be done declaratively.
- Use `Box<InterfaceAccount<'info, Mint>>` for Token-2022 mint accounts (as shown in `PRD.md` Section 8.3).
- Use `InterfaceAccount<'info, TokenAccount>` for Token-2022 token accounts.
- All `/// CHECK:` comments must include a genuine explanation of why the account is safe — never leave them as boilerplate.

**Security requirements — non-negotiable:**
- All authority checks must be enforced. Callers of `mint_tokens` must be validated as `mint_authority`. Callers of `freeze_account` must be validated as `freeze_authority`. Callers of `add_to_blacklist` must be validated as `compliance_officer`. Callers of `seize_tokens` must be validated as `permanent_delegate`.
- `max_supply` checks must be applied inside `mint_tokens` before any token is minted.
- `mint_cooldown` checks must compare against `Clock::get()?.unix_timestamp`.
- Never use `unchecked_account` or skip validation to make a test pass.

**Error codes:**
- Use only error codes defined in `errors.rs` within each program. Never return generic Anchor errors where a domain-specific error code exists.
- Error enum variants must match `PRD.md` Section 8.4 exactly — same names, same messages.

**Events:**
- Every state-changing instruction must emit the corresponding event defined in `PRD.md` Section 8.5 using `emit!(...)`.
- Event struct fields must match the PRD exactly — do not add or remove fields.

**Account space:**
- Use `#[account(init, space = TypeName::INIT_SPACE, ...)]` with Anchor's `InitSpace` derive macro.
- Do not hardcode account sizes as magic numbers.

### 5.2 TypeScript (SDK)

**Style and formatting:**
- All TypeScript must compile with `tsc --strict`. No `any` types in exported interfaces.
- Use `prettier` formatting. Run before every commit.
- Use `eslint` with the project's `.eslintrc`. No lint errors on committed code.
- Use `camelCase` for variables and functions. Use `PascalCase` for classes and interfaces. Use `SCREAMING_SNAKE_CASE` for constants.

**Module structure:**
- Every SDK module (`base.ts`, `compliance.ts`) must be a class instantiated via `SSSClient`.
- All public methods must be `async` and return typed Promises. Never return `Promise<any>`.
- All amounts passed to SDK methods are in UI units (e.g., `"100.5"` for 100.5 tokens). The SDK handles decimal conversion internally using the `decimals` field from the mint.
- All public methods must throw typed `SSSError` instances (not raw `Error`) when operations fail. Include the error code and a human-readable message.

**Interfaces and types:**
- All TypeScript interfaces must match `PRD.md` Section 9 exactly. Do not rename fields.
- `SSS1Config` and `SSS2Config` interfaces must match `PRD.md` Section 7 exactly.
- Deployment output objects must match the JSON schemas in `PRD.md` Sections 7.1 and 7.2 exactly.

**PDA derivation:**
- All PDA derivation must use helper functions in `sdk/src/utils/`. Do not inline `PublicKey.findProgramAddressSync` calls in business logic.
- PDA seeds must match the Anchor program exactly:
  - MintConfig: `["mint_config", mint]`
  - BlacklistRegistry: `["blacklist_registry", mint]`
  - BlacklistEntry: `["blacklist_entry", mint, wallet]`
  - ExtraAccountMetaList: `["extra-account-metas", mint]`

**Constants:**
- All program IDs must live in `sdk/src/constants.ts`. Never hardcode program IDs elsewhere.
- After Devnet deployment, update `constants.ts` with the deployed program IDs.

**Exports:**
- Every new class, interface, function, and type that is part of the public API must be exported from `sdk/src/index.ts`.
- Do not expose internal utility functions in the public export.

### 5.3 CLI (`cli/`)

**Command structure:**
- One file per command in `cli/src/commands/`. Each file exports a single Commander.js `Command` object.
- All commands must be registered in `cli/src/index.ts` using `.addCommand()`.
- Command names, option flags, and argument structures must match `PRD.md` Section 10 exactly.

**Input and output:**
- All CLI commands must read keypairs from file paths specified by flags or from `OPERATOR_KEYPAIR_PATH` environment variable.
- Never hardcode keypairs or private keys.
- All successful command output must be printed as formatted JSON to stdout.
- All errors must be printed to stderr with a non-zero exit code.
- Use the project's shared pretty-printer utility — do not invent custom formatting per command.

**Environment:**
- All environment variables must be read via `dotenv` from a `.env` file at project root.
- Required env vars: `SOLANA_NETWORK`, `RPC_URL`, `OPERATOR_KEYPAIR_PATH`.
- Required env vars for compliance operations: `COMPLIANCE_OFFICER_KEYPAIR_PATH`.
- Required env vars for seizure operations: `PERMANENT_DELEGATE_KEYPAIR_PATH`.

**CLI → SDK boundary:**
- CLI commands must call SDK methods only. No raw `@solana/web3.js` transaction building in CLI code.
- No business logic in CLI commands. The CLI is a thin wrapper over the SDK.

### 5.4 Backend Services (`services/`)

- Services are standalone Node.js processes. Each has its own `package.json` and can be started independently.
- All services must handle process signals (`SIGINT`, `SIGTERM`) and shut down cleanly.
- Indexer must reconnect on WebSocket disconnect using exponential backoff (initial: 1s, max: 30s).
- Compliance API must return HTTP 400 for invalid inputs and HTTP 401 for missing/invalid API keys.
- Mint coordinator must retry failed transactions up to 5 times with exponential backoff.
- Use `zod` for all request body validation in Express routes.

### 5.5 Project Structure

```
/
├── Anchor.toml
├── Cargo.toml              (workspace)
├── package.json            (pnpm workspaces root)
├── PRD.md                  (authoritative product spec)
├── AGENTS.md               (this file)
├── README.md
├── SECURITY.md
├── .env.example            (template — never commit .env)
├── programs/
│   ├── sss-base/
│   └── sss-compliance/
├── sdk/
├── cli/
├── services/
│   ├── indexer/
│   ├── compliance-api/
│   └── mint-coordinator/
├── tests/
│   ├── anchor/             (Rust Anchor tests)
│   ├── sdk/                (Jest unit tests)
│   └── cli/                (Bash E2E scripts)
├── docs/
│   ├── getting-started.md
│   ├── sss1-guide.md
│   ├── sss2-guide.md
│   ├── api-reference.md
│   ├── cli-reference.md
│   └── architecture.md
├── deployments/            (Devnet deployment JSON artifacts)
└── keypairs/               (gitignored — operator keypairs)
```

---

## 6. Commit and Branching Rules

### 6.1 Branch Strategy

- `main` — stable, tested code only. All issues are merged into `main` via the issue workflow.
- Feature branches are named: `issue/<issue-number>-<short-slug>`
  - Example: `issue/12-compliance-blacklist-instructions`
- Never commit directly to `main` unless performing a solo development workflow where branching is optional. In that case, still follow commit message rules below.

### 6.2 Commit Message Format

All commits must follow this format:

```
<type>(<scope>): <short description>

[optional body — explain WHY if not obvious]

Closes #<issue-number>
```

**Types:**
- `feat` — new feature or instruction
- `fix` — bug fix
- `test` — adding or updating tests
- `docs` — documentation only
- `chore` — build config, tooling, dependency updates
- `refactor` — code restructuring without behavior change

**Scopes** (use exactly one per commit):
- `anchor-base` — changes to `programs/sss-base/`
- `anchor-compliance` — changes to `programs/sss-compliance/`
- `sdk` — changes to `sdk/`
- `cli` — changes to `cli/`
- `indexer` — changes to `services/indexer/`
- `compliance-api` — changes to `services/compliance-api/`
- `mint-coordinator` — changes to `services/mint-coordinator/`
- `tests` — changes to `tests/`
- `docs` — changes to `docs/` or root markdown files
- `deploy` — changes to deployment scripts or `deployments/`
- `config` — changes to `Anchor.toml`, `package.json`, workspace configs

**Examples:**
```
feat(anchor-base): implement create_mint instruction for SSS-1

Closes #3

feat(sdk): add BaseModule.mint() with decimal conversion

Closes #8

test(anchor-compliance): add negative tests for blacklist transfer rejection

Closes #14
```

### 6.3 Commit Granularity

- One logical unit of work per commit.
- Implementation code and its tests may be in the same commit.
- Documentation updates for a feature may be in the same commit as the feature, or a follow-up commit in the same issue session.
- Never bundle multiple unrelated changes into a single commit to "save time."

---

## 7. Testing Requirements

Tests are **mandatory**. No issue is complete without the required tests passing.

### 7.1 Anchor Program Tests (Rust)

- Location: `tests/anchor/`
- Framework: Anchor's built-in test framework (`anchor test`)
- Coverage target: ≥ 80% instruction coverage on both `sss-base` and `sss-compliance`
- Every error code must have at least one negative test that confirms the error is returned

**Required test cases for `sss-base`:**
- `create_mint` — valid SSS-1 creation; assert mint account exists and MintConfig PDA initialized
- `mint_tokens` — valid mint; assert supply increased; assert `MintEvent` emitted
- `mint_tokens` — by non-authority → expect `NotMintAuthority`
- `mint_tokens` — exceeds max supply → expect `MaxSupplyExceeded`
- `burn_tokens` — valid burn; assert supply decreased; assert `BurnEvent` emitted
- `freeze_account` → assert frozen; assert `FreezeEvent` emitted
- `freeze_account` — by non-freeze-authority → expect `NotFreezeAuthority`
- `thaw_account` → assert thawed; assert `ThawEvent` emitted
- SSS-1 end-to-end: deploy → mint → transfer → freeze → attempt-burn → thaw → burn

**Required test cases for `sss-compliance`:**
- `init_blacklist` — assert `BlacklistRegistry` PDA initialized
- `add_to_blacklist` — assert `BlacklistEntry` PDA created; assert `BlacklistAddedEvent` emitted
- `add_to_blacklist` — duplicate address → expect `AddressAlreadyBlacklisted`
- `add_to_blacklist` — by non-compliance-officer → expect `NotComplianceOfficer`
- `remove_from_blacklist` — assert entry removed; assert `BlacklistRemovedEvent` emitted
- `remove_from_blacklist` — non-existent address → expect `AddressNotBlacklisted`
- `execute_transfer_hook` — source blacklisted → expect `SourceBlacklisted`
- `execute_transfer_hook` — destination blacklisted → expect `DestinationBlacklisted`
- `execute_transfer_hook` — neither blacklisted → expect `Ok`
- `seize_tokens` — valid seizure; assert tokens moved; assert `SeizureEvent` emitted
- `seize_tokens` — by non-delegate → expect `NotPermanentDelegate`
- SSS-2 end-to-end: deploy → mint → blacklist address → attempt transfer → expect rejection → seize

### 7.2 SDK Unit Tests (Jest)

- Location: `tests/sdk/`
- Framework: Jest with `ts-jest`
- Coverage target: ≥ 70% line coverage on all SDK modules
- Use mocked RPC connections — do not hit live devnet in unit tests

**Required test cases:**
- `BaseModule.mint()` — mock RPC; assert instruction built with correct program ID, accounts, and amount (with decimal conversion)
- `BaseModule.burn()` — assert UI amount converted to raw units correctly
- `BaseModule.freeze()` / `thaw()` — assert correct token account passed
- `ComplianceModule.addToBlacklist()` — assert correct `BlacklistEntry` PDA derived
- `ComplianceModule.isBlacklisted()` — mock account fetch returning entry → assert `true`; mock null → assert `false`
- `SSS1Config` validation — assert all required fields checked; reject `decimals` outside 0–9
- `SSS2Config` validation — assert `hookProgramId` required; assert extends SSS1 validation
- `deploySSS1()` — assert deployment output matches schema in PRD Section 7.1
- `deploySSS2()` — assert deployment output matches schema in PRD Section 7.2

### 7.3 CLI Integration Tests (Bash)

- Location: `tests/cli/`
- Framework: Bash scripts run against a local validator or Devnet

**Required scripts:**
- `tests/cli/sss1-e2e.sh` — full SSS-1 lifecycle: deploy → mint → info → freeze → attempt-burn (expect error) → thaw → burn → info (assert supply)
- `tests/cli/sss2-e2e.sh` — full SSS-2 lifecycle: deploy → mint → blacklist-add → attempt-transfer (expect rejection) → seize → info

### 7.4 Running Tests

```bash
# Anchor tests (from repo root)
anchor test

# SDK unit tests
cd sdk && pnpm test

# CLI integration (requires running validator or devnet access)
bash tests/cli/sss1-e2e.sh
bash tests/cli/sss2-e2e.sh
```

All tests must pass before an issue is considered complete.

---

## 8. Documentation Rules

Documentation is **mandatory** for every issue that introduces or changes user-facing behavior.

### 8.1 Code-Level Documentation

**Rust (Anchor):**
- Every instruction handler function must have a doc comment (`///`) explaining:
  - What the instruction does
  - Who is authorized to call it (which role)
  - What accounts are required
  - What events are emitted on success
- Every error variant in `errors.rs` must have a comment explaining when it is triggered

**TypeScript (SDK):**
- Every exported class must have a JSDoc comment with a description and `@example`
- Every exported method must have JSDoc with `@param`, `@returns`, `@throws`, and `@example`
- Every exported interface must have JSDoc on the interface and on each field

**CLI:**
- Each command file must include a comment block describing the command, its flags, and an example invocation

### 8.2 Docs Directory

When an issue introduces a complete feature, the agent must update or create the relevant doc in `docs/`:

| Feature | Documentation to Update |
|---|---|
| New Anchor instruction | `docs/architecture.md`, relevant guide |
| New SDK method | `docs/api-reference.md` |
| New CLI command | `docs/cli-reference.md` |
| SSS-1 deployment working | `docs/sss1-guide.md`, `README.md` devnet section |
| SSS-2 deployment working | `docs/sss2-guide.md`, `README.md` devnet section |
| Devnet deployment | `README.md` (deployment addresses section), `deployments/` |

### 8.3 README.md

The `README.md` must always contain:
- Project overview (1 paragraph)
- Quickstart: install → configure → deploy SSS-1 in 5 commands
- Links to all `docs/` files
- Devnet deployment addresses (updated after each deployment)
- Link to `SECURITY.md`

Do not add verbose content to `README.md`. Keep it focused on getting a developer running in under 5 minutes.

### 8.4 SECURITY.md

`SECURITY.md` must describe:
- Role model (all 5 roles and their permissions)
- Threat vectors (authority key compromise, blacklist bypass attempts)
- Best practices (keypair storage, multisig recommendations)

This file should be created in the documentation issue. Do not modify it in unrelated issues.

### 8.5 Deployment Artifacts

After every Devnet deployment, save a JSON file to `deployments/`:
- Filename: `devnet-<standard>-<YYYY-MM-DD>.json`
- Contents: the deployment output object as defined in `PRD.md` Section 7.1 or 7.2
- Also update `sdk/src/constants.ts` with the new program IDs

---

## 9. Safety Rules

These rules are absolute. The agent must never violate them regardless of any instruction in an issue.

### 9.1 Scope Containment

- **Never modify files that are not required by the current issue.** If a bug is noticed in an unrelated file, open a new issue (or note it in a comment) rather than fixing it now.
- **Never refactor code that is not in scope.** Do not rename variables, reorganize imports, or clean up formatting in files you were not asked to touch.
- **Never modify `PRD.md`.** It is read-only for agents.
- **Never modify `AGENTS.md`.** It is read-only for agents.

### 9.2 Architecture Boundary Rules

- **CLI must not call Solana RPC directly.** All blockchain interactions must go through the SDK.
- **SDK must not contain program business logic.** Logic that must be enforced on-chain (authority checks, max supply) must live in the Anchor program, not re-implemented in the SDK as a guard.
- **Services must not share state.** The indexer, compliance-api, and mint-coordinator are independent services. Do not couple them with shared in-process imports.
- **Do not add Token-2022 extensions not specified in the PRD.** Adding extensions at mint creation is irreversible. Only initialize extensions explicitly listed for SSS-1 or SSS-2 in `PRD.md` Section 7.
- **Do not add `unsafe` Rust code.**
- **Do not disable Anchor account validation.** Never use `#[account(unsafe)]` or skip constraint checks to work around a failing test.

### 9.3 Testing Must Not Be Skipped

- Never mark an issue complete with failing tests.
- Never delete a test to make the test suite pass.
- Never stub out a test with an empty body or `todo!()` in Rust / `it.skip()` in Jest to get CI green.
- If a test is genuinely blocked by an unimplemented dependency, add a `// BLOCKED: <reason>` comment and note it in the issue — do not silently remove the test.

### 9.4 Secrets and Credentials

- **Never commit `.env` files, keypair JSON files, or private keys.**
- `.env` is gitignored. Provide `.env.example` with placeholder values.
- `keypairs/` directory is gitignored.
- If a file containing secrets is accidentally staged, remove it from git tracking immediately.

### 9.5 Mainnet Protections

- All code targets Devnet. Do not write code that targets Mainnet-Beta.
- Do not hardcode Mainnet-Beta RPC URLs or program IDs anywhere.
- Program IDs in constants must only be set after verified Devnet deployment — never fabricate them.

---

## 10. Agent Behavior Guidelines

These guidelines govern how the agent should reason, plan, and communicate.

### 10.1 Read Before You Write

Before producing any code for an issue:
1. Read `PRD.md` (or the relevant sections identified in the issue)
2. Read all existing files that will be modified
3. Read the interfaces, account structures, and error codes in the PRD that apply
4. Form a complete mental model of what the finished implementation looks like

Do not start writing code from memory. Verify every interface, seed, and error code name against the PRD before use.

### 10.2 Do Not Hallucinate Interfaces

- If you are unsure of an account structure, look it up in `PRD.md` Section 8. Do not invent account fields.
- If you are unsure of a TypeScript interface shape, look it up in `PRD.md` Section 9. Do not invent fields.
- If you are unsure of a CLI flag name, look it up in `PRD.md` Section 10. Do not invent flags.
- If something is genuinely ambiguous in the PRD, note the ambiguity explicitly in a comment and implement the most conservative interpretation (least authority granted, strictest validation).

### 10.3 One Issue at a Time

- Implement exactly what the current issue requires.
- If you identify work that should be done but is not in the current issue, do not implement it. Create a note in the issue or a comment in the code with `// TODO(issue #N):` referencing the appropriate issue number.
- If the current issue's scope is unclear, re-read the issue and the PRD section it references. Do not proceed by guessing.

### 10.4 Verify Your Work Before Committing

After writing all code, run through the self-review checklist in Section 4 Step 8. Check each item explicitly. Do not treat this as a formality.

For Rust code, confirm the code compiles with `cargo build-bpf` or `anchor build` before committing.
For TypeScript code, confirm `tsc --noEmit` passes before committing.
For tests, confirm `anchor test` or `jest` passes before committing.

### 10.5 Fail Loudly and Clearly

If the agent cannot complete an issue because:
- A dependency (another issue) has not been implemented yet
- The PRD is ambiguous in a way that affects the implementation
- A required account or interface cannot be derived from the PRD

Then the agent must **stop**, **not produce partial or speculative code**, and report exactly what is blocking progress and what information is needed to proceed.

Do not produce placeholder implementations silently. Do not write `// TODO: implement` stubs and commit them as complete. Incomplete work must be clearly labeled as incomplete.

### 10.6 Prefer Explicit Over Clever

- Prefer readable, explicit code over clever one-liners.
- Prefer named constants over magic numbers.
- Prefer separate, well-named functions over inline lambdas for non-trivial logic.
- Anchor programs in particular must be easy to audit. Clever Rust macros or unsafe patterns that obscure control flow are not acceptable.

### 10.7 Naming Consistency

Use the exact naming conventions from the PRD throughout the codebase:
- Anchor instructions: `create_mint`, `mint_tokens`, `burn_tokens`, `freeze_account`, `thaw_account`, `update_metadata`, `init_blacklist`, `add_to_blacklist`, `remove_from_blacklist`, `seize_tokens`, `execute_transfer_hook`
- SDK methods: `mint()`, `burn()`, `freeze()`, `thaw()`, `updateMetadata()`, `addToBlacklist()`, `removeFromBlacklist()`, `isBlacklisted()`, `seize()`, `deploySSS1()`, `deploySSS2()`
- CLI commands: `deploy`, `mint`, `burn`, `freeze`, `thaw`, `blacklist-add`, `blacklist-remove`, `blacklist-check`, `seize`, `info`, `validate`, `config`

Deviating from these names breaks compatibility between the SDK, CLI, and programs, and violates the PRD contract.

### 10.8 Token-2022 Extension Initialization Order

Token-2022 extensions must be initialized in the correct order at mint creation. Extensions cannot be added after a mint is created. Always cross-reference `PRD.md` Section 7 for the exact extension list for SSS-1 and SSS-2 before writing any `create_mint` logic.

**SSS-1 extensions:** `MintCloseAuthority`, `MetadataPointer`, `TokenMetadata`

**SSS-2 extensions (in addition to SSS-1):** `PermanentDelegate`, `TransferHook`

The transfer hook program must be deployed **before** creating an SSS-2 mint. The hook program ID is passed as `hookProgramId` in `SSS2Config`.

### 10.9 Windows & WSL Environments

If the host operating system is Windows and the primary toolchains (Node.js, Rust, Anchor, Solana CLI) are installed within the Windows Subsystem for Linux (WSL), the agent **must** execute all terminal build and test commands (e.g., `pnpm install`, `anchor build`, `cargo test`) through WSL rather than the native Windows shell.

When executing tools, ensure the shell runs interactively to load `.bashrc` or `.profile` paths, and properly route into the workspace directory (e.g. mapping `C:\` to `/mnt/c/`).

Example:
```bash
wsl --exec bash -i -c "cd /mnt/c/path/to/repository && pnpm build"
```

---

*Last updated: aligned with PRD.md v1.0 (Hackathon Edition)*
*This file must be kept in sync with PRD.md. Any architectural change that affects agent behavior must be reflected here.*
