# Compliance Guide

This document covers regulatory considerations, compliance features, and the audit trail format for stablecoin issuers using the Solana Stablecoin Standard (SSS).

---

## Regulatory Framework

### Mapping SSS to Stablecoin Regulations

SSS is designed to satisfy the operational requirements of major stablecoin regulatory frameworks:

| Regulatory Requirement | SSS Feature | Preset |
|---|---|---|
| **MiCA (EU) — Asset-referenced token controls** | Role-based access control, pause, freeze, on-chain audit trail | SSS-1, SSS-2 |
| **MiCA — Reserve management transparency** | `total_minted` / `total_burned` counters on `StablecoinConfig`; per-minter quota tracking | SSS-1, SSS-2 |
| **MiCA — Orderly wind-down capability** | Global pause halts all operations; `MintCloseAuthority` allows reclaiming the mint when supply reaches zero | SSS-1, SSS-2 |
| **US State MTL — Transaction monitoring** | Transfer hook intercepts every transfer; on-chain events for all operations | SSS-2 |
| **US State MTL — Suspicious activity blocking** | Bidirectional blacklist blocks sending and receiving; account freeze for immediate lockdown | SSS-2 |
| **OFAC / Sanctions enforcement** | Blacklist with reason tracking; token seizure via permanent delegate; immutable audit entries | SSS-2 |
| **KYC / AML gating** | Default frozen accounts — new token accounts must be explicitly thawed after identity verification | SSS-2 |

### Role Model Alignment with Circle FiatToken v2

SSS follows the same role separation pioneered by Circle's FiatToken v2 contract, adapted for Solana's account model:

| Circle FiatToken v2 | SSS Equivalent | Responsibility |
|---|---|---|
| `admin` | `authority` | Master admin; can reassign all roles, initiate authority transfer, seize tokens (SSS-2) |
| `masterMinter` | `master_minter` | Configures and removes minters; sets per-minter quotas |
| `pauser` | `pauser` | Emergency circuit breaker; can pause and unpause all operations |
| `blacklister` | `blacklister` | Manages the on-chain blacklist (SSS-2); can freeze/thaw individual accounts |

All four roles are stored in a single `StablecoinConfig` PDA at `["config", mint]`, making the complete authorization state readable in one on-chain account fetch.

### Two-Step Authority Transfer

The `authority` role uses a mandatory two-step transfer process to prevent accidental loss of control:

1. **Initiate:** The current authority calls `transfer_authority`, setting `pending_authority` to the new address. The current authority retains full control.
2. **Accept:** The new authority calls `accept_authority` with its own keypair. Only after this step does control transfer.

The transfer can be cancelled at any time before acceptance by the current authority overwriting `pending_authority` with a different address or `Pubkey::default()`. This pattern guarantees that authority is never transferred to an unreachable address.

---

## Compliance Features by Preset

### SSS-1: Minimal

**Suitable for:** Internal tokens, DAO treasuries, bridged assets, non-regulated or self-regulated use cases.

| Feature | Available | Notes |
|---|---|---|
| Minting with quota enforcement | Yes | Per-minter lifetime caps set by `master_minter` |
| Burning | Yes | Any token holder can burn from their own account |
| Account freeze / thaw | Yes | Blocks sending and receiving on a specific token account |
| Global pause | Yes | Halts all minting and burning |
| Role-based access control | Yes | Four distinct roles with separation of duties |
| Two-step authority transfer | Yes | Prevents accidental authority loss |
| On-chain metadata | Yes | Name, symbol, URI stored on the mint via Token-2022 |
| Bidirectional blacklist | No | — |
| Default frozen (KYC gate) | No | New accounts start unfrozen |
| Token seizure (clawback) | No | `seize` returns `PresetFeatureUnavailable` |
| Transfer hook enforcement | No | No per-transfer compliance checks |

SSS-1 provides basic operational controls. Compliance enforcement must be handled off-chain or through external systems.

### SSS-2: Compliant

**Suitable for:** Regulated stablecoins, e-money tokens under MiCA, USD-backed stablecoins operating under US state licensing.

SSS-2 includes everything in SSS-1 plus the following compliance features:

#### Bidirectional Blacklisting

The transfer hook program (`sss-hook`) intercepts every `transfer_checked` call and checks both the source and destination wallet against the on-chain blacklist. This means:

- A blacklisted wallet cannot **send** tokens (source check)
- A blacklisted wallet cannot **receive** tokens (destination check)
- Both checks happen atomically within the transfer; there is no window for circumvention

This is stronger than Token-2022's built-in freeze, which only prevents the frozen account from initiating transfers but does not prevent others from sending tokens to it.

#### Default Frozen State (KYC Gate)

All new token accounts are created in a frozen state via the `DefaultAccountState` extension. Before a user can hold or transfer tokens, their token account must be explicitly thawed by the `authority` or `blacklister`:

```
User creates token account → Account is frozen by default
                                     ↓
                           KYC/AML verification (off-chain)
                                     ↓
                           authority or blacklister calls thaw_account
                                     ↓
                           Account is active — user can transact
```

This creates a natural compliance gate: only users who have completed your onboarding process can participate.

#### Token Seizure via Permanent Delegate

The `PermanentDelegate` extension designates the `mint_authority` PDA as a permanent delegate on all token accounts. This enables the `authority` to transfer tokens out of any account without the holder's signature:

- Used for court-ordered asset recovery, sanctions enforcement, or fraud remediation
- Tokens are transferred to a specified treasury account
- The operation emits a `TokensSeized` event with full audit metadata
- Only the `authority` role can invoke seizure; the permanent delegate is the program's PDA, not any external wallet

#### Pause System (Emergency Circuit Breaker)

The `pauser` can halt all minting, burning, and (via the transfer hook) all transfers with a single instruction. Freeze and thaw operations remain available during a pause, allowing compliance actions to continue even in an emergency.

---

## Audit Trail

### On-Chain Events

Every state-changing operation in SSS emits an Anchor event. These events are encoded in transaction logs and can be parsed by any Anchor-compatible indexer.

#### Core Program Events (sss-core)

| Event | Fields | Trigger |
|---|---|---|
| `StablecoinInitialized` | `mint`, `preset`, `authority`, `decimals`, `name`, `symbol` | New stablecoin deployed |
| `MinterConfigured` | `config`, `minter`, `quota`, `configured_by` | Minter quota set or updated |
| `MinterRemoved` | `config`, `minter`, `removed_by` | Minter disabled |
| `TokensMinted` | `config`, `minter`, `destination`, `amount`, `remaining_quota` | Tokens minted |
| `TokensBurned` | `config`, `burner`, `amount`, `total_burned` | Tokens burned |
| `AccountFrozen` | `config`, `token_account`, `frozen_by` | Token account frozen |
| `AccountThawed` | `config`, `token_account`, `thawed_by` | Token account thawed |
| `Paused` | `config`, `paused_by` | Operations paused |
| `Unpaused` | `config`, `unpaused_by` | Operations resumed |
| `RoleUpdated` | `config`, `role`, `old_value`, `new_value`, `updated_by` | Role reassigned |
| `AuthorityTransferInitiated` | `config`, `current_authority`, `pending_authority` | Authority transfer started |
| `AuthorityTransferAccepted` | `config`, `old_authority`, `new_authority` | Authority transfer completed |
| `TokensSeized` | `config`, `from_account`, `to_account`, `amount`, `seized_by` | Tokens seized (SSS-2) |

#### Hook Program Events (sss-hook)

| Event | Fields | Trigger |
|---|---|---|
| `HookInitialized` | `mint`, `hook_config` | Transfer hook set up for SSS-2 mint |
| `AddedToBlacklist` | `mint`, `wallet`, `reason`, `blacklisted_by` | Wallet blacklisted |
| `RemovedFromBlacklist` | `mint`, `wallet`, `removed_by` | Wallet removed from blacklist |

### Querying Events via Solana RPC

#### Get Recent Transactions for a Program

Use `getSignaturesForAddress` to retrieve transaction signatures involving either program:

```typescript
const signatures = await connection.getSignaturesForAddress(
  new PublicKey("CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y"), // sss-core
  { limit: 100 }
);

for (const sig of signatures) {
  const tx = await connection.getTransaction(sig.signature, {
    maxSupportedTransactionVersion: 0,
  });
  // Parse Anchor events from tx.meta.logMessages
}
```

#### Get All Minter Accounts for a Mint

Use `getProgramAccounts` with discriminator and config PDA filters:

```typescript
const discriminator = Buffer.from([251, 69, 145, 137, 48, 218, 88, 148]);
const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("config"), mint.toBuffer()],
  SSS_CORE_PROGRAM_ID
);

const accounts = await connection.getProgramAccounts(SSS_CORE_PROGRAM_ID, {
  filters: [
    { memcmp: { offset: 0, bytes: discriminator.toString("base64") } },
    { memcmp: { offset: 8, bytes: configPda.toBase58() } },
  ],
});
```

#### Check Blacklist Status

```typescript
const [blacklistPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("blacklist"), mint.toBuffer(), wallet.toBuffer()],
  SSS_HOOK_PROGRAM_ID
);

const accountInfo = await connection.getAccountInfo(blacklistPda);
// If null, wallet is not blacklisted
// If exists, parse BlacklistEntry: offset 72 = blacklisted flag (1 byte)
```

### Backend Indexer Service

The SSS backend includes a dedicated event indexer (`backend/src/services/indexer.ts`) that provides persistent audit storage:

1. **WebSocket subscriptions** to both `sss-core` and `sss-hook` programs via `connection.onLogs()`
2. **Anchor event parsing** using `BorshCoder` and `EventParser` from the program IDLs
3. **SQLite persistence** in the `events` table with indexed fields for `event_type`, `slot`, and `signature`
4. **Automatic reconnection** with a 5-second delay if the WebSocket connection drops

The indexer runs as a standalone service on port 3001 with its own health check endpoint.

**Events table schema:**

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER | Auto-incrementing primary key |
| `event_type` | TEXT | Event name (e.g., `TokensMinted`) |
| `program_id` | TEXT | Program that emitted the event |
| `signature` | TEXT | Transaction signature |
| `slot` | INTEGER | Slot number |
| `block_time` | INTEGER | Block timestamp (nullable) |
| `data` | TEXT | JSON-encoded event payload |
| `created_at` | TEXT | Insertion timestamp |

**Audit trail table schema:**

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER | Auto-incrementing primary key |
| `action` | TEXT | Action identifier (e.g., `blacklist_add`, `mint_initiated`) |
| `actor` | TEXT | Who performed the action |
| `target` | TEXT | Target address (nullable) |
| `details` | TEXT | JSON-encoded metadata |
| `timestamp` | TEXT | When the action occurred |

### Webhook Integration for Real-Time Alerts

The webhook service (`backend/src/services/webhook.ts`) delivers real-time compliance alerts:

1. **Event-driven dispatch**: polls the events table every 2 seconds for new entries
2. **Filtered subscriptions**: webhooks can subscribe to specific event types or all events (`*`)
3. **HMAC-SHA256 signing**: each delivery includes an `X-SSS-Signature` header computed over the JSON payload using the webhook's secret
4. **Retry with exponential backoff**: failed deliveries are retried up to 3 times (configurable) with exponential delay (1s, 2s, 4s)
5. **Delivery history**: all delivery attempts are logged in the `webhook_deliveries` table with status codes, response bodies, and errors

**Recommended webhook subscriptions for compliance teams:**

| Event Types | Purpose |
|---|---|
| `AddedToBlacklist,RemovedFromBlacklist` | Blacklist change notifications |
| `TokensSeized` | Seizure alerts for legal/compliance review |
| `Paused,Unpaused` | Emergency pause notifications |
| `AuthorityTransferInitiated,AuthorityTransferAccepted` | Authority change monitoring |
| `AccountFrozen,AccountThawed` | Account status change tracking |
| `*` | Full audit stream for SIEM integration |

---

## Blacklist Management

### Adding and Removing Wallets

Blacklist operations are performed by the `blacklister` role. Each entry includes a human-readable reason (max 64 characters) for audit purposes.

**Add to blacklist:**

```bash
sss-token blacklist add \
  --mint <MINT_ADDRESS> \
  --wallet <WALLET_ADDRESS> \
  --reason "OFAC SDN match — case ID 20240101-001" \
  --keypair /path/to/blacklister.json
```

**Remove from blacklist:**

```bash
sss-token blacklist remove \
  --mint <MINT_ADDRESS> \
  --wallet <WALLET_ADDRESS> \
  --keypair /path/to/blacklister.json
```

### BlacklistEntry PDA Schema

Each blacklist entry is stored as a PDA derived from `["blacklist", mint, wallet]`, owned by the `sss-hook` program:

| Field | Type | Size | Description |
|---|---|---|---|
| `discriminator` | `[u8; 8]` | 8 bytes | Anchor account discriminator |
| `mint` | `Pubkey` | 32 bytes | Stablecoin mint this entry belongs to |
| `wallet` | `Pubkey` | 32 bytes | The blacklisted wallet address |
| `blacklisted` | `bool` | 1 byte | Whether the wallet is currently blacklisted |
| `reason` | `String` | up to 68 bytes | Human-readable reason (4-byte length prefix + max 64 bytes) |
| `blacklisted_at` | `i64` | 8 bytes | Unix timestamp of initial blacklisting |
| `blacklisted_by` | `Pubkey` | 32 bytes | Address of the blacklister at time of action |
| `bump` | `u8` | 1 byte | PDA bump seed |

Blacklist entries are per-mint. A wallet blacklisted on one stablecoin is not affected on another.

When a wallet is removed from the blacklist, the PDA is retained with `blacklisted = false`. This preserves the historical record (who blacklisted, when, and why) for audit purposes.

### Dual Blocking Mechanism

SSS-2 provides two complementary blocking mechanisms:

| Mechanism | Scope | Direction | When to Use |
|---|---|---|---|
| **Freeze** (Token-2022) | Single token account | Blocks outgoing transfers from the frozen account | Immediate lockdown of a specific account |
| **Blacklist** (Transfer hook) | All token accounts owned by a wallet | Blocks both sending and receiving | Comprehensive wallet-level sanctions enforcement |

**Recommended enforcement flow:**

1. **Freeze first** — immediately freeze the target token account to prevent outgoing transfers
2. **Blacklist** — add the wallet to the blacklist to block incoming transfers from other accounts
3. **Investigate** — review the situation with full audit trail access
4. **Seize if ordered** — if required by court order or sanctions authority, seize tokens to treasury

### Audit Fields

Every blacklist operation creates an immutable audit record:

- **On-chain (`BlacklistEntry` PDA):** `blacklisted_by` (who), `blacklisted_at` (when), `reason` (why)
- **On-chain (Anchor event):** `AddedToBlacklist` or `RemovedFromBlacklist` event in transaction logs
- **Off-chain (backend audit trail):** Additional metadata in the `audit_trail` table including the API actor and blacklist PDA address

---

## Seizure Process

### Legal Context

Token seizure (clawback) is a regulated action typically performed under:

- Court orders requiring asset freezing or confiscation
- OFAC sanctions enforcement where designated entities hold tokens
- Fraud remediation where stolen funds must be returned
- Regulatory directives requiring immediate asset recovery

Seizure should only be performed by the `authority` role, which should be controlled by a multisig or institutional key management system.

### PermanentDelegate Mechanism

SSS-2 uses the Token-2022 `PermanentDelegate` extension to enable seizure:

- The `mint_authority` PDA (derived from `["mint-authority", mint]`) is registered as the permanent delegate on the mint
- This gives the PDA authority to transfer tokens from any token account associated with the mint
- The PDA can only sign through the `sss-core` program's `seize` instruction, which enforces authorization checks
- No external wallet can directly invoke the permanent delegate; it must go through the program

### Seizure Flow

```
1. Authority initiates seize instruction
        │
        ▼
2. Program verifies:
   - Caller is config.authority
   - Preset is SSS-2 (preset >= 2)
        │
        ▼
3. CPI to Token-2022 transfer_checked
   - Signed by mint_authority PDA (permanent delegate)
   - Transfers specified amount from target account to treasury account
        │
        ▼
4. Transfer hook is invoked (if target is not blacklisted, transfer proceeds)
   - Note: if target IS blacklisted, temporarily remove from blacklist,
     seize, then re-add — or verify hook behavior for delegate-signed transfers
        │
        ▼
5. TokensSeized event emitted with:
   - config: StablecoinConfig PDA
   - from_account: source token account
   - to_account: treasury token account
   - amount: tokens transferred
   - seized_by: authority address
```

### Audit Trail for Seizure Operations

Every seizure produces the following audit records:

1. **On-chain transaction**: The `seize` instruction and all CPIs are recorded in the transaction
2. **Anchor event (`TokensSeized`)**: Emitted in transaction logs with `config`, `from_account`, `to_account`, `amount`, and `seized_by`
3. **Backend event record**: The indexer captures the event and stores it in the `events` table
4. **Webhook notifications**: All registered webhooks subscribed to `TokensSeized` receive a delivery
5. **Token-2022 transfer record**: The underlying `transfer_checked` CPI also creates standard SPL token transfer records

---

## Compliance Recommendations

### Key Management

| Role | Recommended Key Type | Rationale |
|---|---|---|
| `authority` | Multisig (e.g., Squads Protocol) | Highest privilege; multi-party approval prevents unilateral action |
| `master_minter` | Hardware wallet or multisig | Controls token supply; compromise leads to unauthorized minting |
| `pauser` | Hot wallet (single signer) | Must be fast to respond in emergencies; low compromise impact (pause is non-destructive) |
| `blacklister` | Hardware wallet | Compliance-sensitive; actions have legal implications |

**Additional key management practices:**

- Store authority multisig threshold at 3-of-5 or higher for mainnet deployments
- Keep the `pauser` key readily accessible (not in cold storage) for emergency response
- Rotate role assignments periodically and after any personnel changes
- Never store private keys in environment variables, source code, or CI/CD pipelines

### Regular Audit Log Review

Establish a recurring review cadence:

| Review Type | Frequency | What to Check |
|---|---|---|
| Minting activity | Daily | Total minted vs. reserves; per-minter quota consumption |
| Blacklist changes | Daily | New additions/removals; verify reasons match internal case files |
| Role changes | Weekly | Any `RoleUpdated` or authority transfer events; verify against change management records |
| Pause events | Immediately (via webhook) | Any pause should trigger incident review |
| Seizure events | Immediately (via webhook) | Every seizure must have corresponding legal authorization on file |

Use the backend `GET /api/audit` endpoint or direct SQLite queries against the `audit_trail` table for review. For automated monitoring, configure webhooks to deliver events to your SIEM or compliance dashboard.

### Incident Response Playbook

**Severity 1 — Suspected compromise of a role key:**

1. **Pause** all operations immediately (if not already paused)
2. **Rotate** the compromised role to a new key using `update_role`
3. If `authority` is compromised and `pending_authority` is set, cancel the transfer
4. **Review** all actions performed by the compromised key since last known good state
5. **Unpause** only after the situation is fully assessed and the key is rotated

**Severity 2 — Sanctions match or AML alert on an active wallet:**

1. **Freeze** the wallet's token account immediately (does not require unpause)
2. **Blacklist** the wallet to block incoming transfers from other accounts
3. **File SAR** if required by your jurisdiction
4. **Seize** tokens only with proper legal authorization (court order, regulatory directive)
5. **Document** the full timeline in your compliance case management system

**Severity 3 — Suspected protocol exploit:**

1. **Pause** all operations
2. **Assess** on-chain state: check `total_minted`, `total_burned`, minter quotas for anomalies
3. **Freeze** any suspicious accounts
4. **Engage** security auditors for forensic review
5. **Unpause** only after root cause is identified and mitigated

### Record Retention Requirements

Maintain records in accordance with your jurisdiction's requirements:

| Jurisdiction | Minimum Retention | Applicable Records |
|---|---|---|
| US (BSA/AML) | 5 years | Transaction records, SAR filings, KYC documentation |
| EU (MiCA / AMLD) | 5 years after relationship ends | All transaction data, blacklist actions, identity records |
| FATF Recommendation 11 | 5 years | All transaction records, identification data, correspondence |

**On-chain records are permanent** — all events, blacklist entries (even after removal), and minter states (even after disabling) are retained on the Solana ledger. However, on-chain data alone may not satisfy retention requirements. Maintain the backend database and any exported audit logs for the required retention period.

**Recommended retention strategy:**

1. **On-chain**: Permanent by design; no action needed
2. **Backend SQLite database**: Back up daily; retain backups for the full retention period
3. **Webhook delivery logs**: Retain for at least 1 year for debugging; longer if used as compliance evidence
4. **Off-chain case files**: Store blacklist reasons, court orders, and SAR documentation in your compliance case management system for the full retention period
