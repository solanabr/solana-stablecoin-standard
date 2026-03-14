# Event Reference

## Event Overview

All state-changing operations emit events for audit and monitoring purposes. Events are stored in transaction logs and can be indexed by the backend indexer service.

## Event Types

### Lifecycle Events

#### `Initialized`

Emitted when a new stablecoin is created.

```rust
pub struct Initialized {
    pub config: Pubkey,           // Config PDA address
    pub mint: Pubkey,             // Token mint address
    pub master: Pubkey,           // Master authority
    pub preset: u8,               // 1 = SSS-1, 2 = SSS-2
    pub compliance_enabled: bool, // SSS-2 features enabled
    pub transfer_hook_enabled: bool,
    pub permanent_delegate_enabled: bool,
}
```

**Indexing**: Primary key is `config` or `mint`.

---

#### `Minted`

Emitted when tokens are minted.

```rust
pub struct Minted {
    pub mint: Pubkey,             // Token mint
    pub to: Pubkey,               // Recipient token account
    pub minter: Pubkey,           // Minter authority
    pub amount: u64,              // Amount minted
    pub quota_used: u64,          // Quota consumed in window
    pub quota_limit: u64,         // Total quota
}
```

**Monitoring**: Track large mints, quota usage trends.

---

#### `Burned`

Emitted when tokens are burned.

```rust
pub struct Burned {
    pub mint: Pubkey,             // Token mint
    pub from: Pubkey,             // Source token account
    pub authority: Pubkey,        // Burner authority
    pub amount: u64,              // Amount burned
}
```

---

### Control Events

#### `AccountFrozen`

Emitted when an account is frozen.

```rust
pub struct AccountFrozen {
    pub mint: Pubkey,             // Token mint
    pub token_account: Pubkey,    // Frozen account
    pub authority: Pubkey,        // Pauser who froze
}
```

---

#### `AccountThawed`

Emitted when an account is thawed.

```rust
pub struct AccountThawed {
    pub mint: Pubkey,             // Token mint
    pub token_account: Pubkey,    // Thawed account
    pub authority: Pubkey,        // Pauser who thawed
}
```

---

#### `Paused`

Emitted when the stablecoin is paused.

```rust
pub struct Paused {
    pub mint: Pubkey,             // Token mint
    pub authority: Pubkey,        // Pauser who paused
}
```

**Alerting**: Critical event - trigger immediate notification.

---

#### `Unpaused`

Emitted when the stablecoin is unpaused.

```rust
pub struct Unpaused {
    pub mint: Pubkey,             // Token mint
    pub authority: Pubkey,        // Pauser who unpaused
}
```

---

### Role Management Events

#### `MinterUpdated`

Emitted when a minter's configuration changes.

```rust
pub struct MinterUpdated {
    pub mint: Pubkey,             // Token mint
    pub authority: Pubkey,        // Master who updated
    pub minter: Pubkey,           // Minter authority updated
    pub active: bool,             // New active status
    pub quota_amount: u64,        // New quota
    pub window_seconds: i64,      // New window duration
}
```

---

#### `RolesUpdated`

Emitted when operational roles are updated.

```rust
pub struct RolesUpdated {
    pub mint: Pubkey,             // Token mint
    pub authority: Pubkey,        // Master who updated
    pub pauser: Pubkey,           // New pauser (if changed)
    pub burner: Pubkey,           // New burner (if changed)
    pub blacklister: Pubkey,      // New blacklister (if changed)
    pub seizer: Pubkey,           // New seizer (if changed)
    pub treasury: Pubkey,         // New treasury (if changed)
}
```

**Note**: Only changed roles are updated; unchanged roles retain previous values.

---

#### `AuthorityTransferred`

Emitted when master authority is transferred.

```rust
pub struct AuthorityTransferred {
    pub mint: Pubkey,             // Token mint
    pub old_master: Pubkey,       // Previous master
    pub new_master: Pubkey,       // New master
}
```

**Alerting**: Critical security event - verify legitimacy.

---

### Compliance Events (SSS-2)

#### `BlacklistUpdated`

Emitted when a wallet's blacklist status changes.

```rust
pub struct BlacklistUpdated {
    pub mint: Pubkey,             // Token mint
    pub wallet: Pubkey,           // Wallet address
    pub blacklisted: bool,        // New status
    pub authority: Pubkey,        // Blacklister who updated
    pub reason_hash: [u8; 32],    // Hash of reason (if added)
}
```

**Compliance**: Store reason text off-chain linked by hash.

---

#### `Seized`

Emitted when tokens are seized.

```rust
pub struct Seized {
    pub mint: Pubkey,             // Token mint
    pub source: Pubkey,           // Source token account
    pub destination: Pubkey,      // Treasury destination
    pub source_owner: Pubkey,     // Wallet that was seized from
    pub authority: Pubkey,        // Seizer who executed
    pub amount: u64,              // Amount seized
    pub override_requires_blacklist: bool, // If blacklist check was bypassed
}
```

**Compliance**: Requires audit trail linking to legal authorization.

---

## Event Indexing

### PostgreSQL Schema

```sql
CREATE TABLE sss_events (
    id BIGSERIAL PRIMARY KEY,
    signature TEXT NOT NULL,
    slot BIGINT NOT NULL,
    block_time TIMESTAMPTZ,
    action TEXT NOT NULL,           -- Event type (e.g., 'Minted')
    payload JSONB NOT NULL,         -- Full event data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(signature, action)
);

-- Indexes for common queries
CREATE INDEX idx_events_mint ON sss_events((payload->>'mint'));
CREATE INDEX idx_events_action ON sss_events(action);
CREATE INDEX idx_events_time ON sss_events(block_time);
```

### Indexing Query Examples

```sql
-- All mints for a specific stablecoin
SELECT * FROM sss_events 
WHERE action = 'Minted' 
  AND payload->>'mint' = 'MINT_PUBKEY'
ORDER BY block_time DESC;

-- All compliance actions (SSS-2)
SELECT * FROM sss_events 
WHERE action IN ('BlacklistUpdated', 'Seized')
  AND payload->>'mint' = 'MINT_PUBKEY';

-- Authority changes
SELECT * FROM sss_events 
WHERE action IN ('AuthorityTransferred', 'RolesUpdated')
ORDER BY block_time DESC;
```

## Webhook Payloads

The indexer service sends webhooks with event data:

```json
{
  "signature": "tx_signature",
  "slot": 123456789,
  "blockTime": 1700000000,
  "action": "Minted",
  "payload": {
    "mint": "MINT_PUBKEY",
    "to": "RECIPIENT_PUBKEY",
    "minter": "MINTER_PUBKEY",
    "amount": "1000000",
    "quotaUsed": "5000000",
    "quotaLimit": "10000000"
  }
}
```

## Monitoring Recommendations

### Critical Events (Immediate Alert)

- `Paused` - Potential emergency
- `AuthorityTransferred` - Control change
- `Seized` - Asset seizure (SSS-2)

### Daily Review Events

- `Minted` - Track supply changes
- `BlacklistUpdated` - Compliance monitoring (SSS-2)
- `RolesUpdated` - Permission changes

### Weekly Review Events

- `MinterUpdated` - Quota adjustments
- `AccountFrozen`/`AccountThawed` - Account controls

## SDK Event Parsing

```typescript
import { SolanaStablecoin } from '@stbr/sss-token';

// Listen for events via connection
const connection = new Connection('http://localhost:8899');

// Query historical events
const signatures = await connection.getSignaturesForAddress(mintPubkey);
for (const sig of signatures) {
  const tx = await connection.getTransaction(sig.signature);
  const logs = tx?.meta?.logMessages || [];
  
  // Parse events from logs
  for (const log of logs) {
    if (log.includes('Program log: Minted')) {
      // Extract event data
      console.log('Mint event detected:', log);
    }
  }
}
```

## Audit Trail Export

Export events for compliance reporting:

```bash
# Using CLI
sss-token audit-log --action Minted --limit 1000

# Using backend API
curl "http://localhost:8083/audit/export?action=Seized&format=csv"
```

Format includes:
- Transaction signature
- Block time
- Event type
- Full payload
- Response metadata
