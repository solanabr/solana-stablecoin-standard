# SSS-3: Private Stablecoin Standard — Proof of Concept

> **Status**: Experimental / Proof of Concept — Deployed on Devnet  
> **Program ID**: `4ea2tTJiMRW3Nov8K4hEd3JPppiY1oPU2p5zri8JAnkX`  
> **Depends on**: Solana Token-2022 Confidential Transfer extension  
> **Tooling maturity**: Early — SPL Confidential Transfer APIs are stabilizing

---

## Overview

SSS-3 extends SSS-1/SSS-2 with **confidential transfers** and **scoped allowlists**, enabling privacy-preserving stablecoin operations while maintaining regulatory compliance.

### Key Properties

| Feature | Description |
|---------|-------------|
| **Confidential Transfers** | Uses Token-2022's `ConfidentialTransferMint` extension with ElGamal encryption to hide transfer amounts on-chain |
| **Scoped Allowlists** | Only allowlisted (KYC'd) addresses can participate in confidential transfers — maintains compliance |
| **Auditor Key** | A designated auditor ElGamal key can decrypt all transfer amounts for regulatory reporting |
| **Dual Mode** | Tokens can exist in both public (standard) and confidential (encrypted) form |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    SSS-3 Private Stablecoin                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Token-2022 Mint                                             │
│  ├── MetadataPointer (SSS-1)                                 │
│  ├── MintCloseAuthority (SSS-1)                              │
│  ├── PermanentDelegate (SSS-2, optional)                     │
│  ├── TransferHook (SSS-2, optional)                          │
│  ├── ConfidentialTransferMint  ◄── NEW in SSS-3              │
│  │   ├── authority: master_authority                         │
│  │   ├── auto_approve: false (uses allowlist)                │
│  │   └── auditor_elgamal_pubkey: auditor_key                │
│  └── ConfidentialTransferFeeConfig (optional)                │
│                                                              │
│  On-chain Program (sss-3-private)                            │
  │  ├── initialize_private()   — init state + register mint     │
  │  ├── approve_allowlist()    — approve address for CT          │
  │  ├── revoke_allowlist()     — revoke CT approval              │
  │  ├── deposit_to_private()   — move public → confidential      │
  │  ├── withdraw_to_public()   — move confidential → public      │
  │  ├── update_auditor()       — rotate auditor ElGamal key      │
  │  ├── mint_tokens()          — mint to allowlisted address     │
  │  ├── burn_tokens()          — self-burn or authority burn     │
  │  ├── pause() / unpause()    — emergency circuit breaker       │
  │  ├── propose_authority()    — initiate authority transfer     │
  │  └── accept_authority()     — complete authority transfer     │
│                                                              │
│  Allowlist PDA                                               │
│  ├── state (PublicKey)                                       │
│  ├── wallet (PublicKey)                                       │
│  ├── approved: bool                                          │
│  ├── approved_at: i64                                        │
│  └── kyc_provider: String                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Instruction Reference

| Instruction | Authority | Description |
|---|---|---|
| `initialize_private` | Signer | Create state PDA; register PrivateStablecoinState |
| `approve_allowlist` | Authority | Create AllowlistEntry PDA for a KYC'd address |
| `revoke_allowlist` | Authority | Mark AllowlistEntry as revoked |
| `deposit_to_confidential` | Token owner | Move public balance → encrypted balance |
| `withdraw_to_public` | Token owner + ZK proof | Move encrypted balance → public balance |
| `update_auditor` | Authority | Rotate auditor ElGamal public key |
| `mint_tokens` | Authority | Mint to allowlisted address (CPI Token-2022 `mint_to`) |
| `burn_tokens` | Owner or Authority | Burn tokens (owner self-burn or authority force-burn) |
| `pause` | Authority | Halt all confidential operations |
| `unpause` | Authority | Resume operations |
| `propose_authority` | Authority | Propose new authority (step 1 of two-step transfer) |
| `accept_authority` | Pending authority | Accept authority transfer (step 2) |

### `initialize_private`

Creates a Token-2022 mint with the ConfidentialTransferMint extension configured.

```rust
pub fn initialize_private(
    ctx: Context<InitializePrivate>,
    params: InitPrivateParams,
) -> Result<()> {
    // 1. Create mint with extensions:
    //    - MetadataPointer
    //    - MintCloseAuthority
    //    - ConfidentialTransferMint (auto_approve = false)
    //    - Optional: PermanentDelegate, TransferHook
    //
    // 2. Initialize StablecoinState PDA (same as SSS-1)
    //
    // 3. Store auditor ElGamal public key in state
    //
    // 4. Emit InitializePrivateEvent
}
```

**Parameters:**
```rust
pub struct InitPrivateParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub decimals: u8,
    pub auditor_elgamal_pubkey: [u8; 32],  // ElGamal public key for auditor
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
}
```

### `approve_allowlist`

Approves an address for confidential transfers. Only allowlisted (KYC'd) addresses can participate.

```rust
pub fn approve_allowlist(
    ctx: Context<ApproveAllowlist>,
    kyc_provider: String,
) -> Result<()> {
    // 1. Verify authority
    // 2. Create/update AllowlistEntry PDA
    // 3. Call spl_token_2022::confidential_transfer::approve_account()
    // 4. Emit AllowlistApprovedEvent
}
```

### `revoke_allowlist`

Revokes an address's ability to participate in confidential transfers.

```rust
pub fn revoke_allowlist(
    ctx: Context<RevokeAllowlist>,
    reason: String,
) -> Result<()> {
    // 1. Verify authority
    // 2. Mark AllowlistEntry as revoked
    // 3. Optionally freeze the account
    // 4. Emit AllowlistRevokedEvent
}
```

### `deposit_to_private`

Converts public (visible) token balance to confidential (encrypted) balance.

```rust
pub fn deposit_to_private(
    ctx: Context<DepositToPrivate>,
    amount: u64,
) -> Result<()> {
    // 1. Verify sender is on allowlist
    // 2. Call spl_token_2022::confidential_transfer::deposit()
    // 3. Apply pending balance with spl_token_2022::confidential_transfer::apply_pending_balance()
    // 4. Emit DepositToPrivateEvent
}
```

### `withdraw_to_public`

Converts confidential balance back to public balance with a zero-knowledge proof.

```rust
pub fn withdraw_to_public(
    ctx: Context<WithdrawToPublic>,
    amount: u64,
    proof: WithdrawProof,
) -> Result<()> {
    // 1. Verify sender is on allowlist
    // 2. Verify ZK proof of sufficient confidential balance
    // 3. Call spl_token_2022::confidential_transfer::withdraw()
    // 4. Emit WithdrawToPublicEvent
}
```

### `mint_tokens`

Mints tokens to an allowlisted recipient via CPI to Token-2022 `mint_to`. The state PDA signs as mint authority.

```rust
pub fn mint_tokens(ctx: Context<MintTokensPrivate>, amount: u64) -> Result<()>
// Requires: authority, recipient on allowlist, !paused
```

### `burn_tokens`

Burns tokens from a token account. Owner can self-burn; authority can force-burn (permanent delegate path).

```rust
pub fn burn_tokens(ctx: Context<BurnTokensPrivate>, amount: u64) -> Result<()>
// Requires: is_owner || is_authority, !paused
```

### `pause` / `unpause`

Emergency circuit breaker. Authority-only. Blocks `deposit_to_confidential`, `withdraw_to_public`, and `mint_tokens`.

### `propose_authority` / `accept_authority`

Two-step authority transfer to prevent accidental lockouts. Current authority proposes a new key; the new key must sign `accept_authority` to complete the transfer.

---

## Account State

### AllowlistEntry PDA

```rust
#[account]
pub struct AllowlistEntry {
    /// The stablecoin state this entry belongs to
    pub state: Pubkey,
    /// The wallet address approved for confidential transfers
    pub wallet: Pubkey,
    /// Whether the address is currently approved
    pub approved: bool,
    /// Unix timestamp of approval
    pub approved_at: i64,
    /// KYC provider identifier (e.g., "chainalysis", "elliptic")
    pub kyc_provider: String,
    /// Reason for revocation (if revoked)
    pub revocation_reason: String,
}
```

### PrivateStablecoinState (extends StablecoinState)

```rust
#[account]
pub struct PrivateStablecoinState {
    // ... inherits all SSS-1/SSS-2 fields ...
    
    /// Auditor ElGamal public key — can decrypt all confidential transfer amounts
    pub auditor_elgamal_pubkey: [u8; 32],
    /// Number of approved allowlist entries
    pub allowlist_count: u64,
    /// Whether auto-approve is enabled (false = manual KYC required)
    pub auto_approve: bool,
    /// Pending authority for two-step authority transfer
    pub pending_authority: Option<Pubkey>,
}
```

---

## SDK Usage (Planned)

```typescript
import { SolanaStablecoin, Preset } from 'solana-stablecoin-sdk';

// Create SSS-3 private stablecoin
const stablecoin = await SolanaStablecoin.create({
  preset: Preset.SSS_3,
  name: 'Private USD',
  symbol: 'pUSD',
  authority: adminKeypair,
  connection,
  extensions: {
    auditorElGamalKey: auditorPubkey,
    autoApprove: false,
  },
});

// Allowlist a KYC'd user
await stablecoin.privacy.approveAllowlist(userPubkey, 'chainalysis');

// User deposits to confidential balance
await stablecoin.privacy.deposit(1000_000000); // 1000 tokens

// Confidential transfer (amount hidden on-chain)
await stablecoin.privacy.transfer(recipient, 500_000000, proof);

// Auditor can decrypt any transfer amount
const amount = stablecoin.privacy.auditDecrypt(encryptedAmount, auditorSecretKey);
```

---

## Compliance Integration

SSS-3 maintains full regulatory compliance through:

1. **Scoped Allowlist**: Only KYC-verified addresses can use confidential transfers. The `approve_allowlist` instruction gates access.

2. **Auditor Key**: Every confidential transfer's amount is encrypted with the auditor's ElGamal key, allowing authorized auditors to decrypt all amounts for regulatory reporting.

3. **Freeze & Seize**: If combined with SSS-2 extensions, the issuer retains the ability to freeze accounts and seize funds even from confidential balances (via the permanent delegate).

4. **Deposit/Withdraw Logging**: All conversions between public and confidential balances emit on-chain events with clear audit trails.

---

## Current Limitations

| Limitation | Details |
|-----------|---------|
| **ZK Proof Generation** | Client-side proof generation requires the `solana-zk-sdk` crate, which is still maturing and has limited WASM support |
| **Transaction Size** | Confidential transfer proofs are large (~1KB), limiting composability within single transactions |
| **ElGamal Key Management** | Users must generate and store ElGamal keypairs separately from their Solana keypairs |
| **Browser Support** | ZK proof generation in browsers requires WASM bindings that are not yet stable |
| **Auditor Trust** | The auditor can decrypt all amounts — requires a trusted auditor setup |

---

## Roadmap

- [x] Implement on-chain program with Anchor 0.32 (deployed devnet: `4ea2tTJiMRW3Nov8K4hEd3JPppiY1oPU2p5zri8JAnkX`)
- [x] Full instruction set: initialize, allowlist, mint, burn, pause, authority transfer
- [ ] Integrate `solana-zk-sdk` for actual ConfidentialTransferMint extension initialization
- [ ] Build SDK module (`stablecoin.privacy.*`)
- [ ] Add browser-compatible WASM proof generation
- [ ] Integration tests with localnet
- [ ] Auditor dashboard for transaction decryption
- [ ] Multi-auditor support (threshold encryption)

---

## References

- [SPL Token-2022 Confidential Transfers](https://spl.solana.com/confidential-token)
- [Solana ZK SDK](https://github.com/solana-labs/solana/tree/master/zk-sdk)
- [ElGamal Encryption on Solana](https://docs.solana.com/developing/programming-model/zk-token-proof)
- [SSS-1 Standard](./SSS-1.md)
- [SSS-2 Standard](./SSS-2.md)
