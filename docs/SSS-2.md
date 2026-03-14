# SSS-2 Specification

SSS-2 extends SSS-1 with compliance controls.

## Mandatory additional capabilities

- `ComplianceRecord` PDA lookup keyed by `(mint, wallet)`.
- Token-2022 `PermanentDelegate` extension for seize path.
- Token-2022 `TransferHook` extension with blacklist checks.
- Additional instructions:
  - `add_to_blacklist`
  - `remove_from_blacklist`
  - `seize`

## Required runtime behavior

- transfer hook must check source and destination blacklist state
- paused mints must block transfers when hook enforcement is enabled
- seize path must route funds to treasury
- compliance records must be deterministic PDAs
- feature gates must prevent SSS-2-only instructions from working on non-compliance mints

## Feature gate behavior

- If compliance is disabled at initialization:
  - `add_to_blacklist`, `remove_from_blacklist`, `seize` fail with a deterministic program error.
- SDK surfaces this as `ComplianceDisabledError`.

## Intended use case

SSS-2 is the recommended preset for regulated fiat-backed stablecoins and other issuance environments where blacklist enforcement and asset recovery must be visible and auditable on-chain.
