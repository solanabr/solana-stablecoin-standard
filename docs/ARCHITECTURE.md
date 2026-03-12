# Architecture

## Layer Model

The SSS follows a three-layer architecture inspired by OpenZeppelin:

```
Layer 3 — Presets (SSS-1, SSS-2)
    Opinionated combinations of Layer 1 + Layer 2.
    These are the "standards" — what gets documented and adopted.

Layer 2 — Modules
    Composable pieces that add capabilities.
    - Compliance: blacklist PDAs, transfer hook, permanent delegate seize
    - Role management: minter quotas, burner, pauser, blacklister, seizer

Layer 1 — Base SDK
    Token-2022 mint creation, embedded metadata, freeze authority.
    TypeScript SDK + CLI + containerized backend services.
```

## On-Chain Programs

### sss-core

Single configurable program. The `StablecoinConfig` struct passed at `initialize` time determines which Token-2022 extensions are enabled.

Key accounts:
- **Mint** — Token-2022 mint with extensions based on preset
- **StablecoinState PDA** `["stablecoin", mint]` — stores config, roles, and pause state
- **MinterRecord PDA** `["minter_record", mint, minter]` — per-minter quota tracking
- **BlacklistEntry PDA** `["blacklist", mint, address]` — SSS-2 blacklist entries

The stablecoin PDA serves double duty as:
1. Freeze authority for `freeze_account` and `thaw_account`
2. Permanent delegate for `seize` (SSS-2 only)

### sss-transfer-hook

Invoked by Token-2022 on every transfer for SSS-2 mints. Checks if the source owner or destination owner is on the blacklist. Fails the transfer if so.

Uses `ExtraAccountMetaList` to derive the blacklist PDA seeds automatically — the client does not need to pass these manually.

## Token-2022 Extensions Used

| Extension | SSS-1 | SSS-2 | Purpose |
|-----------|-------|-------|---------|
| MetadataPointer | Yes | Yes | Points to embedded mint metadata |
| MintCloseAuthority | Yes | Yes | Authority can close the mint |
| PermanentDelegate | No | Yes | Stablecoin PDA can seize tokens |
| TransferHook | No | Yes | Calls sss-transfer-hook on every transfer |
| DefaultAccountState | No | Yes | New accounts start frozen (KYC gate) |

## Data Flow: SSS-2 Transfer

```
User A -> Token-2022 transferChecked -> SSS Transfer Hook
                                            |
                                            v
                                   Check blacklist PDA for A's owner
                                   Check blacklist PDA for B's owner
                                            |
                                    Not blacklisted?
                                            |
                                         Pass -> Transfer completes
                                         Fail -> Transaction rejected
```

## Data Flow: Seize

```
Seizer (authority or seizer role)
    -> seize instruction
    -> verify account is frozen
    -> PDA signs as permanent delegate
    -> transferChecked from frozen_account -> treasury
    -> emit TokensSeized event
```

## Role System

```
master_authority
├── can assign all roles
├── can transfer authority
├── can pause/unpause
└── is the initial minter

minter (per-keypair record)
├── has optional cap
├── tracks amount minted
└── can be deactivated

burner
└── can burn from any account they own

pauser
└── can pause/unpause

blacklister (SSS-2)
└── can add/remove from blacklist

seizer (SSS-2)
└── can seize from frozen accounts
```

## Security Considerations

1. **No single point of failure** — roles are separate. Compromising a minter doesn't give seizer power.
2. **Permanent delegate is a PDA** — not an EOA. Cannot be phished.
3. **Transfer hook cannot be bypassed** — it is enforced by Token-2022 protocol itself.
4. **Blacklist is on-chain** — no off-chain dependency during transfers.
5. **Freeze before seize** — seize requires the account to be frozen first. Two-step process prevents accidents.
6. **Minter quotas** — each minter has a capped total. Compromise of one minter cannot drain reserves.
