# SSS-2 Specification

## Scope

SSS-2 extends SSS-1 with compliance controls and transfer policy enforcement.

## Required Extensions

- Permanent delegate enabled for seizure authority.
- Transfer hook support for blacklist-aware transfer validation.
- Optional default frozen account policy.
- Pause/unpause support for emergency transfer control.

## Compliance Instruction Surface

- `pause`
- `unpause`
- `add_to_blacklist`
- `remove_from_blacklist`
- `seize`

SSS-2 also inherits all SSS-1 instructions.

## Transfer Hook Interactions

- Transfer hook references blacklist entry PDAs per source and destination owner.
- Transfer must fail when either side is blacklisted.

## Account Model Additions

- `BlacklistedEntry` PDA per mint + wallet.
- Seizer authority PDA used as Token-2022 permanent delegate.

## Error Semantics

- Compliance operations must fail on SSS-1 mints.
- Seize must fail if permanent delegate extension is disabled.
