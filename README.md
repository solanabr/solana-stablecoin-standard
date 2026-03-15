# Solana Stablecoin Standard (SSS)

## Overview

A production-grade specification and reference implementation for issuing compliant stablecoins on Solana using Token-2022. SSS defines three preset tiers (SSS-1, SSS-2, SSS-3) that progressively add compliance, enforcement, and privacy capabilities through Token-2022 extensions.

Built with Anchor 0.31, the implementation ships as two on-chain programs plus a TypeScript SDK that wraps every instruction.

## Standards

### SSS-1: Minimal Stablecoin

Basic stablecoin with role-gated minting, burning, freeze/thaw, and pause. No compliance extensions — suitable for internal testnets or simple utility tokens.

**Extensions**: Metadata Pointer

### SSS-2: Compliant Stablecoin

Full regulatory-grade stablecoin with on-chain blacklist enforcement, permanent delegate for seizure, and per-transfer compliance checks via transfer hooks. Designed for issuers subject to sanctions screening, GENIUS Act, or MiCA.

**Extensions**: Metadata Pointer, Transfer Hook, Permanent Delegate

### SSS-3: Institutional Stablecoin

Extends SSS-2 with confidential transfer support for privacy-preserving balances and transfers. Permanent delegate and blacklist enforcement remain active.

**Extensions**: Metadata Pointer, Permanent Delegate, Confidential Transfers

## Architecture

```
                          ┌──────────────────────────────────────┐
                          │          SSS Token Program           │
                          │     (5ZBi...BcL4 — 20 instructions)  │
                          │                                      │
                          │  initialize    mint_tokens           │
                          │  burn_tokens   freeze/thaw           │
                          │  pause/unpause update_roles          │
                          │  update_minter blacklist_add/remove  │
                          │  allowlist_add/remove  seize         │
                          │  set_supply_cap  update_metadata     │
                          │  attest_reserve  transfer_authority  │
                          │  nominate_authority accept_authority  │
                          ├──────────────────────────────────────┤
                          │  State Accounts:                     │
                          │  StablecoinConfig | RoleRegistry     │
                          │  MinterInfo | BlacklistEntry         │
                          │  AllowlistEntry | ReserveAttestation │
                          └──────────┬───────────────────────────┘
                                     │ CPI (SSS-2 only)
                          ┌──────────▼───────────────────────────┐
                          │      SSS Transfer Hook Program       │
                          │    (FmujD...RJxy — 2 instructions)   │
                          │                                      │
                          │  initialize_extra_account_meta_list  │
                          │  transfer_hook (blacklist check)     │
                          │                                      │
                          │  Resolves BlacklistEntry PDAs for    │
                          │  source + destination on every       │
                          │  Token-2022 TransferChecked call     │
                          └──────────────────────────────────────┘

                          ┌──────────────────────────────────────┐
                          │         TypeScript SDK               │
                          │   (solana-stablecoin-standard)       │
                          │                                      │
                          │  SSSClient  — full instruction set   │
                          │  PDA helpers — all account addresses │
                          │  Presets    — SSS-1/2/3/Custom       │
                          │  Events    — transaction parsing     │
                          │  Oracle    — price feed module       │
                          └──────────────────────────────────────┘
```

## Programs

| Program | ID | Instructions | Description |
|---------|-----|:---:|-------------|
| **sss_token** | `5ZBiFxX4ggWfNR5VhAQDRZauG6CvG84puS4SQiH8BcL4` | 20 | Core stablecoin: mint, burn, freeze, blacklist, allowlist, seize, reserve attestation, authority management |
| **sss_transfer_hook** | `FmujD82V5FB6Nus7mbEV2a7cp5HG32gsiHykmtNSRJxy` | 2 | Token-2022 transfer hook: enforces blacklist on every transfer |

### Instruction Reference

| Instruction | Program | Access | Description |
|------------|---------|--------|-------------|
| `initialize` | token | authority | Create stablecoin with preset (SSS-1/2/3/Custom) |
| `mint_tokens` | token | minter | Mint with per-minter quota enforcement |
| `burn_tokens` | token | minter | Burn from recipient account |
| `freeze_account` | token | pauser | Freeze token account via Token-2022 |
| `thaw_account` | token | pauser | Unfreeze token account |
| `pause` | token | pauser | Halt all program operations |
| `unpause` | token | pauser | Resume operations |
| `update_roles` | token | authority | Assign pauser, blacklister, seizer roles |
| `update_minter` | token | authority | Enable/disable minters, set quotas |
| `transfer_authority` | token | authority | Legacy authority transfer (immediate) |
| `nominate_authority` | token | authority | Nominate new authority (two-step) |
| `accept_authority` | token | nominee | Accept nominated authority |
| `blacklist_add` | token | blacklister | Block address with reason (max 128 chars) |
| `blacklist_remove` | token | blacklister | Unblock address, close PDA |
| `allowlist_add` | token | authority | Allowlist address with reason (max 64 chars) |
| `allowlist_remove` | token | authority | Remove from allowlist |
| `seize` | token | seizer | Seize tokens from frozen account to treasury |
| `set_supply_cap` | token | authority | Set max supply (0 = unlimited) |
| `update_metadata` | token | authority | Update name, symbol, URI |
| `attest_reserve` | token | authority | Record reserve attestation with proof hash |
| `initialize_extra_account_meta_list` | hook | authority | Set up transfer hook account resolution |
| `transfer_hook` | hook | Token-2022 | Check blacklist on TransferChecked calls |

## Getting Started

```bash
# Build programs
anchor build

# Run tests (60 test cases)
anchor test

# Or run tests directly
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/sss-*.test.ts tests/sdk-*.test.ts
```

## Test Coverage

**60 tests** across 4 test suites:

| Suite | Tests | Covers |
|-------|:-----:|--------|
| SSS-1 | 16 | Initialize, mint, burn, freeze, thaw, pause/unpause, access control |
| SSS-2 | 12 | Blacklist, allowlist, seize, transfer hook enforcement, supply cap |
| SSS-3 | 9 | Confidential transfers, feature flag validation |
| SDK Integration | 23 | SSSClient methods, PDA derivation, account fetching |

**Trident fuzz testing** included via `trident-tests/` — property-based fuzzing for program invariants.

## Token-2022 Extensions

| Extension | SSS-1 | SSS-2 | SSS-3 | Purpose |
|-----------|:-----:|:-----:|:-----:|---------|
| Metadata Pointer | Yes | Yes | Yes | On-mint SPL metadata |
| Transfer Hook | — | Yes | — | Per-transfer blacklist enforcement |
| Permanent Delegate | — | Yes | Yes | Seize tokens without owner signature |
| Default Account State | — | opt | opt | Default new accounts to frozen |
| Confidential Transfers | — | — | Yes | Privacy-preserving balances |

## Security

- **`security_txt!`** macro on both programs — on-chain security contact per [solana-security-txt](https://github.com/nicholasgasior/solana-security-txt)
- **Role-based access control** — 4 roles (MasterAuthority, Pauser, Blacklister, Seizer) with strict separation
- **Two-step authority transfer** — nominate + accept pattern prevents accidental lockout
- **Pause mechanism** — emergency stop on all state-changing operations
- **Per-minter quotas** — individual mint limits prevent single-key compromise
- **Supply cap enforcement** — hard ceiling on total supply
- **Transfer hook defense-in-depth** — derives blacklist PDAs from token account owner field (offset 32), not caller, preventing delegate bypass
- **Checked arithmetic** — overflow protection on all counters
- **Trident fuzz harness** — property-based security fuzzing

## SDK Usage

```typescript
import { SSSClient } from "solana-stablecoin-standard";
import { buildInitializeParams, StablecoinPreset } from "solana-stablecoin-standard";
import { Connection, Keypair } from "@solana/web3.js";

// Initialize an SSS-2 compliant stablecoin
const client = new SSSClient(connection, wallet);

const params = buildInitializeParams(
  "USD Stablecoin",  // name
  "USDS",            // symbol
  "https://...",     // metadata URI
  6,                 // decimals
  StablecoinPreset.SSS2
);

const tx = await client.initialize(mintKeypair, params);

// Mint tokens (requires minter role)
await client.mint(mintKeypair.publicKey, recipientATA, 1_000_000);

// Blacklist an address (requires blacklister role)
await client.blacklistAdd(mintKeypair.publicKey, suspiciousAddress, "OFAC SDN match");

// Attest reserves
await client.attestReserve(mintKeypair.publicKey, {
  reserveHash: [...sha256Hash],
  totalReservesUsd: new BN(10_000_000),
  totalOutstanding: new BN(9_500_000),
  attestationUri: "https://audit.example.com/report-2026-Q1",
});
```

## Project Structure

```
programs/
  sss-token/           # Core stablecoin program (20 instructions)
    src/
      instructions/    # One file per instruction
      state.rs         # Account definitions
      events.rs        # 13 Anchor event types
      errors.rs        # Error codes
      lib.rs           # Program entry + security_txt!
  sss-transfer-hook/   # Transfer hook program
    src/lib.rs         # Blacklist enforcement on transfers

sdk/
  src/
    client.ts          # SSSClient class
    presets.ts          # SSS-1/2/3/Custom preset configs
    types.ts           # TypeScript interfaces
    pda.ts             # PDA derivation helpers
    events.ts          # Event parsing
    errors.ts          # Error mapping
    oracle.ts          # Price feed module
    constants.ts       # Program IDs, seeds
    idl/               # Program IDLs

tests/
  sss-1.test.ts        # SSS-1 integration tests
  sss-2.test.ts        # SSS-2 integration tests
  sss-3.test.ts        # SSS-3 integration tests
  sdk-integration.test.ts  # SDK client tests

examples/
  basic-setup/         # Initialize a stablecoin
  mint-and-burn/       # Mint and burn operations
  compliance-flow/     # Blacklist + freeze + seize workflow
  reserve-attestation/ # On-chain reserve proof

trident-tests/         # Property-based fuzz testing
```

## License

ISC
