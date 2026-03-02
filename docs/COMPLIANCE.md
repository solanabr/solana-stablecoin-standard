# Compliance Runbook

This document is the operational guide for compliance officers, legal teams, and auditors working with SSS stablecoins. It covers the role of each compliance tool, recommended workflows for regulatory scenarios, and on-chain auditability.

---

## Which Preset to Choose

| Regulatory Requirement | Preset |
|------------------------|--------|
| Mint/burn controls only (no sanctions list) | SSS-1 |
| OFAC/sanctions screening on all transfers | SSS-2 |
| Seizure without holder cooperation | SSS-2 |
| Court-ordered asset recovery | SSS-2 |
| Public DeFi stablecoin | SSS-1 |
| Permissioned institutional stablecoin | SSS-2 |

---

## Role Structure

Both presets use a role-based access control system stored in the `RolesConfig` PDA. All roles are optional — a `null` role defaults to `master_authority`.

### SSS-1 Roles

| Role | Who Should Hold It | What It Can Do |
|------|--------------------|----------------|
| `master_authority` | Multi-sig (e.g. Squads) | Transfer authority, update all roles, all ops |
| `minter` | Hot wallet or automation | Mint tokens up to per-epoch quota |
| `burner` | Hot wallet or automation | Burn tokens from holder accounts |
| `pauser` | On-call ops team | Freeze individual accounts, pause all transfers |

### SSS-2 Additional Roles

| Role | Who Should Hold It | What It Can Do |
|------|--------------------|----------------|
| `blacklister` | Compliance officer | Add/remove addresses from the blacklist |
| `seizer` | Legal counsel or multi-sig | Transfer tokens from any holder without consent |

**Separation of duties recommendation:**
- `blacklister` ≠ `seizer` — requiring two keys for the full seize workflow prevents unilateral abuse
- `minter` ≠ `master_authority` — limits hot wallet blast radius
- All privileged keys should use hardware wallets or HSMs in production

---

## Sanctions Screening Workflow (SSS-2)

### Step 1: Detect

Your compliance pipeline identifies a sanctioned address (OFAC SDN list, internal fraud signal, court order, etc.).

### Step 2: Block (immediate)

Add the address to the on-chain blacklist. This takes effect on the **next transfer** — there is no retroactive delay.

```bash
sss-token blacklist add \
  --mint <MINT_ADDRESS> \
  --address <SANCTIONED_WALLET> \
  --reason 1
```

Reason codes are user-defined. Recommended encoding:

| Code | Meaning |
|------|---------|
| 0 | Unspecified |
| 1 | OFAC sanctions |
| 2 | Fraud investigation |
| 3 | Court order |
| 4 | Internal risk |

### Step 3: Verify

```bash
sss-token blacklist check --mint <MINT_ADDRESS> --address <SANCTIONED_WALLET>
```

Or via SDK:

```typescript
const blocked = await token.compliance.isBlacklisted(sanctionedWallet);
console.assert(blocked === true, 'Address must be blocked before proceeding');
```

### Step 4: Seize (if required)

Only after proper authorization (internal policy, legal review, or court order):

```bash
sss-token seize \
  --mint <MINT_ADDRESS> \
  --from <SANCTIONED_TOKEN_ACCOUNT> \
  --to <RECOVERY_TOKEN_ACCOUNT> \
  --amount <AMOUNT>
```

### Step 5: Document

Every action emits an on-chain transaction that can be linked to a block explorer. Record:
- Transaction signature
- Block time and slot
- Amount seized (if applicable)
- Reason code

---

## Global Pause Workflow

Used when a systemic event requires halting all token activity immediately (e.g., smart contract bug, bridge exploit, regulatory order).

```bash
# Pause all transfers
sss-token pause --mint <MINT_ADDRESS>

# Resume when safe
sss-token unpause --mint <MINT_ADDRESS>
```

Pause blocks all `transfer_checked` calls. Mint and burn are also blocked while paused — the `StablecoinConfig.paused` flag is checked in every instruction.

**Important:** The global pause is a last-resort measure. For targeted account freezes, use `freeze`/`thaw` instead.

---

## Account Freeze Workflow

Freeze a single account while leaving others operational:

```bash
# Freeze
sss-token freeze --mint <MINT_ADDRESS> --account <TOKEN_ACCOUNT>

# Thaw
sss-token thaw --mint <MINT_ADDRESS> --account <TOKEN_ACCOUNT>
```

A frozen account cannot send or receive tokens, but the holder still holds the token balance. Use this for:
- Pending KYC review
- Temporary hold during investigation
- Pre-seizure step (recommended: freeze first, seize after authorization)

---

## Audit Trail

### On-Chain

Every compliance action is recorded permanently on Solana:

| Action | What's On-Chain |
|--------|-----------------|
| Blacklist add | `BlacklistEntry` PDA created (mint, address, added_at, added_by, reason) |
| Blacklist remove | PDA closed (rent returned) — note: closed PDAs are NOT retrievable on-chain |
| Freeze | Token account `state: Frozen` in Token-2022 |
| Pause | `StablecoinConfig.paused = true` |
| Seize | Transfer transaction with permanent delegate authority |
| Transfer blocked | Hook program returns error; transaction fails on-chain |

### Off-Chain

**Critical:** Blacklist removals close the on-chain PDA. If you need a permanent audit log of who was blacklisted and for how long, you must maintain an off-chain record.

Recommended approach: index `add_to_blacklist` and `remove_from_blacklist` instructions via the event-listener service:

```bash
SSS_MINT=<your-mint> \
ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
ANCHOR_WALLET=<path-to-keypair> \
node dist/event-listener.js
```

The event listener emits JSON logs to stdout:

```json
{
  "event": "BlacklistAdded",
  "mint": "...",
  "address": "...",
  "reason": 1,
  "addedBy": "...",
  "slot": 123456789,
  "signature": "..."
}
```

---

## Governance Recommendations

### Authority Rotation

Rotate `master_authority` every 6–12 months or after any team change:

```bash
sss-token transfer-authority \
  --mint <MINT_ADDRESS> \
  --new-authority <NEW_KEYPAIR_ADDRESS>
```

This is a two-step process requiring both old and new authorities to sign.

### Multi-sig

For production deployments, `master_authority` should be a multi-sig program such as [Squads](https://squads.so/). The SSS program accepts any `Signer` — it is multi-sig-compatible.

### Key Custody

- `master_authority` — Hardware wallet or HSM. Never expose online.
- `blacklister` — Hardware wallet. Offline except during compliance actions.
- `seizer` — Multi-sig (e.g., 2-of-3). Require two approvals before seizing.
- `minter`, `burner`, `pauser` — Hot wallet acceptable if quota-bounded.

---

## Emergency Playbook

### Scenario: Hot wallet compromise

1. `sss-token pause` — halt all activity immediately
2. Rotate the compromised key via `update_roles`
3. `sss-token unpause` — resume after new key is confirmed

### Scenario: Exploit on bridged protocol

1. `sss-token pause` — prevent additional outflow
2. Assess scope
3. Freeze accounts known to hold exploited funds: `sss-token freeze`
4. If recovery is warranted: `sss-token seize`
5. Resume: `sss-token unpause`

### Scenario: Regulatory order to block specific wallet

1. `sss-token blacklist add --reason 3` (court order)
2. Obtain multi-sig approval for seizure
3. `sss-token seize`
4. Document: on-chain tx signature + off-chain legal record

---

## Backend Service: Compliance API

The backend service exposes a REST endpoint for compliance operations, suitable for integration with internal tooling:

```
POST /api/compliance/blacklist
Authorization: Bearer <ADMIN_KEY>
Body: { "action": "add"|"remove"|"check", "address": "...", "reason": 1 }

POST /api/compliance/pause
POST /api/compliance/unpause

POST /api/compliance/freeze
Body: { "tokenAccount": "..." }
```

The service validates all inputs, checks role authorization, and returns the transaction signature. See `docs/API.md` for full endpoint documentation.

---

## Regulatory Reporting

The backend compliance API supports generating structured reports suitable for regulatory submission:

```bash
curl -X GET https://your-service/api/compliance/report \
  -H "Authorization: Bearer <ADMIN_KEY>" \
  -G --data-urlencode "from=2026-01-01" \
     --data-urlencode "to=2026-03-31"
```

Response includes:
- All blacklist additions/removals with timestamps
- All seizure transactions with amounts
- All freeze/thaw events
- Global pause periods

Reports are signed with the service's keypair for integrity verification.
