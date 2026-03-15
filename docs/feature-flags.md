# SSS — Feature Flags Reference

> **SDK class:** `FeatureFlagsModule` (`sdk/src/FeatureFlagsModule.ts`)
> **Added:** SSS-059 | **Updated:** SSS-060 (FLAG_SPEND_POLICY — SSS-063), SSS-065 (FLAG_DAO_COMMITTEE — SSS-067), SSS-070 (FLAG_YIELD_COLLATERAL), SSS-075 (FLAG_ZK_COMPLIANCE)

---

## Overview

The SSS feature-flags system lets operators toggle on-chain behaviour for a
specific stablecoin mint without redeploying the token program.  Flags are
stored as a **`u64` bitmask** in `StablecoinConfig.feature_flags`.

Each bit is an independent boolean switch.  Setting a flag activates the
corresponding behaviour; clearing it deactivates it.

---

## Flag Constants

| Constant | Bit | Hex | Description |
|---|---|---|---|
| `FLAG_CIRCUIT_BREAKER` | 0 | `0x01` | Halts all mint and burn operations for the token until cleared. |
| `FLAG_SPEND_POLICY` | 1 | `0x02` | Enforces a per-transaction transfer cap (`max_transfer_amount`). Enabled atomically by `set_spend_limit`. |
| `FLAG_DAO_COMMITTEE` | 2 | `0x04` | Gates privileged admin operations behind on-chain proposals that require committee quorum approval. Enabled atomically by `init_dao_committee`. |
| `FLAG_YIELD_COLLATERAL` | 3 | `0x08` | Enables yield-bearing SPL tokens (e.g. stSOL, mSOL) as CDP collateral. Enabled atomically by `init_yield_collateral`. SSS-3 only. |
| `FLAG_ZK_COMPLIANCE` | 4 | `0x10` | Enforces zero-knowledge proof verification on transfers: sender must hold a valid, non-expired `VerificationRecord` PDA. Enabled atomically by `init_zk_compliance`. SSS-2 only. |

> **Reserved bits:** bits 5–63 are reserved for future protocol flags.
> Do not set them directly.

---

### `FLAG_CIRCUIT_BREAKER`

```typescript
export const FLAG_CIRCUIT_BREAKER = 1n << 0n; // 0x01
```

**Anchor constant:**
```rust
pub const FLAG_CIRCUIT_BREAKER: u64 = 1 << 0; // 0x01
```

When `FLAG_CIRCUIT_BREAKER` is set in `StablecoinConfig.feature_flags`:

- The token program **rejects** all `mintTo` and `burnFrom` instructions with
  `SssError::CircuitBreakerActive`.
- `pause()` / `unpause()` continue to work normally (they are orthogonal).
- Transfer and freeze instructions are **not** affected.
- The flag persists until explicitly cleared by the admin authority.

**Use case:** emergency halt in response to an exploit or regulatory event,
without a full pause (which also freezes governance operations).

---

### `FLAG_SPEND_POLICY`

```typescript
export const FLAG_SPEND_POLICY = 1n << 1n; // 0x02
```

**Anchor constant:**
```rust
pub const FLAG_SPEND_POLICY: u64 = 1 << 1; // 0x02
```

When `FLAG_SPEND_POLICY` is set in `StablecoinConfig.feature_flags`:

- Every transfer instruction checks `transfer_amount <= config.max_transfer_amount`.
- Transfers exceeding the cap are rejected with `SssError::SpendLimitExceeded`.
- The cap is set atomically when calling `set_spend_limit` — the flag is never
  left set with `max_transfer_amount == 0`.
- Clearing is done via `clear_spend_limit`, which zeros `max_transfer_amount`
  and clears the flag atomically.

**Use case:** regulatory spend controls or rate-limiting per transaction for
compliance-sensitive token issuers (SSS-2 / SSS-3 presets).

> **Note:** `FLAG_SPEND_POLICY` is managed via the dedicated `set_spend_limit` /
> `clear_spend_limit` instructions (not `set_feature_flag` / `clear_feature_flag`).
> Setting it directly via `set_feature_flag` without configuring
> `max_transfer_amount` first will leave the policy in an unconfigured state.

---

### `FLAG_DAO_COMMITTEE`

```typescript
export const FLAG_DAO_COMMITTEE = 1n << 2n; // 0x04
```

**Anchor constant:**
```rust
pub const FLAG_DAO_COMMITTEE: u64 = 1 << 2; // 0x04
```

When `FLAG_DAO_COMMITTEE` is set in `StablecoinConfig.feature_flags`:

- The following admin operations **require a passed on-chain proposal** before
  they can execute: `pause`, `unpause`, `set_feature_flag`, `clear_feature_flag`,
  `update_minter`, `revoke_minter`.
- Proposals must collect at least `quorum` YES votes from registered
  `DaoCommitteeConfig` members before `execute_action` can apply the action.
- The flag is enabled atomically by `init_dao_committee` (sets members + quorum).
- It cannot be cleared via `clear_feature_flag` alone; the committee governs itself.

**Use case:** decentralised governance for high-value stablecoin issuers who
require multi-party approval for sensitive protocol operations.

> **Note:** `FLAG_DAO_COMMITTEE` is managed via the dedicated DAO instructions
> (`init_dao_committee`, `propose_action`, `vote_action`, `execute_action`),
> not via `set_feature_flag` / `clear_feature_flag`.

#### DAO Committee PDAs

| PDA | Seeds | Description |
|---|---|---|
| `DaoCommitteeConfig` | `["dao-committee", config]` | Tracks member list, quorum, and next proposal ID. |
| `ProposalPda` | `["dao-proposal", config, proposal_id (u64 LE)]` | Single proposal: action, votes, execution state. |

#### `ProposalAction` Enum

| Variant | `param` | `target` | Description |
|---|---|---|---|
| `Pause` (0) | — | — | Pause the mint. |
| `Unpause` (1) | — | — | Unpause the mint. |
| `SetFeatureFlag` (2) | flag bits (`u64`) | — | OR flag bits into `feature_flags`. |
| `ClearFeatureFlag` (3) | flag bits (`u64`) | — | AND-NOT flag bits out of `feature_flags`. |
| `UpdateMinter` (4) | new cap (`u64`) | minter `Pubkey` | Update minter cap (via dedicated instruction). |
| `RevokeMinter` (5) | — | minter `Pubkey` | Revoke minter (via dedicated instruction). |

#### DAO Error Codes

| Error | Description |
|---|---|
| `SssError::DaoCommitteeRequired` | Admin op attempted without a passed proposal when FLAG_DAO_COMMITTEE is set. |
| `SssError::NotACommitteeMember` | Voter is not in `DaoCommitteeConfig.members`. |
| `SssError::AlreadyVoted` | Committee member already voted YES on this proposal. |
| `SssError::ProposalAlreadyExecuted` | Proposal was already executed (one-shot). |
| `SssError::ProposalCancelled` | Proposal was cancelled and cannot be voted on or executed. |
| `SssError::QuorumNotReached` | `execute_action` called before sufficient YES votes collected. |
| `SssError::InvalidQuorum` | `quorum` < 1 or > `members.len()`. |
| `SssError::CommitteeFull` | Member list exceeds maximum of 10. |

---

### `FLAG_YIELD_COLLATERAL`

```typescript
export const FLAG_YIELD_COLLATERAL = 1n << 3n; // 0x08
```

**Anchor constant:**
```rust
pub const FLAG_YIELD_COLLATERAL: u64 = 1 << 3; // 0x08
```

When `FLAG_YIELD_COLLATERAL` is set in `StablecoinConfig.feature_flags`:

- Yield-bearing SPL token mints (e.g. stSOL, mSOL) listed in the
  `YieldCollateralConfig` PDA are accepted as CDP collateral deposits.
- Only valid for **SSS-3** (reserve-backed) stablecoins.
- The flag is enabled atomically by `init_yield_collateral`.
- Whitelisted mints are managed via `add_yield_collateral_mint` (authority only; max 8 mints).

**Use case:** allow stablecoin CDPs to accept liquid staking tokens and other
yield-bearing assets as collateral, enabling yield to accrue inside the vault.

> **Note:** `FLAG_YIELD_COLLATERAL` is managed via the dedicated
> `init_yield_collateral` / `add_yield_collateral_mint` instructions,
> not via `set_feature_flag` / `clear_feature_flag`.

#### `YieldCollateralConfig` PDA

Seeds: `["yield-collateral", mint]`

| Field | Type | Description |
|---|---|---|
| `sss_mint` | `Pubkey` | The stablecoin mint this config governs. |
| `whitelisted_mints` | `Vec<Pubkey>` (max 8) | Accepted yield-bearing collateral mint addresses. |
| `bump` | `u8` | PDA bump. |

#### Yield Collateral Error Codes

| Error | Description |
|---|---|
| `SssError::YieldCollateralNotEnabled` | `add_yield_collateral_mint` called before `FLAG_YIELD_COLLATERAL` is set. |
| `SssError::WhitelistFull` | Whitelist already contains 8 mints; cannot add more. |
| `SssError::MintAlreadyWhitelisted` | Collateral mint is already in the whitelist. |
| `SssError::InvalidPreset` | `init_yield_collateral` called on a non-SSS-3 stablecoin. |

---

### `FLAG_ZK_COMPLIANCE`

```typescript
export const FLAG_ZK_COMPLIANCE = 1n << 4n; // 0x10
```

**Anchor constant:**
```rust
pub const FLAG_ZK_COMPLIANCE: u64 = 1 << 4; // 0x10
```

When `FLAG_ZK_COMPLIANCE` is set in `StablecoinConfig.feature_flags`:

- Every transfer via the transfer-hook checks that the sender holds a valid
  `VerificationRecord` PDA that has not expired.
- Users obtain or refresh a record by calling `submit_zk_proof`.
- Records expire after `ZkComplianceConfig.ttl_slots` (default 1500 slots ≈ ~10 minutes).
- Authority may reclaim rent from expired records via `close_verification_record`.
- Only valid for **SSS-2** (compliant) stablecoins — requires a transfer hook.

**Use case:** enforce zero-knowledge proof-based identity/compliance verification on
every token transfer, ensuring all participants have recent valid ZK attestations.

> **Note:** `FLAG_ZK_COMPLIANCE` is managed via the dedicated
> `init_zk_compliance`, `submit_zk_proof`, and `close_verification_record`
> instructions. In production, off-chain compliance oracles verify ZK proofs
> before calling `submit_zk_proof` on behalf of users.

#### Transfer-hook integration

The transfer-hook validates ZK compliance at index 7 of extra account metas:

- Extra account meta index 7: `VerificationRecord` PDA — seeds `["zk-verification", mint(1), owner(3)]`
- Rejects with `HookError::ZkRecordMissing` if the record PDA does not exist.
- Rejects with `HookError::ZkRecordExpired` if `Clock::slot >= record.expires_at_slot`.

#### `ZkComplianceConfig` PDA

Seeds: `["zk-compliance-config", mint]`

| Field | Type | Description |
|---|---|---|
| `sss_mint` | `Pubkey` | The stablecoin mint this config governs. |
| `ttl_slots` | `u64` | Validity window for `VerificationRecord`s (default 1500 slots). |
| `bump` | `u8` | PDA bump. |

#### `VerificationRecord` PDA

Seeds: `["zk-verification", mint, user]`

| Field | Type | Description |
|---|---|---|
| `sss_mint` | `Pubkey` | The stablecoin mint. |
| `user` | `Pubkey` | The wallet whose ZK compliance is attested. |
| `expires_at_slot` | `u64` | Slot at which this record expires (`submit_slot + ttl_slots`). |
| `bump` | `u8` | PDA bump. |

#### ZK Compliance Error Codes

| Error | Description |
|---|---|
| `SssError::ZkComplianceNotEnabled` | `submit_zk_proof` called when `FLAG_ZK_COMPLIANCE` is not set. |
| `SssError::VerificationExpired` | Transfer attempted with an expired `VerificationRecord`. |
| `SssError::VerificationRecordNotExpired` | `close_verification_record` called before the record has expired. |
| `SssError::VerificationRecordMissing` | Transfer attempted with no `VerificationRecord` PDA present. |
| `SssError::InvalidPreset` | `init_zk_compliance` called on a non-SSS-2 stablecoin. |

#### ZK Compliance Workflow

```typescript
import { Program } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

const program = new Program(idl, provider);
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from('stablecoin-config'), mint.toBuffer()],
  programId
);
const [zkConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from('zk-compliance-config'), mint.toBuffer()],
  programId
);

// 1. Initialize ZK compliance (SSS-2 stablecoins; authority only)
// ttl_slots = 0 uses the default of 1500 slots
await program.methods
  .initZkCompliance(new BN(0))
  .accounts({ authority: provider.wallet.publicKey, mint, config, zkComplianceConfig: zkConfig })
  .rpc({ commitment: 'confirmed' });

// 2. User (or oracle on their behalf) submits ZK proof
const [record] = PublicKey.findProgramAddressSync(
  [Buffer.from('zk-verification'), mint.toBuffer(), userWallet.publicKey.toBuffer()],
  programId
);
await program.methods
  .submitZkProof()
  .accounts({
    user: userWallet.publicKey,
    config,
    mint,
    zkComplianceConfig: zkConfig,
    verificationRecord: record,
  })
  .signers([userWallet])
  .rpc({ commitment: 'confirmed' });

// 3. Authority closes an expired record (rent reclaim)
await program.methods
  .closeVerificationRecord()
  .accounts({
    authority: provider.wallet.publicKey,
    config,
    mint,
    recordOwner: userWallet.publicKey,
    verificationRecord: record,
  })
  .rpc({ commitment: 'confirmed' });
```

---

## Error Codes

| Error | Code | Description |
|---|---|---|
| `SssError::CircuitBreakerActive` | — | Returned on `mintTo` / `burnFrom` when `FLAG_CIRCUIT_BREAKER` is set. |
| `SssError::SpendLimitExceeded` | — | Returned by transfer-hook when transfer amount > `max_transfer_amount`. |
| `SssError::SpendPolicyNotConfigured` | — | Returned by `set_spend_limit` when `max_amount` is 0. |
| `SssError::YieldCollateralNotEnabled` | — | `add_yield_collateral_mint` called before flag is active. |
| `SssError::WhitelistFull` | — | Yield collateral whitelist is at max capacity (8). |
| `SssError::MintAlreadyWhitelisted` | — | Collateral mint is already in the whitelist. |
| `SssError::ZkComplianceNotEnabled` | — | `submit_zk_proof` called when flag is not active. |
| `SssError::VerificationExpired` | — | Returned by transfer-hook when `VerificationRecord` is expired. |
| `SssError::VerificationRecordNotExpired` | — | `close_verification_record` called before expiry. |
| `SssError::VerificationRecordMissing` | — | Transfer attempted with no `VerificationRecord` PDA. |
| `SssError::Unauthorized` | — | Signer is not the admin authority for any flag write. |

---

## Import

```typescript
import {
  FeatureFlagsModule,
  FLAG_CIRCUIT_BREAKER,
  FLAG_SPEND_POLICY,
  FLAG_DAO_COMMITTEE,
  FLAG_YIELD_COLLATERAL,
  FLAG_ZK_COMPLIANCE,
} from '@stbr/sss-token';
// or, from the SDK source directly:
import {
  FeatureFlagsModule,
  FLAG_CIRCUIT_BREAKER,
  FLAG_SPEND_POLICY,
  FLAG_DAO_COMMITTEE,
  FLAG_YIELD_COLLATERAL,
  FLAG_ZK_COMPLIANCE,
} from '@sss/sdk';
```

> **Note:** `FLAG_DAO_COMMITTEE`, `FLAG_YIELD_COLLATERAL`, and `FLAG_ZK_COMPLIANCE`
> are exported from `@stbr/sss-token` but their management instructions are called
> directly via the Anchor `Program` object (no SDK module wrapper in this release).

---

## Instantiation

```typescript
import { AnchorProvider } from '@coral-xyz/anchor';
import { FeatureFlagsModule } from '@sss/sdk';

const ff = new FeatureFlagsModule(provider, programId);
```

| Parameter | Type | Description |
|---|---|---|
| `provider` | `AnchorProvider` | Anchor provider; wallet must be admin authority for writes. |
| `programId` | `PublicKey` | Deployed SSS token program ID. |

---

## Methods

### `setFeatureFlag(params)`

Set a feature-flag bit on the `StablecoinConfig` for the given mint.

```typescript
await ff.setFeatureFlag({ mint, flag: FLAG_CIRCUIT_BREAKER });
```

Calls the `set_feature_flag` Anchor instruction.
The connected wallet **must be the admin authority**.

> **Note for `FLAG_SPEND_POLICY`:** use `set_spend_limit` (see below) rather
> than `setFeatureFlag` to ensure `max_transfer_amount` is configured atomically.

| Parameter | Type | Description |
|---|---|---|
| `mint` | `PublicKey` | Stablecoin mint address. |
| `flag` | `bigint` | Flag constant (e.g. `FLAG_CIRCUIT_BREAKER`). |

**Returns:** `Promise<TransactionSignature>`

**Errors:**
- `SssError::Unauthorized` — signer is not the admin authority.

---

### `clearFeatureFlag(params)`

Clear a feature-flag bit, reverting the associated behaviour.

```typescript
await ff.clearFeatureFlag({ mint, flag: FLAG_CIRCUIT_BREAKER });
```

Calls the `clear_feature_flag` Anchor instruction.
The connected wallet **must be the admin authority**.

> **Note for `FLAG_SPEND_POLICY`:** use `clear_spend_limit` (see below) to
> zero `max_transfer_amount` atomically alongside clearing the flag.

| Parameter | Type | Description |
|---|---|---|
| `mint` | `PublicKey` | Stablecoin mint address. |
| `flag` | `bigint` | Flag constant to clear. |

**Returns:** `Promise<TransactionSignature>`

---

### `isFeatureFlagSet(mint, flag)`

Check whether a specific flag is active for the given mint.  Pure read —
does **not** require a transaction.

```typescript
const active = await ff.isFeatureFlagSet(mint, FLAG_CIRCUIT_BREAKER);
console.log('Circuit breaker active:', active);
```

Reads `StablecoinConfig.feature_flags` directly from raw account data
without an IDL.  Returns `false` if the config account does not exist yet.

| Parameter | Type | Description |
|---|---|---|
| `mint` | `PublicKey` | Stablecoin mint to inspect. |
| `flag` | `bigint` | Flag bit to test. |

**Returns:** `Promise<boolean>`

---

### `getFeatureFlags(mint)`

Read the full `feature_flags` bitmask for the given mint.  Returns `0n` if
the config account does not exist.

```typescript
const flags = await ff.getFeatureFlags(mint);
console.log('Raw feature flags:', flags.toString(16)); // e.g. "03"
```

**Returns:** `Promise<bigint>`

---

### `getConfigPda(mint)`

Derive the `StablecoinConfig` PDA for the given mint.

```typescript
const [configPda, bump] = ff.getConfigPda(mint);
```

Seeds: `["stablecoin-config", mint]` on `programId`.

**Returns:** `[PublicKey, number]`

---

## Spend Policy Methods (via Anchor program directly)

`FLAG_SPEND_POLICY` is managed through dedicated instructions that keep
the flag and `max_transfer_amount` in sync atomically.

### `set_spend_limit` (Anchor instruction)

Set the per-transaction transfer cap and atomically enable `FLAG_SPEND_POLICY`.

```typescript
import { BN } from '@coral-xyz/anchor';

const program = new Program(idl, provider);
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from('stablecoin-config'), mint.toBuffer()],
  programId
);

// Set cap to 10,000 tokens (with 6 decimals = 10_000_000_000 raw)
await program.methods
  .setSpendLimit(new BN(10_000_000_000))
  .accounts({ authority: provider.wallet.publicKey, mint, config })
  .rpc({ commitment: 'confirmed' });
```

| Parameter | Type | Description |
|---|---|---|
| `max_amount` | `u64` | Maximum tokens per transfer (raw units). Must be > 0. |

**Errors:**
- `SssError::SpendPolicyNotConfigured` — `max_amount` is 0.
- `SssError::Unauthorized` — signer is not the admin authority.

---

### `clear_spend_limit` (Anchor instruction)

Remove the spend cap and atomically clear `FLAG_SPEND_POLICY`.

```typescript
await program.methods
  .clearSpendLimit()
  .accounts({ authority: provider.wallet.publicKey, mint, config })
  .rpc({ commitment: 'confirmed' });
```

**Returns:** `Promise<TransactionSignature>`

---

## Circuit-Breaker Workflow

### Activating the circuit breaker

```typescript
import { FeatureFlagsModule, FLAG_CIRCUIT_BREAKER } from '@sss/sdk';
import { AnchorProvider } from '@coral-xyz/anchor';

// Provider wallet = admin authority
const ff = new FeatureFlagsModule(provider, programId);

// 1. Halt all minting/burning
const sig = await ff.setFeatureFlag({ mint, flag: FLAG_CIRCUIT_BREAKER });
console.log('Circuit breaker set:', sig);

// 2. Confirm it is active
const active = await ff.isFeatureFlagSet(mint, FLAG_CIRCUIT_BREAKER);
console.assert(active === true);
```

### Lifting the circuit breaker

```typescript
// After incident resolution
const sig = await ff.clearFeatureFlag({ mint, flag: FLAG_CIRCUIT_BREAKER });
console.log('Circuit breaker cleared:', sig);

const active = await ff.isFeatureFlagSet(mint, FLAG_CIRCUIT_BREAKER);
console.assert(active === false);
```

---

## Spend Policy Workflow

### Enabling a spend limit

```typescript
import { Program } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';

const program = new Program(idl, provider);
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from('stablecoin-config'), mint.toBuffer()],
  programId
);

// Cap transfers at 500 tokens (6 decimals = 500_000_000 raw)
await program.methods
  .setSpendLimit(new BN(500_000_000))
  .accounts({ authority: provider.wallet.publicKey, mint, config })
  .rpc({ commitment: 'confirmed' });

// Verify the flag is now set
const ff = new FeatureFlagsModule(provider, programId);
const spendPolicyActive = await ff.isFeatureFlagSet(mint, FLAG_SPEND_POLICY);
console.assert(spendPolicyActive === true);
```

### Removing the spend limit

```typescript
await program.methods
  .clearSpendLimit()
  .accounts({ authority: provider.wallet.publicKey, mint, config })
  .rpc({ commitment: 'confirmed' });

const spendPolicyActive = await ff.isFeatureFlagSet(mint, FLAG_SPEND_POLICY);
console.assert(spendPolicyActive === false);
```

### Checking all flags

```typescript
const flags = await ff.getFeatureFlags(mint);
const circuitBreakerOn    = (flags & FLAG_CIRCUIT_BREAKER)    !== 0n;
const spendPolicyOn       = (flags & FLAG_SPEND_POLICY)       !== 0n;
const daoCommitteeOn      = (flags & FLAG_DAO_COMMITTEE)      !== 0n;
const yieldCollateralOn   = (flags & FLAG_YIELD_COLLATERAL)   !== 0n;
const zkComplianceOn      = (flags & FLAG_ZK_COMPLIANCE)      !== 0n;

console.log(`Circuit breaker:   ${circuitBreakerOn}`);
console.log(`Spend policy:      ${spendPolicyOn}`);
console.log(`DAO committee:     ${daoCommitteeOn}`);
console.log(`Yield collateral:  ${yieldCollateralOn}`);
console.log(`ZK compliance:     ${zkComplianceOn}`);
console.log(`Raw bitmask:       0x${flags.toString(16).padStart(16, '0')}`);
```

---

## DAO Committee Workflow

### Initialising the committee

```typescript
import { Program, BN } from '@coral-xyz/anchor';

const program = new Program(idl, provider);
const [config] = PublicKey.findProgramAddressSync(
  [Buffer.from('stablecoin-config'), mint.toBuffer()],
  programId
);

const member1 = new PublicKey('...');
const member2 = new PublicKey('...');
const member3 = new PublicKey('...');

// 2-of-3 quorum; atomically enables FLAG_DAO_COMMITTEE
await program.methods
  .initDaoCommittee([member1, member2, member3], 2)
  .accounts({ authority: provider.wallet.publicKey, mint, config })
  .rpc({ commitment: 'confirmed' });
```

After this call `StablecoinConfig.feature_flags` has `FLAG_DAO_COMMITTEE` set,
and the `DaoCommitteeConfig` PDA is created with the member list and quorum.

### Creating a proposal

```typescript
import { ProposalAction } from '@sss/sdk'; // enum from Anchor IDL types

const [committee] = PublicKey.findProgramAddressSync(
  [Buffer.from('dao-committee'), config.toBuffer()],
  programId
);

// Open a proposal to pause the mint
await program.methods
  .proposeAction({ pause: {} }, new BN(0), PublicKey.default)
  .accounts({ proposer: provider.wallet.publicKey, mint, config, committee })
  .rpc({ commitment: 'confirmed' });
// proposal_id = 0 (first proposal)
```

### Voting on a proposal

```typescript
const proposalId = new BN(0);
const [proposal] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('dao-proposal'),
    config.toBuffer(),
    proposalId.toArrayLike(Buffer, 'le', 8),
  ],
  programId
);

// Each committee member calls this
await program.methods
  .voteAction(proposalId)
  .accounts({ voter: memberWallet.publicKey, mint, config, committee, proposal })
  .rpc({ commitment: 'confirmed' });
```

### Executing a passed proposal

```typescript
// Once quorum is reached (e.g. 2 of 3 members voted), anyone can execute
await program.methods
  .executeAction(proposalId)
  .accounts({ executor: provider.wallet.publicKey, mint, config, committee, proposal })
  .rpc({ commitment: 'confirmed' });
// config.paused is now true
```

---

## On-Chain Account Layout

`StablecoinConfig` raw data offsets (for the reader implemented in
`_readFeatureFlags`).  **Updated for SSS-063** which added `max_transfer_amount`
and reordered the tail fields.

| Offset | Size | Field |
|---|---|---|
| 0 | 8 | Anchor discriminator |
| 8 | 32 | `mint` (Pubkey) |
| 40 | 32 | `authority` (Pubkey) |
| 72 | 32 | `compliance_authority` (Pubkey) |
| 104 | 1 | `preset` (u8) |
| 105 | 1 | `paused` (bool) |
| 106 | 8 | `total_minted` (u64 LE) |
| 114 | 8 | `total_burned` (u64 LE) |
| 122 | 32 | `transfer_hook_program` (Pubkey) |
| 154 | 32 | `collateral_mint` (Pubkey) |
| 186 | 32 | `reserve_vault` (Pubkey) |
| 218 | 8 | `total_collateral` (u64 LE) |
| 226 | 8 | `max_supply` (u64 LE) |
| 234 | 32 | `pending_authority` (Pubkey) |
| 266 | 32 | `pending_compliance_authority` (Pubkey) |
| **298** | **8** | **`feature_flags` (u64 LE)** |
| **306** | **8** | **`max_transfer_amount` (u64 LE)** |
| 314 | 1 | `bump` (u8) |

The `feature_flags` field is read as little-endian `u64`.
The `max_transfer_amount` field is non-zero only when `FLAG_SPEND_POLICY` is active.

#### `DaoCommitteeConfig` PDA

Seeds: `["dao-committee", config_pubkey]`

| Field | Type | Description |
|---|---|---|
| `config` | `Pubkey` | The stablecoin config this committee governs. |
| `members` | `Vec<Pubkey>` (max 10) | Registered committee member pubkeys. |
| `quorum` | `u8` | Minimum YES votes required to pass a proposal. |
| `next_proposal_id` | `u64` | Auto-incremented proposal counter. |

#### `ProposalPda` PDA

Seeds: `["dao-proposal", config_pubkey, proposal_id (u64 LE)]`

| Field | Type | Description |
|---|---|---|
| `config` | `Pubkey` | The stablecoin config being governed. |
| `proposal_id` | `u64` | Monotonically increasing proposal index (0-based). |
| `proposer` | `Pubkey` | Authority that opened the proposal. |
| `action` | `ProposalAction` | Action to execute on quorum. |
| `param` | `u64` | Flag bits or minter cap (0 if unused). |
| `target` | `Pubkey` | Minter key for UpdateMinter/RevokeMinter; default otherwise. |
| `votes` | `Vec<Pubkey>` (max 10) | Committee members who voted YES. |
| `quorum` | `u8` | Snapshot of required quorum at proposal creation time. |
| `executed` | `bool` | True once `execute_action` has been called successfully. |
| `cancelled` | `bool` | True if the proposal was cancelled. |

---

## CLI Usage (sss-cli)

```bash
# Set circuit breaker
sss-cli feature-flags set \
  --mint <MINT_ADDRESS> \
  --flag circuit-breaker \
  --keypair /path/to/admin-keypair.json

# Clear circuit breaker
sss-cli feature-flags clear \
  --mint <MINT_ADDRESS> \
  --flag circuit-breaker \
  --keypair /path/to/admin-keypair.json

# Query flag status
sss-cli feature-flags status --mint <MINT_ADDRESS>

# Set spend limit (500 tokens with 6 decimals)
sss-cli spend-policy set \
  --mint <MINT_ADDRESS> \
  --max-amount 500000000 \
  --keypair /path/to/admin-keypair.json

# Clear spend limit
sss-cli spend-policy clear \
  --mint <MINT_ADDRESS> \
  --keypair /path/to/admin-keypair.json
```

---

## Related Docs

- [on-chain-sdk-admin.md](./on-chain-sdk-admin.md) — pause/unpause, minter management, authority transfer
- [on-chain-sdk-core.md](./on-chain-sdk-core.md) — mintTo, burnFrom, freeze/thaw
- [on-chain-sdk-cdp.md](./on-chain-sdk-cdp.md) — CDP collateral deposits (FLAG_YIELD_COLLATERAL integration)
- [transfer-hook.md](./transfer-hook.md) — transfer-hook extra account metas (FLAG_ZK_COMPLIANCE index 7)
- [compliance-module.md](./compliance-module.md) — compliance authority, ZK oracle patterns
- [SSS-3.md](./SSS-3.md) — protocol specification
