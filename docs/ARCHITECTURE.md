# Architecture

## Layer Model

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3 — Standard Presets                             │
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │     SSS-1       │  │           SSS-2             │  │
│  │  Minimal        │  │  Compliant (regulated)      │  │
│  │  (internal,     │  │  Permanent delegate +       │  │
│  │   treasury,     │  │  Transfer hook +            │  │
│  │   settlement)   │  │  Blacklist enforcement      │  │
│  └─────────────────┘  └─────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Layer 2 — Compliance Module                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  sss-transfer-hook program                      │    │
│  │  - ExtraAccountMetaList (PDA)                   │    │
│  │  - execute(): blacklist PDA existence check     │    │
│  │  BlacklistEntry PDAs (per address)              │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  Layer 1 — Base SDK                                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │  sss-token program                              │    │
│  │  - Token-2022 mint (metadata + extensions)      │    │
│  │  - StablecoinConfig PDA                         │    │
│  │  - MinterInfo PDAs                              │    │
│  │  - Role-based access control                    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## On-chain Programs

### sss-token

The main program. Single configurable program supporting both presets via initialization parameters.

**Instructions:**
- Core: `initialize`, `mint_tokens`, `burn_tokens`, `freeze_token_account`, `thaw_token_account`, `pause`, `unpause`, `update_minter`, `update_roles`, `transfer_authority`
- SSS-2 only: `add_to_blacklist`, `remove_from_blacklist`, `seize`

**PDAs:**
```
StablecoinConfig:  seeds = ["config", mint]
MinterInfo:        seeds = ["minter", mint, minter_pubkey]
BlacklistEntry:    seeds = ["blacklist", mint, address]
```

### sss-transfer-hook

Standalone Token-2022 transfer hook program. Called by the Token-2022 program on every transfer for SSS-2 mints.

**Instructions:**
- `initialize_extra_account_meta_list`: registers the blacklist PDAs as required extra accounts
- `execute`: called on every transfer; checks BlacklistEntry PDA existence for sender and recipient

**Design decision:** Blacklist check via PDA existence (not content). If `BlacklistEntry` PDA exists → address is blacklisted. No deserialization needed in the hot transfer path.

## Token-2022 Extensions

### SSS-1
| Extension | Purpose |
|-----------|---------|
| `MintCloseAuthority` | Allows closing the mint when supply is zero |
| `MetadataPointer` | Points to inline metadata |
| `TokenMetadata` | On-chain name/symbol/uri |
| `FreezeAuthority` | Stored implicitly on the mint |
| `DefaultAccountState` | Optional: new accounts start frozen |

### SSS-2 (all SSS-1 extensions plus)
| Extension | Purpose |
|-----------|---------|
| `PermanentDelegate` | Config PDA can transfer/burn from any account |
| `TransferHook` | Token-2022 calls sss-transfer-hook on every transfer |

## Role-Based Access Control

```
Master Authority (authority)
  ├── Can execute all instructions
  ├── Can change any role
  └── Falls back to any role if role is unset

Minter (MinterInfo PDA)
  └── Can call mint_tokens (subject to quota)

Burner (config.burner)
  └── Can call burn_tokens

Pauser (config.pauser)
  └── Can call pause / unpause

Blacklister (config.blacklister) — SSS-2 only
  └── Can call add_to_blacklist / remove_from_blacklist

Seizer (config.seizer) — SSS-2 only
  └── Can call seize
```

The master authority can always act as any role. Optional roles (burner, pauser, etc.) can be set to `None`, in which case only the master authority can perform those actions.

## Security Model

1. **No single key controls everything.** Roles are separated. The minter cannot freeze. The pauser cannot mint.

2. **Mint authority = Config PDA.** The mint's `mint_to` authority is the `StablecoinConfig` PDA, not a human key. Only the program can mint via PDA signing.

3. **Freeze authority = Config PDA.** Same pattern — only the program can freeze/thaw.

4. **Permanent delegate = Config PDA.** The Token-2022 `PermanentDelegate` is the config PDA. Seize is only possible through the `seize` instruction, which enforces role checks.

5. **SSS-2 instructions fail gracefully on SSS-1 mints.** The `preset` field is checked in every SSS-2 instruction. Returns `InvalidPreset` error.

6. **Pause is global.** A paused contract rejects all mint and burn calls.

7. **Transfer hook is atomic.** The hook is called inside the Token-2022 transfer instruction. A blacklisted sender/recipient causes the entire transfer to fail.

## Data Flow: SSS-2 Transfer with Blacklist Check

```
User calls token_2022::transfer_checked(source, mint, dest, owner, amount)
          │
          ▼
Token-2022 program
  1. Validates balances and freeze status
  2. Reads TransferHook extension from mint
  3. Fetches ExtraAccountMetaList PDA (from sss-transfer-hook)
  4. Resolves extra accounts (blacklist PDAs for sender + receiver)
  5. Calls sss-transfer-hook::execute(source, mint, dest, owner, extra_meta_list,
                                       source_blacklist_pda, dest_blacklist_pda)
          │
          ▼
sss-transfer-hook::execute
  - If source_blacklist_pda.data.len() > 0 → Error: SenderBlacklisted
  - If dest_blacklist_pda.data.len() > 0 → Error: RecipientBlacklisted
  - Otherwise → Ok(())
          │
          ▼
Token-2022 resumes transfer (debit source, credit dest)
```
