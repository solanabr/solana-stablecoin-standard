# Compliance Documentation

This document explains how the Solana Stablecoin Standard addresses regulatory compliance requirements for stablecoin issuers. It covers the regulatory context, enforcement mechanisms, audit capabilities, and role separation model.

**Programs:**
- `sss-core`: `G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL`
- `sss-transfer-hook`: `EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389`

---

## Table of Contents

- [Regulatory Context](#regulatory-context)
- [Compliance Architecture](#compliance-architecture)
- [Blacklist Enforcement](#blacklist-enforcement)
- [Seizure Authority and Safeguards](#seizure-authority-and-safeguards)
- [KYC Gating](#kyc-gating)
- [Audit Trail](#audit-trail)
- [Role Separation](#role-separation)
- [Compliance Checklist](#compliance-checklist)

---

## Regulatory Context

### U.S. Stablecoin Legislation

The GENIUS Act (Guiding and Establishing National Innovation for U.S. Stablecoins) and related proposals establish requirements for payment stablecoin issuers:

1. **Reserve backing** -- 1:1 backing with high-quality assets
2. **Sanctions compliance** -- Block transactions involving sanctioned addresses (OFAC SDN list)
3. **Law enforcement cooperation** -- Ability to freeze accounts and seize assets pursuant to court orders
4. **Transparency** -- Regular attestations and disclosures
5. **Consumer protection** -- Redemption guarantees and clear terms

### How SSS Addresses These Requirements

| Requirement | SSS Feature | Preset |
|------------|------------|--------|
| Sanctions screening | Blacklist + transfer hook enforcement | SSS-2 |
| Account freezing | Freeze/thaw with role-based access | SSS-1, SSS-2 |
| Asset seizure | Atomic seize instruction | SSS-2 |
| KYC/AML gating | DefaultAccountState::Frozen | SSS-2 |
| Pause capability | Global pause (authority-controlled) | SSS-1, SSS-2 |
| Audit trail | Anchor events on all operations | SSS-1, SSS-2 |
| Role separation | Six distinct roles with separation of duties | SSS-1, SSS-2 |
| Authority governance | Two-step authority transfer | SSS-1, SSS-2 |
| Allowlist enforcement | Only approved addresses can hold tokens | SSS-3 |
| Supply cap | Maximum supply limit enforcement | SSS-3 |

---

## Compliance Architecture

SSS-2 implements a layered compliance architecture:

```
Layer 3: Off-chain (backend services, sanctions APIs, KYC providers)
  |
  v
Layer 2: On-chain enforcement (transfer hook, blacklist PDAs, allowlist PDAs)
  |
  v
Layer 1: Token primitives (Token-2022 extensions)
  |
  v
Layer 0: Solana runtime
```

### Layer 1: Token-2022 Extensions

These are immutable properties set at mint creation:

- **PermanentDelegate** -- Allows the program to burn tokens from any account
- **TransferHook** -- Ensures every transfer is validated
- **DefaultAccountState::Frozen** -- New accounts must be explicitly approved

### Layer 2: On-chain Enforcement

The transfer hook program runs on every transfer and checks:

1. Is the stablecoin paused? Block if yes.
2. Is the sender blacklisted? Block if yes.
3. Is the receiver blacklisted? Block if yes.
4. If allowlist enabled: Is the sender allowlisted? Block if no.
5. If allowlist enabled: Is the receiver allowlisted? Block if no.

This enforcement is **inescapable** -- it applies to all transfers regardless of how they are initiated (wallet, DEX, program CPI). There is no way to bypass the transfer hook once the extension is set.

### Layer 3: Off-chain Integration

The backend services provide:

- Sanctions screening against OFAC and other lists
- KYC verification workflow
- Audit event storage and querying
- Webhook notifications for compliance events

---

## Blacklist Enforcement

### Mechanism

The blacklist uses on-chain PDA existence as the source of truth:

```
BlacklistEntry PDA exists   -> Address is blacklisted
BlacklistEntry PDA absent   -> Address is not blacklisted
```

PDA seeds: `["blacklist", config.key(), address.key()]`

### Transfer-Level Enforcement

The transfer hook enforces the blacklist on every transfer:

1. Token-2022 calls the transfer hook program
2. The hook resolves the sender and receiver wallet addresses from the token account data (bytes 32-63 = owner)
3. For each wallet, it derives the blacklist PDA
4. If the PDA exists and is owned by sss-core, the transfer is blocked

This check covers both sides of every transfer:
- **Sender** cannot send tokens if blacklisted
- **Receiver** cannot receive tokens if blacklisted

### Fail-Closed Design

The transfer hook is fail-closed:

- If the config PDA cannot be read, transfers are blocked
- If the blacklist PDA derivation fails, transfers are blocked
- If any account data is inconsistent, transfers are blocked

This ensures that a corrupted or unavailable state defaults to blocking transfers rather than allowing them.

### Blacklist Operations

| Operation | Role | On-Chain Effect |
|-----------|------|----------------|
| Add to blacklist | Blacklister | Creates BlacklistEntry PDA |
| Remove from blacklist | Blacklister | Closes BlacklistEntry PDA, returns rent |
| Check blacklist | Anyone | Read-only PDA lookup |

### Timing

Blacklist changes take effect immediately:

- **Adding:** The next transfer involving the address will be blocked
- **Removing:** The next transfer involving the address will succeed

There is no delay or queuing. Blacklist PDA creation/closure is atomic within a single Solana transaction.

---

## Seizure Authority and Safeguards

### Purpose

Asset seizure enables recovery of tokens from sanctioned or court-ordered accounts. This is a standard capability for regulated stablecoins (USDC, PYUSD, BUSD all implement equivalent functionality).

### Prerequisites (All Required)

1. **Target must be blacklisted** -- The `seize` instruction requires a valid `BlacklistEntry` PDA as an account input. The Anchor constraint `blacklist_entry.config == config.key()` is verified. Without a blacklist entry, the instruction fails with `SeizeNonBlacklisted`.

2. **Caller must hold the Seizer role** -- The `seizer_role` RoleAssignment PDA must exist and be associated with the correct config.

3. **Compliance must be enabled** -- `config.compliance_enabled == true` is checked at the Anchor constraint level.

4. **Stablecoin must not be paused** -- `config.paused == false` is checked at the Anchor constraint level.

### Atomic Execution

The seize instruction performs four operations in a single atomic transaction:

```
1. Thaw the source token account
   Reason: DefaultAccountState::Frozen means the account is frozen.
   Authority: Config PDA (freeze authority)

2. Burn tokens from the source account
   Reason: Remove tokens from the blacklisted address.
   Authority: Config PDA (permanent delegate)

3. Refreeze the source account
   Reason: Maintain the frozen-by-default invariant.
   Authority: Config PDA (freeze authority)

4. Mint equivalent tokens to treasury
   Reason: Restore the token supply to its pre-seize level.
   Authority: Config PDA (mint authority)
```

If any step fails, the entire transaction reverts. There is no partial seizure state.

### Supply Invariant

Seizure does not change the net supply:

```
Before: net_supply = total_minted - total_burned
Seize:  total_minted += amount, total_burned += amount
After:  net_supply = (total_minted + amount) - (total_burned + amount) = same
```

### Safeguards Against Abuse

| Safeguard | Mechanism |
|-----------|-----------|
| Blacklist requirement | Cannot seize from a non-blacklisted address |
| Role separation | Seizer cannot blacklist; Blacklister cannot seize |
| On-chain audit trail | `TokensSeized` event with from, to, amount, seizer |
| Pause gating | Seizure blocked during pause |
| Authority oversight | Authority controls who holds the Seizer role |
| Two-person rule | Blacklisting and seizure require two different role holders |

### Seize vs. Freeze

| | Freeze | Seize |
|---|--------|-------|
| Tokens moved? | No | Yes (to treasury) |
| Account state after | Frozen | Frozen (refrozen) |
| Supply change | None | None (burn + mint cancel out) |
| Prerequisite | None | Must be blacklisted |
| Role | Freezer | Seizer |
| Reversible? | Yes (thaw) | No (tokens are in treasury) |

---

## KYC Gating

### Mechanism

SSS-2 uses `DefaultAccountState::Frozen` to enforce KYC:

1. User creates a token account for the mint (e.g., via Associated Token Account)
2. The account is created in a **Frozen** state by default
3. User cannot send or receive tokens
4. User completes KYC verification off-chain
5. A Freezer role holder thaws the account
6. User can now transact

### KYC Workflow

```
+---------------------+
| User opens wallet   |
| Creates token acct  |  <-- Account is FROZEN
+---------------------+
         |
         v
+---------------------+
| User submits KYC    |
| ID, address, etc.   |  <-- Off-chain process
+---------------------+
         |
         v
+---------------------+
| KYC provider        |
| verifies identity   |  <-- Off-chain verification
+---------------------+
         |
         v
+---------------------+
| Freezer calls       |
| thaw_account()      |  <-- On-chain: account THAWED
+---------------------+
         |
         v
+---------------------+
| User can transact   |  <-- Fully operational
+---------------------+
```

### Advantages

- **No token can reach an unverified account** -- Even if someone sends tokens to a frozen account, the transfer hook blocks it (frozen accounts cannot receive via `transfer_checked`)
- **Retroactive freeze** -- If KYC expires or is revoked, the Freezer can re-freeze the account
- **No off-chain dependency** -- The freeze state is enforced on-chain by Token-2022, not by an external service

### Limitations

- KYC verification itself is off-chain -- SSS does not store identity data on-chain
- The link between wallet address and identity is maintained off-chain by the issuer
- Token accounts for other mints are not affected

---

## Audit Trail

### On-Chain Events

All compliance-relevant operations emit Anchor events stored in Solana transaction logs:

| Event | Compliance Significance |
|-------|------------------------|
| `AddressBlacklisted` | Sanctions enforcement action |
| `AddressUnblacklisted` | Sanctions reversal |
| `TokensSeized` | Asset recovery action |
| `AccountFrozen` | Account restriction |
| `AccountThawed` | Account approval (KYC) |
| `StablecoinPaused` | System-wide halt |
| `StablecoinUnpaused` | System recovery |
| `RoleGranted` | Access grant |
| `RoleRevoked` | Access revocation |
| `TokensMinted` | Supply expansion |
| `TokensBurned` | Supply contraction |
| `AuthorityTransferred` | Governance change |
| `QuotaSet` | Minting limit change |

### Event Fields

Each event includes the `config` pubkey, linking it to the specific stablecoin. Compliance events include the actor:

- `AddressBlacklisted`: `{ config, address, blacklister }`
- `TokensSeized`: `{ config, from, to, amount, seizer }`
- `AccountFrozen`: `{ config, target, freezer }`

### Querying Events

**CLI:**

```bash
sss-token audit-log --limit 100
```

**Backend indexer:**

```bash
curl http://localhost:8083/events?type=blacklist&limit=50
```

**Direct RPC:**

```typescript
const signatures = await connection.getSignaturesForAddress(configAddress, {
  limit: 100,
});
```

### Immutability

On-chain events cannot be altered or deleted. They are part of the Solana ledger and persist as long as the transaction history is available. This provides a tamper-proof audit trail for regulatory compliance.

---

## Role Separation

### Role Matrix

| Operation | Authority | Minter | Freezer | Blacklister | Seizer |
|-----------|-----------|--------|---------|-------------|--------|
| pause / unpause | X | | | | |
| propose / accept authority | X | | | | |
| grant / revoke role | X | | | | |
| set quota | X | | | | |
| set metadata | X | | | | |
| mint tokens | | X | | | |
| burn tokens | (any holder) | (any holder) | (any holder) | (any holder) | (any holder) |
| freeze / thaw account | | | X | | |
| add / remove blacklist | | | | X | |
| seize tokens | | | | | X |

### Separation of Duties

The role model enforces critical separations:

1. **Blacklister vs. Seizer** -- The person who adds an address to the blacklist cannot seize tokens from that address. This prevents a single actor from both targeting and extracting funds.

2. **Minter vs. Authority** -- Minters can only mint within their quota. The authority sets quotas but cannot mint directly.

3. **Freezer vs. Blacklister** -- Freezing an account is a different operation from blacklisting. A frozen account can still have tokens seized (if also blacklisted), but a blacklisted-only account continues to hold tokens until explicitly seized.

4. **All roles vs. Authority** -- Only the authority can grant or revoke roles. Role holders cannot escalate their own privileges.

### Recommended Key Management

| Role | Recommended Setup |
|------|-------------------|
| Authority | Hardware wallet, multi-sig (via Squads or similar), cold storage |
| Minter | Hot wallet with operational access, rate-limited by quota |
| Freezer | Operational wallet, possibly automated for KYC workflows |
| Blacklister | Compliance team wallet, triggered by sanctions screening |
| Seizer | Legal team wallet, requires documented authorization |

### Multi-Signature Support

SSS roles are assigned to Solana addresses. For multi-signature control, use a Squads multisig or similar on-chain multisig program as the role holder. The multisig address would be granted the role, and execution would require the configured threshold of signers.

---

## Compliance Checklist

### Pre-Launch

- [ ] Choose preset (SSS-1 for basic, SSS-2 for regulated)
- [ ] Deploy programs to target cluster
- [ ] Initialize stablecoin with correct parameters
- [ ] Grant roles to appropriate operational wallets
- [ ] Set minter quotas aligned with reserve backing
- [ ] For SSS-2: initialize transfer hook ExtraAccountMetaList
- [ ] For SSS-3: add authority and initial participants to allowlist
- [ ] For SSS-3: set supply cap during initialization
- [ ] Test all operations on devnet
- [ ] Document key holders and role assignments
- [ ] Establish KYC/AML provider integration (SSS-2)
- [ ] Set up sanctions screening automation (SSS-2)

### Ongoing Operations

- [ ] Monitor blacklist additions/removals
- [ ] Review minter quota usage weekly
- [ ] Audit role assignments quarterly
- [ ] Review seizure events with legal counsel
- [ ] Maintain KYC records off-chain
- [ ] Screen against updated sanctions lists
- [ ] Monitor pause events and investigate causes
- [ ] Track supply metrics against reserve attestations

### Incident Response

- [ ] Pause procedure documented and tested
- [ ] Emergency blacklist procedure documented
- [ ] Authority rotation procedure documented
- [ ] Contact list for legal and compliance teams
- [ ] Escalation path for seizure requests
- [ ] Post-incident review process
