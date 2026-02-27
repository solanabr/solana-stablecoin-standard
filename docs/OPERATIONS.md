# Operator Runbook

This document covers deployment, setup, monitoring, incident response, key management, and upgrade procedures for operating an SSS stablecoin.

## Deployment

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust + Cargo | 1.75+ | Build Anchor programs and CLI |
| Solana CLI | 3.x (Agave) | Keypair management, cluster interaction |
| Anchor | 0.31.1 | Program build and deploy |
| Node.js | 18+ | SDK and backend |

### Build

```bash
cd /path/to/solana-stablecoin-standard

# Pin blake3 to avoid edition2024 parse error with platform tools
cargo update -p blake3 --precise 1.5.5

# Build both programs
anchor build
```

The compiled programs are in `target/deploy/`:
- `sss_token.so` (sss-token program)
- `sss_transfer_hook.so` (sss-transfer-hook program)

### Localnet Deployment

```bash
# Start local validator
solana-test-validator --reset

# Deploy both programs
anchor deploy

# Run the test suite to verify
anchor test --skip-local-validator
```

### Devnet Deployment

```bash
# Configure CLI for devnet
solana config set --url https://api.devnet.solana.com

# Fund the deployer
solana airdrop 5

# Deploy sss-token
anchor deploy --program-name sss-token --provider.cluster devnet

# Deploy sss-transfer-hook
anchor deploy --program-name sss-transfer-hook --provider.cluster devnet
```

After deploying to devnet, update the program IDs in `Anchor.toml` and `lib.rs` files if they differ from the default keys, then rebuild and redeploy.

### Mainnet Deployment

```bash
# Configure CLI for mainnet
solana config set --url https://api.mainnet-beta.solana.com

# Verify deployer has sufficient SOL for rent + deploy fees
solana balance

# Deploy with explicit keypair
anchor deploy \
  --program-name sss-token \
  --provider.cluster mainnet \
  --provider.wallet /path/to/deployer.json

anchor deploy \
  --program-name sss-transfer-hook \
  --provider.cluster mainnet \
  --provider.wallet /path/to/deployer.json
```

**Mainnet checklist before deploying:**

- [ ] Programs audited by a reputable security firm
- [ ] Test suite passing (52/52 tests)
- [ ] Program IDs verified and committed
- [ ] Deployer keypair backed up securely
- [ ] Sufficient SOL for deployment (estimate: ~5 SOL per program)

## Initial Setup

### Initialize SSS-2 Stablecoin

**Step 1: Create the mint**

```bash
sss init \
  --preset sss-2 \
  --name "USD Stablecoin" \
  --symbol USDX \
  --decimals 6 \
  --url https://api.mainnet-beta.solana.com \
  --keypair /path/to/master-authority.json
```

Record the output mint address and config PDA. These are needed for all subsequent operations.

**Step 2: Initialize ExtraAccountMetaList (SSS-2 only)**

If using the CLI, this is handled automatically during `init`. If using the SDK:

```typescript
await client.initializeExtraAccountMetaList(mintPublicKey);
```

**Step 3: Verify transfer hook is working**

Create a test token account, mint a small amount, and attempt a transfer to confirm the hook is active and allowing clean transfers.

### Configure Minters

Add minters with appropriate quotas. Quotas are in base units (e.g., for 6 decimals, a quota of `1_000_000_000_000` allows minting up to 1,000,000 tokens).

```bash
# Primary minter: 10M token quota
sss minter update \
  --mint <MINT> \
  --wallet <PRIMARY_MINTER_PUBKEY> \
  --active \
  --quota 10000000000000

# Secondary minter: 1M token quota
sss minter update \
  --mint <MINT> \
  --wallet <SECONDARY_MINTER_PUBKEY> \
  --active \
  --quota 1000000000000
```

### Assign Roles

Separate roles across different keypairs immediately after deployment:

```bash
# Assign pauser to operations team
sss roles update --mint <MINT> --role pauser --new-holder <OPS_PUBKEY>

# Assign blacklister to compliance team
sss roles update --mint <MINT> --role blacklister --new-holder <COMPLIANCE_PUBKEY>

# Assign seizer to legal/compliance (separate from blacklister)
sss roles update --mint <MINT> --role seizer --new-holder <LEGAL_PUBKEY>
```

### Setup ExtraAccountMetaList

For SSS-2 mints initialized via the SDK (not CLI):

```typescript
// Must be called once before any transfers will work
await client.initializeExtraAccountMetaList(mintPublicKey);
```

Verify by attempting a transfer. If the ExtraAccountMetaList is not initialized, `transfer_checked` will fail.

## Monitoring

### Event Indexing

SSS emits Anchor events on every state-changing operation. Set up an event indexer to capture these for compliance records and operational monitoring.

**SDK-based event parsing:**

```typescript
import { parseTransactionEvents } from "@solana-stablecoin-standard/sdk";

// Subscribe to transaction logs for the sss-token program
connection.onLogs(SSS_TOKEN_PROGRAM_ID, (logs) => {
  const events = parseTransactionEvents(client.tokenProgram, logs.logs);
  for (const event of events) {
    // Route to your monitoring system
    handleEvent(event.name, event.data);
  }
});
```

**Key events to monitor:**

| Event | Alert Level | Action |
|-------|-------------|--------|
| `ProgramPaused` | Critical | Investigate immediately -- who paused and why |
| `TokensSeized` | High | Verify legal authorization exists |
| `BlacklistAdded` | High | Confirm OFAC/compliance justification |
| `AuthorityTransferred` | Critical | Verify this was an authorized key rotation |
| `MinterUpdated` | Medium | Review quota changes |
| `TokensMinted` | Low | Track against expected daily volumes |
| `TokensBurned` | Low | Track against expected daily volumes |

### Balance Tracking

Monitor the circulating supply and reserve ratio:

```typescript
const config = await client.fetchConfig(mint);
const circulatingSupply = config.totalMinted.sub(config.totalBurned);
console.log("Circulating supply:", circulatingSupply.toString());

// Compare against latest attestation
const [configPda] = client.getConfigPda(mint);
const latestIndex = config.reserveAttestationIndex.sub(new BN(1));
const attestation = await client.fetchReserveAttestation(configPda, latestIndex);
console.log("Attested reserves (USD cents):", attestation.totalReservesUsd.toString());
```

**Metrics to track:**

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Circulating supply | `config.totalMinted - config.totalBurned` | Unexpected large changes |
| Reserve ratio | `attestation.totalReservesUsd / supply` | Falls below 100% |
| Active minters | MinterInfo PDAs | Unauthorized minter added |
| Blacklist size | BlacklistEntry PDA count | Rapid growth |
| Time since last attestation | `attestation.timestamp` | Exceeds 35 days |

### TUI Dashboard

For interactive monitoring, use the CLI dashboard:

```bash
sss dashboard --mint <MINT> --url https://api.mainnet-beta.solana.com
```

The dashboard displays live configuration, supply, roles, minters, and attestation data. Press `q` or `Esc` to exit.

## Incident Response

### Pause (Circuit Breaker)

**When to pause:** Smart contract vulnerability discovered, suspicious minting activity, regulatory order, market disruption.

```bash
# Pause immediately
sss pause --mint <MINT> --keypair /path/to/pauser.json

# Verify
sss info --mint <MINT>
# Should show: is_paused = true
```

**Effect:** `mint_tokens` and `burn_tokens` revert with `ProgramPaused`. Existing token transfers, freeze, thaw, and blacklist operations continue to function.

**Recovery:**

```bash
# After investigation, resume operations
sss unpause --mint <MINT> --keypair /path/to/pauser.json
```

### Blacklist (Sanctions Response)

**When to blacklist:** OFAC SDN match, law enforcement request, internal fraud detection.

```bash
# Blacklist the address
sss blacklist add \
  --mint <MINT> \
  --address <TARGET_WALLET> \
  --account <TARGET_TOKEN_ACCOUNT> \
  --reason "OFAC SDN List - Entry ID 12345" \
  --keypair /path/to/blacklister.json
```

**Effect:** Target's token account is frozen. Transfer hook rejects all transfers involving this address. The BlacklistEntry PDA records the reason and timestamp.

### Seize (Asset Recovery)

**When to seize:** Valid court order, regulatory directive, or law enforcement cooperation request. Always blacklist first.

```bash
# Verify the address is blacklisted
sss info --mint <MINT>  # Check blacklist status

# Seize tokens to treasury
sss seize \
  --mint <MINT> \
  --from <BLACKLISTED_TOKEN_ACCOUNT> \
  --to <TREASURY_TOKEN_ACCOUNT> \
  --amount <AMOUNT_BASE_UNITS> \
  --keypair /path/to/seizer.json
```

**Documentation requirements:** Before executing a seize, document:
- Legal authority (court order number, regulatory directive reference)
- Amount to seize and justification
- Approval from compliance officer
- Treasury account destination

### Authority Transfer (Emergency Key Rotation)

**When to transfer:** Suspected key compromise, personnel change, transition to multisig.

```bash
# Transfer master authority to new key
# Must be signed by the CURRENT master authority
sss transfer-authority \
  --mint <MINT> \
  --new-authority <NEW_MASTER_PUBKEY> \
  --keypair /path/to/current-master.json
```

**Effect:** Updates both `StablecoinConfig.master_authority` and `RoleRegistry.master_authority`. The old authority loses all access immediately.

**If master key is compromised:**

1. Transfer authority to a clean keypair immediately
2. Reassign all roles (pauser, blacklister, seizer) to new keys
3. Review all minter configurations
4. Audit recent transactions for unauthorized operations
5. Pause the program if suspicious activity is found

## Key Management

### Keypair Types

| Role | Storage | Access Frequency |
|------|---------|-----------------|
| Master authority | Cold wallet, hardware wallet, or multisig | Rare (role changes, attestations) |
| Pauser | Monitored hot wallet | On-demand (emergencies) |
| Blacklister | Monitored hot wallet | Regular (compliance screening) |
| Seizer | Cold wallet or multisig | Rare (legal actions only) |
| Minter(s) | Hot wallet with operational controls | Frequent (daily minting) |
| Program deploy authority | Cold wallet | Very rare (upgrades only) |

### Key Rotation via transfer_authority

The master authority can be rotated using `transfer_authority`. This is a single atomic operation that updates both the config and role registry.

```typescript
await client.transferAuthority(mint, newAuthorityPublicKey);
```

**Rotation procedure:**

1. Generate new keypair on an air-gapped machine
2. Back up the new keypair to at least two secure, geographically distributed locations
3. Execute `transfer_authority` from the current master authority
4. Verify the transfer by fetching config and confirming `master_authority` matches the new key
5. Test a role update operation with the new key
6. Securely destroy the old keypair after confirming the transfer

### Role Key Rotation

Individual roles (pauser, blacklister, seizer) are rotated via `update_roles`:

```bash
sss roles update --mint <MINT> --role pauser --new-holder <NEW_PAUSER_PUBKEY>
```

This requires master authority signature. The old role holder loses access immediately.

### Minter Key Rotation

To rotate a minter, deactivate the old minter and activate a new one:

```bash
# Deactivate old minter
sss minter update --mint <MINT> --wallet <OLD_MINTER> --quota 0

# Activate new minter with the same quota
sss minter update --mint <MINT> --wallet <NEW_MINTER> --active --quota 10000000000000
```

## Upgrade Procedures

### Program Upgrades

SSS programs are deployed as standard Anchor programs. If deployed with an upgrade authority, the programs can be upgraded.

```bash
# Build the updated program
anchor build

# Deploy the upgrade
anchor upgrade \
  --program-id <PROGRAM_ID> \
  target/deploy/sss_token.so \
  --provider.cluster mainnet
```

**Before upgrading:**

- [ ] Changes reviewed and audited
- [ ] Test suite passing with the updated program
- [ ] Upgrade tested on devnet first
- [ ] Upgrade authority keypair available
- [ ] Rollback plan documented

**After upgrading:**

- [ ] Verify program functionality with a test transaction
- [ ] Monitor for unexpected errors in event logs
- [ ] Confirm all existing PDAs are still readable

### Preset Upgrades (SSS-1 to SSS-2)

Feature flags are immutable. There is no in-place upgrade path from SSS-1 to SSS-2. To move to a higher preset:

1. Deploy a new SSS-2 mint
2. Configure roles and minters on the new mint
3. Mint new tokens on SSS-2 mint as holders redeem SSS-1 tokens
4. Burn redeemed SSS-1 tokens
5. Communicate the migration timeline to token holders
6. Deprecate the SSS-1 mint once migration is complete

### Backend Deployment

The Express.js backend wraps the SDK client. Deploy it behind a reverse proxy with authentication.

```bash
cd backend
npm install
npm run build

# Set environment variables
export RPC_URL=https://api.mainnet-beta.solana.com
export KEYPAIR_PATH=/path/to/backend-signer.json
export PORT=3001

npm start
```

**Production checklist:**

- [ ] Backend runs behind HTTPS reverse proxy
- [ ] API authentication configured (API keys, JWT, or IP allowlist)
- [ ] Rate limiting enabled at the proxy layer
- [ ] Backend keypair has only the roles it needs (e.g., minter only)
- [ ] Health check endpoint monitored
- [ ] Log aggregation configured

## Quick Reference

### Common Operations

| Operation | Command | Required Role |
|-----------|---------|---------------|
| Check status | `sss info --mint <MINT>` | None (read-only) |
| Mint tokens | `sss mint --mint <MINT> --amount <N> --recipient <PUBKEY>` | Active minter |
| Emergency pause | `sss pause --mint <MINT>` | Pauser |
| Blacklist address | `sss blacklist add --mint <MINT> --address <PUBKEY> --account <ATA> --reason "..."` | Blacklister |
| Seize tokens | `sss seize --mint <MINT> --from <ATA> --to <TREASURY_ATA> --amount <N>` | Seizer |
| Submit attestation | `sss attest --mint <MINT> --hash <HEX> --reserves-usd <N> --outstanding <N> --uri <URL>` | Master authority |
| Rotate authority | CLI: N/A (use SDK `transferAuthority`) | Master authority |
| Launch dashboard | `sss dashboard --mint <MINT>` | None (read-only) |
