# SSS-3: Private Stablecoin (Proof of Concept)

> **Status: Experimental** — Token-2022 Confidential Transfers and the ZK proof tooling are still maturing. This document describes the architecture and design intent. A stub Anchor program is provided in `programs/sss-private/` to illustrate the on-chain structure.

---

## Overview

SSS-3 extends SSS-2 with **Confidential Transfers** — a Token-2022 extension that encrypts token balances and transfer amounts using ElGamal encryption and ZK proofs. Transaction amounts are hidden from on-chain observers while remaining verifiable by the auditor and the participants.

```
SSS-3 = SSS-2 + ConfidentialTransfer extension + AllowlistEntry PDA
```

### Key differences from SSS-2

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---------|-------|-------|-------|
| Encrypted balances | ❌ | ❌ | ✅ |
| ZK-proof transfers | ❌ | ❌ | ✅ |
| Blacklist (block) | ❌ | ✅ | ✅ |
| Allowlist (permit-only) | ❌ | ❌ | ✅ |
| Auditor key | ❌ | ❌ | ✅ |
| Transfer hook | ❌ | ✅ | ✅ |

---

## Architecture

### Token-2022 Extensions Required

```
InitializeConfidentialTransferMint
  auditor_elgamal_encryption_key: Option<ElGamalPubkey>
  auto_approve_new_accounts: bool   // false → manual approval required
```

When `auto_approve_new_accounts = false`, every token account must be explicitly approved before it can receive confidential transfers. This is the **allowlist** mechanism — only approved accounts can participate.

### On-chain State

**PrivateStablecoinConfig** PDA seeds: `["private-config", mint]`
```rust
pub struct PrivateStablecoinConfig {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub auditor_elgamal_pubkey: [u8; 32],  // ElGamal pubkey for auditor decryption
    pub allowlister: Option<Pubkey>,
    pub bump: u8,
}
```

**AllowlistEntry** PDA seeds: `["allowlist", mint, token_account]`
```rust
pub struct AllowlistEntry {
    pub token_account: Pubkey,
    pub approved_at: i64,
    pub bump: u8,
}
```
Existence of this PDA = account is allowlisted. The transfer hook checks for it.

### Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize_private` | Creates mint with ConfidentialTransfer + TransferHook extensions |
| `approve_account` | Creates AllowlistEntry PDA, calls `configure_confidential_transfer_account` |
| `revoke_account` | Closes AllowlistEntry PDA |
| `deposit` | Calls `confidential_transfer::deposit` to move public balance into encrypted |
| `withdraw` | Calls `confidential_transfer::withdraw` with ZK proof |

---

## Transfer Flow

```
1. Sender calls confidential_transfer::transfer_with_split_proofs (off-chain ZK)
2. Token-2022 invokes transfer hook
3. Hook checks AllowlistEntry for both sender and recipient
4. If either is not allowlisted → reject
5. Auditor can decrypt any transfer using their ElGamal private key
```

### ZK Proof Generation (client-side)

```typescript
import { createTransferWithSplitProofsInstructions } from "@solana/spl-token";

// Generate equality proof, validity proof, range proof
const { instructions, signers } = await createTransferWithSplitProofsInstructions(
  connection,
  senderTokenAccount,
  mint,
  recipientTokenAccount,
  senderElGamalKeypair,
  amount,
  decryptableBalance,
);
```

Proofs are ~900 bytes each and are verified on-chain by the ZK ElGamal Proof Program (`ZkE1Gama1Proof11111111111111111111111111111`).

---

## Transfer Hook (SSS-3)

The SSS-3 transfer hook extends the SSS-2 hook with an **allowlist check** instead of (or in addition to) a blacklist check:

```rust
// In execute handler:
// 1. Check source is NOT blacklisted (same as SSS-2)
require!(source_blacklist_entry.data_is_empty(), HookError::SenderBlacklisted);

// 2. Check destination IS allowlisted (new in SSS-3)
require!(!dest_allowlist_entry.data_is_empty(), HookError::RecipientNotAllowlisted);
```

The `extra_account_meta_list` registers both PDAs as resolved accounts.

---

## Security Considerations

### What confidential transfers hide
- Transfer amounts from on-chain observers
- Sender/recipient balances from on-chain observers

### What confidential transfers do NOT hide
- The fact that a transfer occurred (sender, recipient addresses are visible)
- Mint address
- Token account existence

### Auditor role
The auditor ElGamal key is set at mint initialization and cannot be changed (immutable). Every confidential transfer is encrypted to both the recipient AND the auditor, allowing regulatory inspection without revealing amounts to the public.

### Compliance
SSS-3 is designed for privacy-preserving regulated stablecoins — e.g., a CBDC where user balances are private but auditable by the central bank. The allowlist ensures only KYC-approved accounts can participate.

---

## Implementation Notes

### Current Limitations (as of 2026)
- `confidential_transfer` proof instructions require Solana 1.18+ validator
- ZK proof generation requires `@solana/spl-token` >= 0.4.0 with `confidential-transfer` feature
- Split proofs (3 separate proof instructions) must be in the same transaction or use durable nonces
- Proof accounts must be pre-created and then closed; adds ~2 SOL rent per transfer cycle

### Recommended Client Flow
```typescript
// 1. Generate ElGamal keypairs off-chain
const senderElGamal = ElGamalKeypair.new_rand();
const auditorElGamal = ElGamalKeypair.new_rand(); // stored by auditor

// 2. Initialize private stablecoin
await privateStablecoin.initialize({
  auditorElGamalPubkey: auditorElGamal.public,
  autoApproveNewAccounts: false,
});

// 3. Approve a token account (KYC'd user)
await privateStablecoin.approveAccount(userTokenAccount);

// 4. User deposits public tokens into confidential balance
await confidentialTransfer.deposit(userTokenAccount, amount);

// 5. User transfers confidentially
await confidentialTransfer.transferWithSplitProofs(...);
```

---

## Stub Program

The stub program at `programs/sss-private/` defines the account structures and instruction signatures. The actual ZK CPI calls are marked `todo!()` pending stable toolchain support.

See `programs/sss-private/src/lib.rs` for the full interface.
