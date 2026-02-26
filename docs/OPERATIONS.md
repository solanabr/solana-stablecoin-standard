# Operations Runbook

This guide covers day-to-day stablecoin operations, deployment procedures, and emergency response for SSS operators.

## Deployment Checklist

### Prerequisites

- [ ] Solana CLI installed and configured
- [ ] Anchor CLI 0.32+ installed
- [ ] Node.js 20+ with pnpm
- [ ] Rust toolchain (for CLI and program builds)
- [ ] Funded deployer wallet (devnet: `solana airdrop 5`, mainnet: SOL in wallet)

### Deploy Programs

```bash
# Build programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify program IDs match Anchor.toml
anchor keys list
```

Expected program IDs:
- sss-core: `Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB`
- sss-transfer-hook: `hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH`

### Deploy Backend

```bash
# Set environment variables
export SOLANA_RPC_URL="https://api.devnet.solana.com"
export SOLANA_WS_URL="wss://api.devnet.solana.com"
export KEYPAIR_PATH="~/.config/solana/deployer.json"
export API_KEY="your-secure-api-key"
export PORT=3000

# Build and start
cd backend
pnpm install
pnpm build
node dist/main.js
```

### Post-Deployment Verification

- [ ] Programs are deployed and IDLs match
- [ ] Backend health check returns OK: `curl http://localhost:3000/health`
- [ ] Create a test stablecoin and verify all operations
- [ ] Verify event listener is receiving on-chain events

## Creating a New Stablecoin

### Choose a Preset

| Preset | When to Use |
|---|---|
| SSS-1 | Internal tokens, testing, simple stablecoins without compliance |
| SSS-2 | Regulated stablecoins requiring AML/KYC, blacklist enforcement |
| SSS-3 | Privacy-preserving stablecoins with auditor oversight |

### SDK Creation

```typescript
import { SSS } from "@stbr/sss-token";

const sss = await SSS.create(provider, {
  preset: "sss-2",
  name: "Regulated USD",
  symbol: "rUSD",
  decimals: 6,
  supplyCap: 100_000_000_000_000n, // 100M tokens with 6 decimals
});

// Record the mint address
console.log("Mint:", sss.mintAddress.toBase58());
```

### CLI Creation

```bash
sss init \
  --preset sss-2 \
  --name "Regulated USD" \
  --symbol "rUSD" \
  --decimals 6 \
  --supply-cap 100000000000000
```

### Post-Creation Setup

1. **Record the mint address** -- This is the primary identifier for your stablecoin.
2. **Set up roles** -- Grant minter, freezer, and pauser roles to operational wallets.
3. **Test operations** -- Mint a small amount, verify freeze/thaw, test pause/unpause.
4. **For SSS-2** -- Test blacklist enforcement by blacklisting a test address and attempting a transfer.

## Role Management Best Practices

### Separation of Duties

Assign roles to different wallets to enforce separation of duties:

```bash
# Admin wallet: manages roles and emergency operations
sss roles grant --mint <MINT> --address <ADMIN_2> --role admin

# Minting wallet: dedicated to mint/burn operations
sss roles grant --mint <MINT> --address <MINTER> --role minter

# Compliance wallet: freeze/thaw for KYC enforcement
sss roles grant --mint <MINT> --address <COMPLIANCE> --role freezer

# Operations wallet: pause/unpause for circuit breaker
sss roles grant --mint <MINT> --address <OPS> --role pauser
```

### Multi-Admin Setup

Always maintain at least two admin wallets to prevent lockout:

```bash
sss roles grant --mint <MINT> --address <ADMIN_BACKUP> --role admin
```

Self-revocation of admin role is blocked by the program. To rotate admins: grant the new admin first, then have the new admin revoke the old one.

### Role Audit

Periodically verify role assignments:

```bash
sss roles list --mint <MINT>
```

## Emergency Procedures

### Pause All Operations

When a security incident is detected, immediately pause the stablecoin:

```bash
sss pause --mint <MINT>
```

This blocks: mint, burn, freeze, and thaw operations. Seize remains functional for asset recovery.

**API:**
```bash
curl -X POST http://localhost:3000/operations/pause \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mint": "<MINT_ADDRESS>"}'
```

### Seize Compromised Funds

During a pause, admins can forcibly transfer tokens using the permanent delegate:

```bash
sss seize \
  --mint <MINT> \
  --from <COMPROMISED_ACCOUNT> \
  --to <TREASURY_ACCOUNT> \
  --amount <AMOUNT>
```

### Blacklist an Address (SSS-2)

Block a compromised or sanctioned address from all future transfers:

```bash
sss blacklist add \
  --mint <MINT> \
  --address <BAD_ADDRESS> \
  --reason "Security incident 2026-02-24"
```

Both sender and receiver positions are checked by the transfer hook.

### Resume Operations

After the incident is resolved:

```bash
sss unpause --mint <MINT>
```

### Emergency Response Checklist

1. **Detect** -- Monitor events via the backend WebSocket listener or on-chain logs
2. **Pause** -- Immediately pause the stablecoin
3. **Assess** -- Identify affected accounts and scope of impact
4. **Contain** -- Blacklist compromised addresses (SSS-2), seize at-risk funds
5. **Recover** -- Return seized funds to legitimate owners
6. **Resume** -- Unpause when safe
7. **Post-mortem** -- Document the incident and update procedures

## Monitoring and Alerting

### Backend Event Listener

The backend includes a WebSocket event listener that monitors on-chain program events. Configure webhook URLs for real-time notifications:

```bash
export WEBHOOK_URLS="https://hooks.slack.com/services/xxx,https://your-monitoring.com/webhook"
```

Monitored events:
- `TokensMinted`, `TokensBurned` -- Supply changes
- `AccountFrozen`, `AccountThawed` -- Account state changes
- `OperationsPaused`, `OperationsUnpaused` -- Circuit breaker
- `TokensSeized` -- Emergency asset recovery
- `RoleGranted`, `RoleRevoked` -- Access control changes
- `BlacklistAdded`, `BlacklistRemoved` -- Compliance changes

### Health Check

```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "ok",
  "solana": "connected",
  "slot": 12345678,
  "uptime": 3600,
  "timestamp": "2026-02-24T12:00:00.000Z"
}
```

### Key Metrics to Monitor

- **Supply changes** -- Unexpected mints or burns
- **Pause events** -- Any pause should trigger investigation
- **Seize events** -- Every seizure should be documented
- **Role changes** -- Unauthorized role grants
- **Blacklist changes** -- Track all compliance actions
- **RPC health** -- Monitor Solana connection status

## Supply Cap Management

### Setting a Supply Cap

```bash
# Via SDK
await sss.updateSupplyCap(1_000_000_000_000n);

# Via CLI (requires admin role)
# Use the backend API or SDK for supply cap updates
```

The supply cap is enforced on the `current_supply` (total_minted - total_burned), not on total_minted alone. This means that after burning tokens, new tokens can be minted up to the cap.

### Removing a Supply Cap

```typescript
await sss.updateSupplyCap(null);
```

### Constraints

- New cap must be >= current supply
- Supply cap is optional (null = unlimited)
- Only admins can update the supply cap

## Upgrading

### Program Upgrades

SSS programs are deployed as upgradeable Anchor programs. The upgrade authority is the deployer wallet.

```bash
# Build new version
anchor build

# Deploy upgrade
anchor upgrade --program-id <PROGRAM_ID> target/deploy/<program>.so
```

**Pre-upgrade checklist:**
- [ ] All tests pass on the new version
- [ ] IDL changes are backward-compatible
- [ ] Existing config PDAs remain valid
- [ ] No data migration required (or migration plan exists)

### SDK Upgrades

```bash
pnpm update @stbr/sss-token
```

The SDK is versioned independently of the on-chain programs. Ensure the SDK version is compatible with the deployed program version.

### Backend Upgrades

```bash
cd backend
pnpm install
pnpm build
# Restart the backend process
```

The backend is stateless -- it can be restarted at any time without data loss. Active WebSocket subscriptions will be re-established on startup.
