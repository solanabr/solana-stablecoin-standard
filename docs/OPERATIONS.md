# Operations Runbook

Step-by-step instructions for deploying and operating a stablecoin built on the Solana Stablecoin Standard.

**Programs:**
- `sss-core`: `G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL`
- `sss-transfer-hook`: `EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389`

---

## Table of Contents

- [Deployment](#deployment)
- [Initial Setup](#initial-setup)
- [Day-to-Day Operations](#day-to-day-operations)
- [Compliance Operations (SSS-2)](#compliance-operations-sss-2)
- [Authority Transfer](#authority-transfer)
- [Emergency Procedures](#emergency-procedures)
- [Monitoring and Audit](#monitoring-and-audit)

---

## Deployment

### Prerequisites

| Requirement | Version |
|------------|---------|
| Solana CLI | 1.18+ |
| Anchor CLI | 0.31.1 |
| Node.js | 18+ |
| pnpm | 8+ |

### Step 1: Build Programs

```bash
anchor build
```

This produces:
- `target/deploy/sss_core.so`
- `target/deploy/sss_transfer_hook.so`
- `target/idl/sss_core.json`
- `target/idl/sss_transfer_hook.json`

### Step 2: Deploy to Devnet

```bash
# Set cluster
solana config set --url devnet

# Deploy sss-core
anchor deploy --program-name sss_core --provider.cluster devnet

# Deploy sss-transfer-hook
anchor deploy --program-name sss_transfer_hook --provider.cluster devnet
```

### Step 3: Verify Deployment

```bash
solana program show G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL
solana program show EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389
```

### Step 4: Install SDK Dependencies

```bash
pnpm install
```

---

## Initial Setup

### Initialize a Stablecoin (SSS-1)

```bash
sss-token init \
  --preset sss-1 \
  --name "USD Stablecoin" \
  --symbol USDS \
  --decimals 6 \
  --uri "https://example.com/metadata.json"
```

Output includes:
- Mint address (saved to config automatically)
- Config PDA address
- Transaction signature

### Initialize a Stablecoin (SSS-2)

```bash
sss-token init \
  --preset sss-2 \
  --name "Regulated USD" \
  --symbol RUSD \
  --decimals 6
```

### Initialize a Stablecoin (SSS-3)

```bash
sss-token init \
  --preset sss-3 \
  --name "Permissioned USD" \
  --symbol PUSD \
  --decimals 6 \
  --supply-cap 10000000000
```

After SSS-3 initialization, add the authority and approved participants to the allowlist:

```bash
# Add authority to the allowlist
sss-token allowlist add <authority-address>

# Add approved participants
sss-token allowlist add <participant-1>
sss-token allowlist add <participant-2>
```

### Verify Initialization

```bash
sss-token status
```

Expected output:

```
Stablecoin status
  mint:              <mint-address>
  config:            <config-pda>
  authority:         <your-wallet>
  pendingAuthority:  (none)
  paused:            false
  complianceEnabled: true
  totalMinted:       0
  totalBurned:       0
  netSupply:         0
```

### Set Up Roles

Grant roles to operational wallets. Separate keys for each role is recommended.

```bash
# Add a minter with a 10M quota
sss-token minters add <minter-address> --quota 10000000000000

# Add a freezer
sss-token roles grant freezer <freezer-address>

# For SSS-2: add compliance roles
sss-token roles grant blacklister <compliance-address>
sss-token roles grant seizer <legal-address>
```

### Verify Roles

```bash
sss-token roles check minter <minter-address>
sss-token roles check freezer <freezer-address>
sss-token minters quota <minter-address>
```

---

## Day-to-Day Operations

### Minting Tokens

**Who:** Minter role holder
**Preconditions:** Stablecoin not paused, minter has sufficient quota, recipient token account exists

```bash
sss-token mint <recipient-address> 1000000000
```

Using the SDK:

```typescript
const tx = await stablecoin.mint({
  recipient: recipientTokenAccount,
  amount: new BN(1_000_000_000), // 1000 tokens (6 decimals)
});
```

### Burning Tokens

**Who:** Any token holder
**Preconditions:** Stablecoin not paused, sufficient balance

```bash
sss-token burn 500000000
```

### Checking Supply

```bash
sss-token supply
```

### Freezing an Account

**Who:** Freezer role holder
**Preconditions:** Stablecoin not paused

```bash
sss-token freeze <token-account-address>
```

### Thawing an Account

**Who:** Freezer role holder
**Preconditions:** Stablecoin not paused, account is frozen

```bash
sss-token thaw <token-account-address>
```

For SSS-2 KYC gating, the thaw operation is the approval step after a user passes KYC verification.

### Updating Metadata

**Who:** Authority only

```bash
sss-token set-metadata name "Updated Stablecoin Name"
sss-token set-metadata uri "https://example.com/new-metadata.json"
sss-token set-metadata symbol "NEWT"
```

### Adjusting Minter Quotas

**Who:** Authority only

```bash
# Increase quota (does not reset minted_amount)
sss-token minters add <minter-address> --quota 20000000000000

# Check current usage
sss-token minters quota <minter-address>
```

### Removing a Minter

**Who:** Authority only

```bash
sss-token minters remove <minter-address>
```

This closes the RoleAssignment PDA and returns rent.

---

## Compliance Operations (SSS-2)

These operations are only available when `compliance_enabled = true`.

### Adding an Address to the Blacklist

**Who:** Blacklister role holder
**When:** Address appears on sanctions list, court order, suspicious activity

```bash
sss-token blacklist add <address> --reason "OFAC SDN match"
```

After blacklisting:
- The address cannot send tokens (transfer hook blocks)
- The address cannot receive tokens (transfer hook blocks)
- A `BlacklistEntry` PDA is created on-chain

### Checking Blacklist Status

```bash
sss-token blacklist check <address>
```

### Removing from Blacklist

**Who:** Blacklister role holder
**When:** False positive, sanctions lifted, appeal approved

```bash
sss-token blacklist remove <address>
```

The `BlacklistEntry` PDA is closed and rent returned.

### Seizing Tokens

**Who:** Seizer role holder
**Preconditions:**
1. Target address is blacklisted
2. Stablecoin is not paused
3. Target has a balance

**Full seizure flow:**

```bash
# Step 1: Verify target is blacklisted
sss-token blacklist check <target-owner>

# Step 2: Execute seizure
sss-token seize <target-owner> \
  --to <treasury-owner> \
  --amount <amount-in-base-units>

# Step 3: Verify
sss-token supply  # net supply should be unchanged
```

The seize instruction is atomic: if any step fails, the entire transaction reverts.

### KYC Onboarding (SSS-2)

For SSS-2 mints with `DefaultAccountState::Frozen`, new token accounts are created frozen. The onboarding flow:

```bash
# 1. User creates their token account (frozen by default)
# 2. User submits KYC documents off-chain
# 3. After KYC approval, freezer thaws the account:
sss-token thaw <user-token-account>
# 4. User can now send and receive tokens
```

### Allowlist Management (SSS-3)

These operations are only available when `enable_allowlist = true`.

#### Adding an Address to the Allowlist

**Who:** Authority only
**When:** After KYC/AML verification of a new participant

```bash
sss-token allowlist add <address>
```

After allowlisting, create and thaw the participant's token account.

#### Removing from Allowlist

**Who:** Authority only
**When:** Participant no longer approved (KYC expired, compliance violation)

```bash
sss-token allowlist remove <address>
```

The AllowlistEntry PDA is closed and rent returned to the authority. The participant can no longer send or receive tokens.

#### Checking Allowlist Status

```bash
sss-token allowlist check <address>
```

---

## Authority Transfer

Authority transfer is a critical operation that uses a two-step process to prevent accidental loss.

### Step 1: Propose (Current Authority)

```bash
sss-token authority propose <new-authority-address>
```

### Step 2: Verify Proposal

```bash
sss-token status
# Check pendingAuthority field shows the correct address
```

### Step 3: Accept (New Authority)

The new authority must run this command with their keypair:

```bash
sss-token authority accept --keypair <new-authority-keypair-path>
```

### Cancel (If Needed)

If the proposal was made in error:

```bash
sss-token authority cancel
```

### Post-Transfer Verification

```bash
sss-token status
# Verify:
#   authority = new address
#   pendingAuthority = (none)
```

---

## Emergency Procedures

### Global Pause

**When:** Security incident, exploit detected, regulatory order
**Who:** Authority only

```bash
sss-token pause
```

Effects:
- `mint_tokens` -- blocked
- `burn_tokens` -- blocked
- `freeze_account` / `thaw_account` -- blocked
- `seize` -- blocked
- All Token-2022 transfers -- blocked (SSS-2 only, via transfer hook)

**What still works during pause:**
- `unpause` (to recover)
- `propose_authority` / `accept_authority` / `cancel_authority_transfer`
- `grant_role` / `revoke_role` / `set_quota`
- `add_to_blacklist` / `remove_from_blacklist`
- `set_metadata`
- `status` / `supply` / `holders` / `audit-log`

### Unpause

After the incident is resolved:

```bash
sss-token unpause
```

### Emergency Freeze of a Specific Account

If an individual account is compromised:

```bash
sss-token freeze <compromised-token-account>
```

### Emergency Blacklist (SSS-2)

If an address must be immediately blocked from all transfers:

```bash
sss-token blacklist add <address> --reason "Emergency: suspected exploit"
```

### Emergency Seizure (SSS-2)

If tokens must be recovered from a blacklisted address:

```bash
sss-token seize <compromised-owner> \
  --to <treasury-owner> \
  --amount <full-balance>
```

### Emergency Authority Rotation

If the authority key is compromised:

1. If a pending authority transfer exists, the attacker could accept it. Cancel immediately:
   ```bash
   sss-token authority cancel
   ```

2. Propose a transfer to a new secure key:
   ```bash
   sss-token authority propose <new-secure-authority>
   ```

3. Accept from the new key:
   ```bash
   sss-token authority accept --keypair <new-key>
   ```

4. Revoke any roles held by the compromised key.

---

## Monitoring and Audit

### On-Chain Audit Trail

Every state-changing operation emits an Anchor event. Query recent transactions:

```bash
sss-token audit-log --limit 50
```

### Supply Monitoring

```bash
sss-token supply
```

For automated monitoring, use the `--output json` flag:

```bash
sss-token supply --output json | jq '.netSupply'
```

### Holder Analysis

```bash
sss-token holders --min-balance 1000000
```

### Role Auditing

Check all known role holders:

```bash
sss-token roles check minter <address-1>
sss-token roles check minter <address-2>
sss-token roles check freezer <address-3>
sss-token roles check blacklister <address-4>
sss-token roles check seizer <address-5>
```

### Backend Services

The backend provides additional monitoring:

| Service | Port | Purpose |
|---------|------|---------|
| Indexer | 8083 | Event indexing, holder tracking, supply history |
| Compliance | 8082 | Blacklist mirror, audit events |
| Webhook | 8084 | Event notifications to external systems |

Start all services:

```bash
cd backend
docker compose up -d
```

### Health Checks

```bash
curl http://localhost:8081/health  # mint-burn-service
curl http://localhost:8082/health  # compliance-service
curl http://localhost:8083/health  # indexer
curl http://localhost:8084/health  # webhook-service
```

### Key Events to Monitor

| Event | Significance |
|-------|-------------|
| `StablecoinPaused` | Emergency situation |
| `AuthorityTransferred` | Governance change |
| `AddressBlacklisted` | Compliance action |
| `TokensSeized` | Asset recovery |
| `RoleGranted` / `RoleRevoked` | Access changes |
| Large `TokensMinted` | Supply expansion |
