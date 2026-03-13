# Architecture

## Layer Model

The repository follows a three-layer model:

1. Base SDK: Anchor programs, TypeScript SDK, CLI, and backend services.
2. Modules: compliance, registry, transfer-hook, and experimental confidential-compliance capabilities that can be turned on per deployment.
3. Presets: SSS-1, SSS-2, and SSS-3 as opinionated, documented combinations.

## Why The Layering Matters

The repository is intentionally split so that standards adoption and issuer customization do not fight each other:

- Layer 1 gives teams a reusable issuance toolkit
- Layer 2 keeps high-surface-area features optional and independently testable
- Layer 3 turns the most common issuance patterns into named standards that third parties can recognize and integrate

That structure is what allows the repo to behave like OpenZeppelin for stablecoins instead of a single hard-coded product template.

## Core PDAs

| Account | Seeds | Purpose |
|---|---|---|
| StablecoinConfig | `[b"stablecoin_config", mint]` | Global token configuration |
| RoleAssignment | `[b"role", mint, role_byte, holder]` | Per-role assignment with optional minter quota |
| BlacklistEntry | `[b"blacklist", mint, address]` | Blacklist record for SSS-2 |
| RegistryConfig | `[b"sss_registry_config"]` | Global authority/config for SSS Registry |
| ReleaseRecord | `[b"sss_release", standard_version]` | Published SSS release/version metadata |
| StablecoinRegistration | `[b"sss_stablecoin", mint]` | On-chain stablecoin discovery record |

## Registry Surface

The SDK, backend, and new on-chain `sss-registry` program expose a registry entry schema that carries:

- `preset`
- `standardVersion`
- `configHash`
- immutable feature flags and metadata
- upgrade/release records for registry-driven deprecation checks

Wallets and DeFi protocols can query the registry program to answer two questions:

- is this mint a registered SSS deployment?
- is this deployment running a deprecated SSS release/config line?

This is strategically important because it turns SSS from a developer toolkit into a verifiable ecosystem standard. Integrators do not need to trust issuer marketing or ad hoc docs; they can query the registry directly.

## SSS-3 Privacy And Compliance Model

SSS-3 combines three layers of behavior:

- Token-2022 confidential transfers hide amounts
- ZK compliance proof receipts attest that a transfer subject passed compliance screening
- compressed compliance roots allow large deny/allow sets to be represented cheaply

These capabilities are part of protocol config and registry identity, and the proof path is enforced on-chain through the stablecoin program plus transfer-hook program. The compressed-root model keeps compliance state scalable without inflating per-address storage costs.

## Security Model

The master authority initializes the token and delegates operational permissions through `RoleAssignment` PDAs. Token-level mint, freeze, transfer-hook, and permanent-delegate powers are assigned to the stablecoin config PDA, so the program can enforce role-gated mint, freeze/thaw, blacklist, pause, and seizure flows without handing those authorities directly to operators. SSS-2 capability flags are immutable after initialization.

The practical effect is that no single operator key needs to control issuance, emergency pause, blacklist actions, and seizure powers at the same time. That separation is important for regulated deployments and internal auditability.

## Token-2022 Footgun

When enabling Token-2022 extensions, initialize mint extensions before `initialize_mint2`. The intended order is `create_account -> initialize extensions -> initialize_mint2`.
