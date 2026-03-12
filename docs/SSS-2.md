# SSS-2: Compliant Stablecoin Standard

## Overview

SSS-2 is the regulated stablecoin standard. It extends SSS-1 with:
- **Permanent delegate** — the stablecoin PDA can move tokens in any account (enables seize)
- **Transfer hook** — checks every transfer against the on-chain blacklist
- **Default account state: frozen** — all new token accounts start frozen (KYC gate)
- **Blacklist PDAs** — each blacklisted address has an on-chain entry checked at transfer time

SSS-2 is appropriate for:
- USDC/USDT-class regulated stablecoins
- Issuers operating under banking or payment regulations
- Any token where regulators expect on-chain blacklist enforcement and asset recovery

## Token-2022 Extensions

| Extension | Enabled | Notes |
|-----------|---------|-------|
| MetadataPointer | Yes | Embedded metadata on the mint |
| MintCloseAuthority | Yes | Close mint when supply = 0 |
| PermanentDelegate | Yes | Stablecoin PDA as permanent delegate |
| TransferHook | Yes | sss-transfer-hook enforces blacklist |
| DefaultAccountState | Yes | New accounts start frozen |

## Program Config

```rust
StablecoinConfig {
    name: "Regulated USD",
    symbol: "RUSD",
    uri: "https://issuer.com/token.json",
    decimals: 6,
    enable_permanent_delegate: true,
    enable_transfer_hook: true,
    default_account_frozen: true,
}
```

## Additional Instructions (SSS-2 only)

| Instruction | Required Role | Notes |
|-------------|---------------|-------|
| add_to_blacklist | authority or blacklister | Creates blacklist PDA |
| remove_from_blacklist | authority or blacklister | Closes PDA (reclaims rent) |
| seize | authority or seizer | Must freeze account first |

These instructions fail with `ComplianceNotEnabled` if called on an SSS-1 stablecoin.

## Transfer Enforcement

When a Token-2022 transfer occurs on an SSS-2 mint:

1. Token-2022 invokes `sss-transfer-hook` via CPI
2. Hook derives blacklist PDA for source owner: `["blacklist", mint, source_owner]`
3. Hook derives blacklist PDA for destination owner: `["blacklist", mint, destination_owner]`
4. If either PDA has lamports (exists), transfer is rejected
5. Otherwise, transfer proceeds

The extra account metas are resolved automatically by Token-2022 using the `ExtraAccountMetaList` account seeded at `["extra-account-metas", mint]` on the transfer hook program.

## Seize Flow

```
1. blacklister: add_to_blacklist(address)     -- creates blacklist PDA
2. authority:   freeze_account(token_account)  -- freezes the token account
3. seizer:      seize(frozen_account, treasury, amount)  -- moves tokens to treasury
```

The seize instruction uses the stablecoin state PDA as the permanent delegate. It calls `transfer_checked` as the PDA — no user signature required.

## Default Account State: Frozen

With `default_account_frozen: true`, every new Token-2022 account for this mint starts frozen. This implements a **KYC gate**: users must be explicitly thawed by an authority before they can receive tokens.

This is the standard behavior for regulated stablecoins — tokens cannot be received until the holder passes identity verification.

## PDA Seeds

```
StablecoinState:  ["stablecoin", mint]
MinterRecord:     ["minter_record", mint, minter_pubkey]
BlacklistEntry:   ["blacklist", mint, address]  (on sss-core)
ExtraAccountMeta: ["extra-account-metas", mint]  (on sss-transfer-hook)
```

## SDK Preset

```typescript
import { SolanaStablecoin, Preset } from "@stbr/sss-token";

const stable = await SolanaStablecoin.create(provider, program, {
  preset: Preset.SSS_2,
  name: "Regulated USD",
  symbol: "RUSD",
  decimals: 6,
});

// Blacklist an address
await stable.compliance.blacklistAdd(authority, sanctionedAddress, "OFAC SDN match");

// Seize
await stable.compliance.seize(authority, frozenAccount, treasury, amount);
```

## CLI

```bash
sss-token init --preset sss-2 --name "Regulated USD" --symbol RUSD
sss-token blacklist add mytoken <address> --reason "OFAC SDN"
sss-token freeze mytoken <token-account>
sss-token seize mytoken <frozen-account> <treasury>
```

## Invariants

All SSS-1 invariants plus:
1. Transfers blocked for blacklisted source or destination owners
2. Seize requires frozen account
3. New token accounts start frozen
4. Seize only via permanent delegate (stablecoin PDA) — no raw token authority needed
