# SSS-3: Private Stablecoin Specification

SSS-3 is the privacy tier of the Solana Stablecoin Standard. It extends SSS-1 with the ConfidentialTransferMint extension and permanent delegate authority, enabling zero-knowledge encrypted balances and transfers while retaining issuer compliance controls. SSS-3 is currently a proof-of-concept due to the Solana ZK ElGamal Proof Program being disabled.

## Status: Proof-of-Concept

The ConfidentialTransferMint extension is initialized at the mint level and the feature gate is enforced at the program level. However, actual confidential transfer operations (account configuration, deposits, encrypted transfers, withdrawals) cannot execute because the underlying ZK ElGamal Proof Program is disabled on both mainnet and devnet.

### Timeline

| Date | Event |
|------|-------|
| April 2025 | Solana launched Confidential Balances on mainnet. Agora Dollar (AUSD) was the first token to enable the extension. |
| June 2025 | Two critical vulnerabilities discovered in the ZK ElGamal Proof Program (missing component in Fiat-Shamir hash, enabling proof forgery). Token-2022 updated to disable confidential transfers. ZK ElGamal Proof Program disabled on mainnet (epoch 805) and devnet. |
| August 2025 | Code4rena security audit initiated for the ZK ElGamal codebase. |
| February 2026 | ZK ElGamal Proof Program remains disabled. Audit ongoing. No re-enablement date announced. |

The SSS-3 implementation is designed so that when Solana re-enables the ZK program, full confidential transfer support can be activated without redeploying the mint.

## Overview

SSS-3 activates the ConfidentialTransferMint and PermanentDelegate extensions on top of the MetadataPointer used by SSS-1. The transfer hook is **not** enabled -- compliance is enforced via the permanent delegate (freeze/seize) rather than per-transfer blacklist checks, since confidential transfers and transfer hooks have not yet been tested together.

**Target use cases:**

- Privacy-preserving payment stablecoins
- Institutional transactions requiring balance confidentiality
- Payroll and treasury operations where amounts should not be public
- Regulatory environments that permit encrypted balances with auditor access
- Research and development for next-generation compliant privacy tokens

## Feature Flags

```
enable_permanent_delegate:       true
enable_transfer_hook:            false
default_account_frozen:          false
enable_confidential_transfers:   true
```

These flags are set at initialization and are immutable.

## Token-2022 Extensions

| Extension | Status | Purpose |
|-----------|--------|---------|
| MetadataPointer | Enabled | Points to the mint as metadata source |
| PermanentDelegate | Enabled | Allows Config PDA to burn from any account (seizure) |
| TransferHook | Disabled | Not used in SSS-3 (see Design Decisions) |
| DefaultAccountState | Disabled | Not used in SSS-3 |
| ConfidentialTransferMint | Enabled | Registers the mint for zero-knowledge encrypted transfers |

## Initialization

### Parameters

```rust
InitializeParams {
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    preset: StablecoinPreset::SSS3,
}
```

### ConfidentialTransferMint Configuration

During initialization, the program calls `spl_token_2022::extension::confidential_transfer::instruction::initialize_mint` with:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `authority` | `Some(config_pda)` | The Config PDA controls confidential transfer settings |
| `auto_approve_new_accounts` | `true` | Any token account can opt into confidential mode without issuer approval |
| `auditor_elgamal_pubkey` | `None` | No auditor key set (see Roadmap for planned auditor support) |

### CLI

```bash
sss init --preset sss-3 --name "Private USD" --symbol PUSD --decimals 6
```

### SDK

```typescript
const mintKeypair = Keypair.generate();
await client.initialize(
  {
    name: "Private USD",
    symbol: "PUSD",
    uri: "https://example.com/metadata.json",
    decimals: 6,
    preset: getPresetAnchorEnum(StablecoinPreset.SSS3),
  },
  mintKeypair
);
```

## What Works Today

The following operations function on SSS-3 mints using standard (non-confidential) Token-2022 transfers:

| Operation | Status | Notes |
|-----------|--------|-------|
| Initialize mint with CT extension | Working | Extension data written to mint account |
| Mint tokens (public balance) | Working | Standard mint via Config PDA |
| Burn tokens (public balance) | Working | Standard burn |
| Freeze / Thaw | Working | Via Config PDA as freeze authority |
| Pause / Unpause | Working | Global halt of operations |
| Role management | Working | All four roles (master, pauser, blacklister, seizer) |
| Minter quotas | Working | Per-minter quota enforcement |
| Blacklist add/remove | Working | PDA-based (permanent delegate enables this) |
| Seize (burn+mint) | Working | Via permanent delegate authority |
| Reserve attestation | Working | GENIUS Act compliance |
| Audit logging | Working | Full audit trail |

## What Requires ZK Re-Enablement

The following operations require the ZK ElGamal Proof Program to be active:

| Operation | Status | Description |
|-----------|--------|-------------|
| Configure confidential account | Blocked | Set up ElGamal keypair on a token account |
| Deposit to confidential balance | Blocked | Move tokens from public to encrypted balance |
| Confidential transfer | Blocked | Transfer encrypted amounts with ZK proofs |
| Apply pending balance | Blocked | Move received encrypted tokens to available balance |
| Withdraw from confidential balance | Blocked | Move tokens from encrypted to public balance |

Each of these operations requires the sender or account holder to generate zero-knowledge proofs (range proofs, equality proofs) that are verified on-chain by the ZK ElGamal Proof Program.

## Confidential Transfer Flow (When Enabled)

When the ZK ElGamal Proof Program is re-enabled, the full confidential transfer flow will work as follows:

### Account Setup (One-Time Per User)

```
User generates ElGamal keypair + AES-128 key
    |
    v
Call configure_account on their token account
    |
    v
Account is approved (auto_approve = true)
    |
    v
User can now use confidential balances
```

### Deposit (Public to Confidential)

```
User calls deposit(amount) on their token account
    |
    v
Public balance decreases by amount
Pending confidential balance increases
    |
    v
User calls apply_pending_balance
    |
    v
Pending moves to available confidential balance
```

### Confidential Transfer

```
Sender generates ZK proofs:
  - Range proof: encrypted amount is non-negative and within bounds
  - Equality proof: balance consistency after transfer
    |
    v
Call transfer with ciphertext + proof data
    |
    v
ZK ElGamal Proof Program verifies proofs on-chain
    |
    v
Sender's encrypted balance decreases
Recipient's pending balance increases
    |
    v
Recipient calls apply_pending_balance
```

### Withdrawal (Confidential to Public)

```
User generates ZK range proof
    |
    v
Call withdraw(amount) with proof data
    |
    v
Confidential balance decreases
Public balance increases by amount
```

## Design Decisions

### No Transfer Hook

SSS-3 disables the transfer hook (`enable_transfer_hook = false`). This is intentional:

1. **Untested interaction.** The combination of confidential transfers and transfer hooks has not been tested on Solana. The hook receives plaintext account data, but confidential transfer amounts are encrypted. It is unclear how the hook would access or verify encrypted transfer data.

2. **Compliance via permanent delegate.** The permanent delegate authority allows the issuer to freeze accounts and seize tokens (via burn+mint) without requiring per-transfer enforcement. This is sufficient for most compliance scenarios.

3. **Privacy model.** Per-transfer blacklist checks require inspecting source and destination addresses on every transfer, which partially undermines the privacy guarantees of confidential transfers. Compliance via freeze/seize operates at the account level rather than the transaction level.

### Auto-Approve Accounts

`auto_approve_new_accounts` is set to `true`. This means any token holder can configure their account for confidential transfers without issuer approval. This design choice prioritizes:

- **Permissionless opt-in.** Users choose their own privacy level.
- **Reduced operational burden.** The issuer does not need to approve each account.
- **Compatibility with DeFi.** Protocols can integrate confidential balances without issuer coordination.

For stricter environments, a future version could set this to `false` and add an `approve_ct_account` instruction gated to the master authority.

### No Auditor Key

The current implementation does not set an auditor ElGamal pubkey. When set, an auditor key allows a designated party to decrypt all transfer amounts for compliance purposes. This is planned for a future version (see Roadmap).

## Comparison with SSS-1 and SSS-2

| Capability | SSS-1 | SSS-2 | SSS-3 |
|-----------|:---:|:---:|:---:|
| Mint / Burn | Yes | Yes | Yes |
| Freeze / Thaw | Yes | Yes | Yes |
| Pause / Unpause | Yes | Yes | Yes |
| Minter quotas | Yes | Yes | Yes |
| Role management | Yes | Yes | Yes |
| Reserve attestation | Yes | Yes | Yes |
| Audit log | Yes | Yes | Yes |
| Per-transfer blacklist enforcement | No | Yes | No |
| Permanent delegate | No | Yes | Yes |
| Blacklist add/remove | No | Yes | Yes |
| Seize tokens | No | Yes | Yes |
| Confidential transfers | No | No | Yes (when ZK enabled) |
| Programs required | 1 | 2 | 1 |

## PDA Schema

SSS-3 uses the same PDA types as SSS-1 plus BlacklistEntry (enabled by permanent delegate):

| PDA | Seeds | Program |
|-----|-------|---------|
| StablecoinConfig | `["config", mint]` | sss-token |
| RoleRegistry | `["roles", config]` | sss-token |
| MinterInfo | `["minter", config, wallet]` | sss-token |
| BlacklistEntry | `["blacklist", config, address]` | sss-token |
| ReserveAttestation | `["reserve", config, index]` | sss-token |
| AuditLogEntry | `["audit", config, index]` | sss-token |

No ExtraAccountMetaList is needed because the transfer hook is not enabled.

## Error Codes

SSS-3 uses the same error codes as SSS-1 and SSS-2. The confidential transfer feature gate adds:

| Code | Name | Trigger |
|------|------|---------|
| 6012 | ConfidentialTransfersNotEnabled | CT instruction on non-SSS-3 mint |

## Events

SSS-3 emits all SSS-1 events. Because permanent delegate is enabled, blacklist and seize events are also available:

| Event | Trigger | Fields |
|-------|---------|--------|
| `BlacklistAdded` | `blacklist_add` | config, blocked_address, reason, blacklisted_by, timestamp |
| `BlacklistRemoved` | `blacklist_remove` | config, unblocked_address, removed_by, timestamp |
| `TokensSeized` | `seize` | config, from, amount, seized_by, timestamp |

## Security Considerations

### Permanent Delegate and Confidential Balances

The permanent delegate can burn tokens from any account, but seizing from a confidential balance is more complex than seizing from a public balance. The current burn+mint seize pattern operates on the public balance portion of a token account. If a user moves all tokens into their confidential balance, the public balance will be zero and a burn of 0 would be a no-op.

**Mitigation:** The issuer can freeze the account (preventing further deposits or transfers), then wait for the user to withdraw to public balance, or use regulatory/legal channels to compel cooperation. A future on-chain solution may involve the auditor key to determine encrypted balances.

### Privacy Limitations

Confidential transfers encrypt **amounts** but not **addresses**. The source and destination of each transfer are visible on-chain. Only the transfer amount and account balances are hidden behind ElGamal encryption.

### Auditor Key Absence

Without an auditor key, the issuer cannot decrypt transfer amounts. This means compliance teams cannot perform on-chain transaction monitoring of encrypted amounts. The issuer can still:

- Monitor public balance changes (deposits/withdrawals)
- Track which addresses transact (addresses are visible)
- Freeze and seize based on address-level intelligence
- Use off-chain KYC data for compliance decisions

## Roadmap

The following enhancements are planned for SSS-3 once the ZK ElGamal Proof Program is re-enabled:

### Phase 1: Core CT Support

- [ ] Add `configure_ct_account` instruction wrapping Token-2022's configure_account CPI
- [ ] Add `approve_ct_account` instruction for issuer-controlled approval mode
- [ ] SDK: ElGamal keypair generation helpers
- [ ] SDK: Proof generation via WASM-compiled Rust (until native JS libraries are available)
- [ ] SDK: `deposit()`, `withdraw()`, `confidentialTransfer()` wrappers
- [ ] CLI: `sss ct-configure`, `sss ct-deposit`, `sss ct-withdraw` subcommands

### Phase 2: Auditor Integration

- [ ] Accept auditor ElGamal pubkey during initialization
- [ ] Auditor key stored in ConfidentialTransferMint extension data
- [ ] Compliance tooling: decrypt transfer amounts using auditor key
- [ ] Backend: auditor decryption endpoint for transaction monitoring

### Phase 3: Advanced Compliance

- [ ] Investigate transfer hook + confidential transfer interaction
- [ ] Design confidential-balance-aware seize mechanism
- [ ] Scoped allowlists: restrict confidential transfers to pre-approved addresses
- [ ] Integration with existing compliance service for encrypted amount monitoring

## Testing

SSS-3 tests verify that the ConfidentialTransferMint extension is correctly initialized and that all standard operations work on a CT-enabled mint:

```
sss-3.test.ts (8 tests)
  - Initializes SSS-3 stablecoin with confidential transfers
  - Adds a minter with quota
  - Mints tokens to recipient
  - Burns tokens
  - Freezes a token account
  - Thaws a token account
  - Pauses and unpauses
  - Blacklist works on SSS-3
```

All tests pass using standard (non-encrypted) operations. Confidential transfer operation tests will be added when the ZK ElGamal Proof Program is re-enabled on devnet.
