# SSS-1: Minimal Stablecoin Standard

## Overview

SSS-1 is the minimal viable stablecoin standard. It provides the essentials needed for any stablecoin: mint authority, freeze authority, and on-chain metadata — nothing more.

Compliance is **reactive** — operators freeze accounts as needed. This is appropriate for:
- Internal tokens and DAO treasuries
- Ecosystem settlement tokens
- Testnet/staging stablecoins
- Any issuer that doesn't require proactive on-chain blacklist enforcement

## Token-2022 Extensions

| Extension | Enabled | Notes |
|-----------|---------|-------|
| MetadataPointer | Yes | Points to embedded metadata on the mint itself |
| MintCloseAuthority | Yes | Authority can close the mint when supply = 0 |
| PermanentDelegate | No | Not needed for reactive compliance |
| TransferHook | No | No transfer-time enforcement |
| DefaultAccountState | No | Accounts start unfrozen |

## Program Config

```rust
StablecoinConfig {
    name: "My Stablecoin",
    symbol: "MUSD",
    uri: "https://example.com/token.json",
    decimals: 6,
    enable_permanent_delegate: false,
    enable_transfer_hook: false,
    default_account_frozen: false,
}
```

## Instructions

| Instruction | Required Role |
|-------------|---------------|
| initialize | authority (signer) |
| mint_tokens | minter record |
| burn_tokens | burner role or token account owner |
| freeze_account | authority or blacklister |
| thaw_account | authority or blacklister |
| pause | authority or pauser |
| unpause | authority or pauser |
| transfer_authority | authority |
| update_minter | authority |
| update_role | authority |

## PDA Seeds

```
StablecoinState: ["stablecoin", mint]
MinterRecord:    ["minter_record", mint, minter_pubkey]
```

## SDK Preset

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(provider, program, {
  preset: Preset.SSS_1,
  name: "My Stablecoin",
  symbol: "MUSD",
  decimals: 6,
});
```

## CLI

```bash
sss-token init --preset sss-1 --name "My Stablecoin" --symbol MUSD
```

## Invariants

1. Total minted across all minters never exceeds sum of active minter caps
2. Mint/burn fails when paused
3. Only authority or roles can freeze/thaw
4. Compliance instructions (`add_to_blacklist`, `seize`) always fail with `ComplianceNotEnabled`
