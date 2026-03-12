# SSS-3: Private Stablecoin Preset

**Preset ID:** `3`
**Name:** Private
**Constant:** `PRESET_PRIVATE`
**Status:** On-chain skeleton implemented

## Overview

SSS-3 is the privacy-focused stablecoin preset. It extends SSS-2 (compliance features: blacklist, seizure, KYC gating, transfer hook) with confidential transfers and an allowlist that controls which accounts can participate in private transactions.

Transfer amounts and balances are encrypted using ElGamal encryption. A designated auditor (the authority) holds the auditor ElGamal keypair and can decrypt any transfer amount or balance for regulatory compliance. Users gain transactional privacy from other on-chain observers while the issuer retains full auditability.

SSS-3 is appropriate for stablecoins operating in regulated environments where both user privacy and issuer compliance are requirements — for example, institutional settlement, payroll, or cross-border payments where transaction amounts should not be publicly visible.

## Token-2022 Extensions

SSS-3 uses all SSS-2 extensions plus one additional extension.

| Extension | Purpose | Inherited From |
|---|---|---|
| `MetadataPointer` | Points token metadata to the mint account itself | SSS-1 |
| `TokenMetadata` | On-chain name, symbol, and URI stored on the mint | SSS-1 |
| `MintCloseAuthority` | Allows closing the mint account when supply reaches zero | SSS-1 |
| `PermanentDelegate` | Enables token seizure (clawback) via the mint authority PDA | SSS-2 |
| `TransferHook` | Enforces pause and blacklist checks on every transfer | SSS-2 |
| `DefaultAccountState` | New token accounts start frozen (KYC gate) | SSS-2 |
| `ConfidentialTransferMint` | Enables encrypted transfers with auditor oversight | **SSS-3** |

### ConfidentialTransferMint Configuration

```
ConfidentialTransferMint
  authority              = mint_authority PDA
  auto_approve_new_accounts = false
  auditor_elgamal_pubkey = authority-provided ElGamal public key
```

- **`authority`**: The `mint_authority` PDA controls approval of accounts for confidential transfers. This ensures only the program can approve accounts, enforcing the allowlist gate.
- **`auto_approve_new_accounts = false`**: Accounts are not automatically approved for confidential transfers. The authority must explicitly approve each account after KYC verification. This flag is the mechanism that implements the allowlist.
- **`auditor_elgamal_pubkey`**: An ElGamal public key provided by the authority at initialization. All confidential transfers include a ciphertext encrypted to this key, enabling the authority to decrypt any transfer amount for compliance auditing.

## Allowlist Architecture

The allowlist controls which token accounts can participate in confidential transfers. It is implemented through two complementary mechanisms:

1. **Token-2022 native approval**: The `auto_approve_new_accounts = false` setting on `ConfidentialTransferMint` means Token-2022 itself will reject confidential transfers from unapproved accounts.
2. **On-chain AllowlistEntry PDA**: An explicit record of approval status, providing an auditable history and enabling revocation tracking.

### AllowlistEntry PDA

| Field | Type | Description |
|---|---|---|
| `mint` | Pubkey | The Token-2022 mint this entry belongs to |
| `wallet` | Pubkey | The wallet address that was approved |
| `approved` | bool | Whether currently approved for confidential transfers |
| `approved_by` | Pubkey | Authority address that approved this account |
| `approved_at` | i64 | Unix timestamp of approval |
| `bump` | u8 | PDA bump seed |

**PDA Seeds:** `["allowlist", mint, wallet]`
**Program:** sss-core

The AllowlistEntry is separate from the Token-2022 confidential transfer approval state. Both must be in agreement: the on-chain program checks the AllowlistEntry before invoking the Token-2022 CPI to approve or revoke an account.

## New Instructions

SSS-3 introduces two new instructions to sss-core.

### `approve_confidential_account`

Approves a token account for confidential transfers. This is a two-part operation: it creates (or updates) the AllowlistEntry PDA and then CPIs into Token-2022 to approve the account for confidential transfers.

- **Signer:** `authority`
- **Preset guard:** `config.preset >= 3`; returns `PresetFeatureUnavailable` otherwise
- **Preconditions:**
  - The token account must already exist and be configured for confidential transfers (the user must have called `configure_account` on their token account first)
  - The token account must be thawed (KYC already verified via SSS-2 flow)
- **Effects:**
  1. Creates or updates `AllowlistEntry` PDA with `approved = true`
  2. CPIs `confidential_transfer_approve_account` signed by `mint_authority` PDA
  3. Emits `ConfidentialAccountApproved` event

| Field | Type | Description |
|---|---|---|
| `mint` | Pubkey | Stablecoin mint |
| `wallet` | Pubkey | Approved wallet address |
| `approved_by` | Pubkey | Authority that approved |

### `revoke_confidential_account`

Revokes a token account's approval for confidential transfers. The account can no longer send or receive confidential transfers until re-approved.

- **Signer:** `authority`
- **Preset guard:** `config.preset >= 3`; returns `PresetFeatureUnavailable` otherwise
- **Effects:**
  1. Sets `AllowlistEntry.approved = false`
  2. CPIs into Token-2022 to revoke the account's confidential transfer approval (via `confidential_transfer_empty_account` if balance is zero, or requires the user to withdraw confidential balance first)
  3. Emits `ConfidentialAccountRevoked` event

| Field | Type | Description |
|---|---|---|
| `mint` | Pubkey | Stablecoin mint |
| `wallet` | Pubkey | Revoked wallet address |
| `revoked_by` | Pubkey | Authority that revoked |

## Confidential Transfer Flow

The following sequence shows the full lifecycle of an account participating in confidential transfers on an SSS-3 mint.

```
                          SSS-2 Flow (inherited)            SSS-3 Flow (new)
                         ─────────────────────────         ─────────────────────

 1. Create token account ──► Account starts FROZEN
                              (DefaultAccountState)

 2. KYC verification     ──► Authority thaws account
                              (freeze/thaw instruction)

 3. Configure for CT     ──────────────────────────────► User calls
                                                          configure_account
                                                          (client-side, generates
                                                          user ElGamal keypair)

 4. Authority approval   ──────────────────────────────► Authority calls
                                                          approve_confidential_account
                                                          (creates AllowlistEntry,
                                                          CPIs Token-2022 approve)

 5. Deposit to CT        ──────────────────────────────► User deposits tokens
                                                          from public balance
                                                          to confidential balance

 6. Confidential transfer ─────────────────────────────► User sends encrypted
                                                          transfer (ZK proof
                                                          generated client-side)

 7. Transfer hook fires  ──► sss-hook enforces:
                              - Pause check
                              - Source blacklist check
                              - Destination blacklist check

 8. Apply pending balance ─────────────────────────────► Recipient applies
                                                          incoming transfer
                                                          to their balance
```

### Key Points

- Steps 1-2 are identical to SSS-2. The existing KYC gate (default frozen + thaw) is a prerequisite.
- Step 3 is user-initiated. The user generates their own ElGamal keypair and AES key, then calls `configure_account` on their token account. This does not require authority approval.
- Step 4 is the SSS-3 gate. Until the authority approves the account, Token-2022 will reject confidential transfers involving that account.
- Step 6 involves client-side ZK proof generation. The user proves the transfer amount is valid without revealing it. The proof is verified on-chain by Token-2022.
- Step 7 still applies. The transfer hook enforces blacklist and pause rules even on confidential transfers. The transfer hook operates on the transfer metadata (accounts involved), not on the encrypted amounts.

## Privacy Model

### What Is Encrypted

- **Transfer amounts**: Each confidential transfer encrypts the amount under three ElGamal public keys: the sender's, the recipient's, and the auditor's. On-chain observers see only ciphertext.
- **Token balances**: The confidential balance portion of a token account is encrypted. Only the account holder (and the auditor) can determine the actual balance.

### What Is NOT Encrypted

- **Account addresses**: The sender and recipient token accounts are visible on-chain. The transfer hook needs to read the owner field of both accounts for blacklist enforcement.
- **Token mint**: The mint address is public. Observers can see which stablecoin is being transferred.
- **Transaction signatures and timing**: Standard Solana transaction metadata remains public.
- **Public balance**: Tokens in the non-confidential (public) balance portion remain visible. Users must explicitly deposit into the confidential balance.

### Auditor Capabilities

The auditor ElGamal keypair is held by the authority (or a designated compliance entity). With this key, the auditor can:

1. **Decrypt any transfer amount** — every confidential transfer includes an auditor ciphertext
2. **Decrypt any account's confidential balance** — the auditor can derive the balance from the encrypted pending and available balance fields
3. **Generate compliance reports** — the auditor can reconstruct the full transaction history with amounts for any account

This satisfies regulatory requirements (AML/KYC, sanctions screening, tax reporting) while keeping amounts private from general on-chain observers, other users, and MEV bots.

### Trust Assumptions

- The auditor key must be securely managed. Compromise of the auditor ElGamal private key would allow any observer to decrypt all transfer amounts.
- The authority is trusted to only approve KYC-verified accounts. This is the same trust assumption as SSS-2's freeze/thaw model.
- ZK proof correctness is guaranteed by the Token-2022 program's on-chain verifier. The issuer does not need to trust the sender's client software.

## PDA Derivation

### Core Program PDAs (inherited from SSS-1/SSS-2)

| Account | Seeds | Program |
|---|---|---|
| `StablecoinConfig` | `["config", mint]` | sss-core |
| `MintAuthority` | `["mint-authority", mint]` | sss-core |
| `MinterState` | `["minter", config, minter_wallet]` | sss-core |

### Hook Program PDAs (inherited from SSS-2)

| Account | Seeds | Program |
|---|---|---|
| `HookConfig` | `["hook-config", mint]` | sss-hook |
| `BlacklistEntry` | `["blacklist", mint, wallet]` | sss-hook |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | sss-hook |

### SSS-3 PDAs (new)

| Account | Seeds | Program |
|---|---|---|
| `AllowlistEntry` | `["allowlist", mint, wallet]` | sss-core |

## Instruction Set

SSS-3 inherits the full SSS-2 instruction set and adds two instructions.

| Instruction | Authorized Signer | Pause Blocked | Preset |
|---|---|---|---|
| `initialize` | `authority` (payer) | N/A | All |
| `configure_minter` | `master_minter` | No | All |
| `remove_minter` | `master_minter` | No | All |
| `mint_tokens` | enabled minter | Yes | All |
| `burn_tokens` | any holder | Yes | All |
| `freeze_account` | `authority` or `blacklister` | No | All |
| `thaw_account` | `authority` or `blacklister` | No | All |
| `pause` | `pauser` | No | All |
| `unpause` | `pauser` | No | All |
| `update_role` | `authority` | No | All |
| `transfer_authority` | `authority` | No | All |
| `accept_authority` | `pending_authority` | No | All |
| `seize` | `authority` | No | >= SSS-2 |
| `approve_confidential_account` | `authority` | No | >= SSS-3 |
| `revoke_confidential_account` | `authority` | No | >= SSS-3 |

## Events Emitted

All SSS-1 and SSS-2 events plus:

- `ConfidentialAccountApproved`
- `ConfidentialAccountRevoked`

## Preset Comparison Table

| Feature | SSS-1 | SSS-2 | SSS-3 |
|---|---|---|---|
| Mint / burn | Yes | Yes | Yes |
| Freeze / thaw | Yes | Yes | Yes |
| Pause all operations | Yes | Yes | Yes |
| Role-based access control | Yes | Yes | Yes |
| Two-step authority transfer | Yes | Yes | Yes |
| On-chain metadata | Yes | Yes | Yes |
| Transfer hook enforcement | No | Yes | Yes |
| Blacklist (transfer block) | No | Yes | Yes |
| Token seizure (clawback) | No | Yes | Yes |
| Default frozen (KYC gate) | No | Yes | Yes |
| Confidential transfers | No | No | Yes |
| Allowlist (CT approval gate) | No | No | Yes |
| Auditor decryption | No | No | Yes |

## Initialization

SSS-3 requires a three-step initialization:

```typescript
import {
  StablecoinClient,
  ComplianceClient,
  PRESET_PRIVATE,
} from "@sss/sdk";

// Step 1: Initialize the stablecoin with SSS-3 preset
// The auditor ElGamal public key is provided at initialization
const client = new StablecoinClient(connection, wallet);
const { mint, config } = await client.initialize({
  preset: PRESET_PRIVATE,
  name: "Private USD",
  symbol: "PUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  hookProgramId: HOOK_PROGRAM_ID,
  auditorElGamalPubkey: auditorElGamalPubkey,
});

// Step 2: Initialize the transfer hook (creates ExtraAccountMetaList)
const compliance = new ComplianceClient(connection, wallet);
await compliance.initializeHook(mint);

// Step 3: (User-side) Configure a token account for confidential transfers
// Each user generates their own ElGamal keypair and configures their account
await client.configureConfidentialAccount(mint, userTokenAccount);
// Then the authority approves the account
await client.approveConfidentialAccount(mint, userWallet);
```

## Confidential Transfer Operations

```typescript
// Authority approves an account for confidential transfers
await client.approveConfidentialAccount(mint, userWallet);

// Authority revokes an account's confidential transfer approval
await client.revokeConfidentialAccount(mint, userWallet);

// Check if a wallet is approved for confidential transfers
const isApproved = await client.isConfidentialApproved(mint, userWallet);

// User deposits public balance into confidential balance
await client.depositConfidential(mint, amount);

// User sends a confidential transfer (ZK proof generated client-side)
await client.confidentialTransfer(mint, recipientWallet, amount);

// Recipient applies pending incoming transfer to their available balance
await client.applyPendingBalance(mint);

// User withdraws from confidential balance to public balance
await client.withdrawConfidential(mint, amount);
```

## Limitations

### Wallet Support

Confidential transfer support in Solana wallets is limited. Most consumer wallets do not yet implement the ElGamal key generation, AES encryption, or ZK proof generation required for confidential transfers. Users will likely need specialized client software or SDK integration.

### ZK Proof Performance

Client-side ZK proof generation for confidential transfers has non-trivial computational overhead. Proof generation for a single transfer can take 100-500ms on modern hardware. This may impact user experience in high-frequency transfer scenarios. Batch proof generation or hardware acceleration could mitigate this in the future.

### Program Interoperability

Not all Solana programs can interact with confidential balances. Programs that need to read or verify token balances (e.g., DeFi protocols, escrow contracts) cannot inspect encrypted balances. Only the public balance portion of a token account is readable by other programs. This limits composability for SSS-3 tokens compared to SSS-1 or SSS-2.

### Seizure of Confidential Balances

The `PermanentDelegate` extension enables seizure of public balances. Seizing tokens held in confidential balances requires the user to first withdraw to the public balance, or requires additional protocol support that is not yet available in Token-2022. This is a known limitation that may affect enforcement workflows.

### Account Size

Token accounts with the `ConfidentialTransferAccount` extension are significantly larger than standard token accounts due to the encrypted balance fields and proof state. This increases rent costs for users.

### Transaction Size

Confidential transfers include ZK proofs that consume significant transaction space. A single confidential transfer may approach or exceed the Solana transaction size limit, potentially requiring versioned transactions or lookup tables.

## Security Considerations

SSS-3 inherits all SSS-2 security properties and adds:

- **Dual-gate access control**: Accounts must pass both the KYC gate (freeze/thaw) and the confidential transfer allowlist before participating in private transactions. Revoking either gate blocks the account.
- **Auditor key management**: The auditor ElGamal private key is the most sensitive secret in SSS-3. It should be stored in an HSM or equivalent secure enclave. Rotation requires re-initialization of the `ConfidentialTransferMint` extension.
- **Transfer hook coverage**: The transfer hook fires on confidential transfers as well as public transfers. Blacklist and pause enforcement apply uniformly regardless of transfer type.
- **AllowlistEntry as audit trail**: The PDA is retained even after revocation (`approved = false`), providing an immutable record of when accounts were approved and revoked.

## Implementation Status

SSS-3 on-chain skeleton is **implemented and compiles**.

### Completed

- Design specification (this document)
- Preset comparison and architecture analysis
- SDK type definitions (`PRESET_CONFIDENTIAL`, `AllowlistEntry` schema, `findAllowlistEntryPda`)
- Integration plan with existing SSS-2 instruction set
- **On-chain constants**: `PRESET_CONFIDENTIAL = 3`, `ALLOWLIST_SEED` added to `constants.rs`
- **AllowlistEntry account struct**: Anchor account with InitSpace in `state.rs`
- **Error codes**: `AlreadyApproved`, `NotApproved` added to `error.rs`
- **Events**: `ConfidentialAccountApproved`, `ConfidentialAccountRevoked` in sss-events
- **`approve_confidential` instruction**: Creates AllowlistEntry PDA + CPIs Token-2022 `approve_account` via `invoke_signed` from the mint authority PDA
- **`revoke_confidential` instruction**: Marks AllowlistEntry as revoked with event emission
- **Initialize extension**: `handle_initialize` accepts preset 3, includes `ConfidentialTransferMint` in extension set, builds raw CPI for confidential transfer mint init (authority = mint_authority PDA, auto_approve = false, no auditor)
- **SDK PDA helper**: `findAllowlistEntryPda(mint, wallet)` exported from SDK

### Requires Additional Work

- **ZK proof integration**: Client-side SDK support for ElGamal key generation, proof creation, and confidential transfer construction
- **SDK methods**: `StablecoinClient` methods for confidential transfer operations (`configureConfidentialAccount`, `approveConfidentialAccount`, `revokeConfidentialAccount`, `depositConfidential`, `confidentialTransfer`, `applyPendingBalance`, `withdrawConfidential`)
- **CLI commands**: Extend sss-token CLI with confidential transfer subcommands
- **Auditor ElGamal key**: Add auditor key parameter to initialize for SSS-3 (currently uses no auditor)
- **Test coverage**: Unit tests, integration tests, and fuzz tests for allowlist and confidential transfer flows
- **Auditor tooling**: Decryption utilities for the auditor to inspect confidential transfer amounts and balances

## Example Deployment

```bash
sss-token init \
  --preset 3 \
  --name "Private USD" \
  --symbol "PUSD" \
  --uri "https://example.com/pusd.json" \
  --decimals 6 \
  --auditor-elgamal-pubkey <base64-encoded-elgamal-pubkey>
```

See [OPERATIONS.md](OPERATIONS.md) for the full deployment runbook.
