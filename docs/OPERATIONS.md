# Operations Guide

This guide covers deploying, configuring, and operating an SSS stablecoin in production — from initial setup through key management, day-to-day operations, and emergency procedures.

---

## Prerequisites

- Rust + Cargo (stable, 1.75+)
- Solana CLI (`solana` 1.18+)
- Anchor CLI 0.32.1 (`cargo install --git https://github.com/coral-xyz/anchor avm && avm install 0.32.1 && avm use 0.32.1`)
- Node.js 20+ with npm
- A funded Solana keypair (devnet: `solana airdrop 5`; mainnet: purchase SOL)

---

## Initial Setup

### 1. Build the programs

```bash
cd /path/to/solana-stablecoin-standard
anchor build
```

Build artifacts:
- `target/sbpf-solana-solana/release/solana_stablecoin_standard.so`
- `target/sbpf-solana-solana/release/sss_transfer_hook.so`
- `target/idl/solana_stablecoin_standard.json`
- `target/types/solana_stablecoin_standard.ts`

Build time: approximately 3–5 minutes on first build.

### 2. Build the CLI

```bash
cd cli
npm install
npm run build
npm link   # optional: makes sss-token available globally
```

---

## Devnet Deployment

Devnet is recommended for all testing before mainnet deployment.

### Configure Solana CLI for devnet

```bash
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json
solana airdrop 5   # fund the deploy keypair
```

### Deploy both programs

```bash
# From repository root
anchor deploy
```

This deploys both `solana_stablecoin_standard` and `sss_transfer_hook` using the addresses declared in `Anchor.toml`.

Expected output:
```
Deploying cluster: https://api.devnet.solana.com
Upgrade authority: ~/.config/solana/id.json
Deploying program "solana-stablecoin-standard"...
Program Id: Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm
```

### Initialize a test stablecoin on devnet

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json

# SSS-1 test
sss-token init \
  --preset sss-1 \
  --name "Test USD" \
  --symbol "TUSD" \
  --uri "https://example.com/tusd.json"

# SSS-2 test (compliance stablecoin)
sss-token init \
  --preset sss-2 \
  --name "Regulated Test USD" \
  --symbol "RTUSD" \
  --uri "https://example.com/rtusd.json"
```

### Run tests

```bash
# In repository root
anchor test
```

Tests use a local validator (via `anchor test` with `--validator legacy` on ARM64). They cover SSS-1 and SSS-2 initialization, all role-gated operations, and RBAC rejections.

---

## Mainnet Deployment

### Step 1: Generate a fresh program keypair (if needed)

The program keypair determines the program ID. The repository default IDs are:
- SSS main: `Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm`
- Transfer hook: `2fwDqWAneoErwq2dpMDjKibTx8kNJ7RLcEDyX5uzzdN8`

To use these same IDs on mainnet, you need the matching keypairs. If deploying with new IDs:

```bash
# Generate new program keypairs
solana-keygen new --outfile target/deploy/solana-stablecoin-standard-keypair.json
solana-keygen new --outfile target/deploy/sss-transfer-hook-keypair.json

# Update Anchor.toml and programs/*/src/lib.rs declare_id!() with the new IDs
# Also update programs/sss-transfer-hook/src/lib.rs SSS_PROGRAM_ID constant
# Then rebuild
anchor build
```

### Step 2: Configure for mainnet

```bash
solana config set --url mainnet-beta
```

Update `Anchor.toml`:
```toml
[provider]
cluster = "mainnet-beta"
wallet = "~/.config/solana/id.json"

[programs.mainnet]
solana_stablecoin_standard = "Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm"
```

### Step 3: Verify deploy cost and fund wallet

```bash
# Check .so file size
ls -lh target/sbpf-solana-solana/release/solana_stablecoin_standard.so

# Estimate deploy cost (approximately 2x file size in SOL)
solana program deploy --simulate target/sbpf-solana-solana/release/solana_stablecoin_standard.so

# Check wallet balance (ALWAYS use --url mainnet-beta)
solana balance --url mainnet-beta $(solana address)
```

Program deployment costs approximately 0.5–2 SOL depending on program size. Each mint initialization costs ~0.003 SOL (rent for PDAs).

### Step 4: Deploy

```bash
anchor deploy --provider.cluster mainnet-beta
```

Deployment is final: the program is live immediately after the transaction confirms.

### Step 5: Verify deployment

```bash
solana program show --url mainnet-beta Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm
```

### Step 6: Initialize the production stablecoin

```bash
export ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com
export ANCHOR_WALLET=/secure/master-authority.json

sss-token init \
  --preset sss-2 \
  --name "ACME USD" \
  --symbol "AUSD" \
  --uri "https://acme.finance/ausd-metadata.json" \
  --decimals 6 \
  --max-supply 1000000000000000 \
  --minter <minter-address> \
  --minter-quota 10000000000000
```

Record the mint address from the output and store it in your infrastructure configuration.

---

## Key Management

### Role separation

For production deployments, assign each role to a separate keypair controlled by different people or teams:

| Role               | Recommended Controller              | Key type              |
|--------------------|-------------------------------------|-----------------------|
| `master_authority` | Cold storage or multisig            | Hardware wallet or 2-of-3 multisig |
| `minter`           | Backend service or hot wallet       | Server keypair        |
| `burner`           | Backend service or hot wallet       | Server keypair        |
| `pauser`           | On-call engineer + automated system | HSM or server keypair |
| `blacklister`      | Compliance officer                  | Hardware wallet       |
| `seizer`           | Legal/compliance lead               | Hardware wallet       |

### Hardware wallet integration

Solana supports Ledger hardware wallets via the CLI:

```bash
# Use Ledger as authority
sss-token --keypair usb://ledger status --mint <address>

# Transfer authority to a Ledger-based multisig
sss-token --keypair /path/to/current.json \
  transfer-authority --mint <address> --new-authority <ledger-pubkey>
```

### Keypair storage recommendations

1. Store master authority keypair in cold storage (airgapped machine or HSM)
2. Store operational keypairs (minter, burner) in a secrets manager (AWS Secrets Manager, HashiCorp Vault)
3. Never store keypairs in environment variables on shared systems
4. Rotate operational keypairs every 90 days using `update_roles`
5. Keep backup keypairs in separate secure locations

### Updating roles

```bash
# Rotate the minter keypair
export ANCHOR_WALLET=/secure/master-authority.json
sss-token minters add \
  --mint <mint-address> \
  --minter <new-minter-address>
```

---

## Minter Quota Management

The minter quota limits how many tokens can be minted per epoch without master authority intervention. This provides a hard cap on daily/weekly issuance.

**Checking current quota usage:**
```bash
sss-token minters list --mint <mint-address>
# Minted this epoch: 5000000000000
# Quota: 10000000000000
```

**Resetting the quota** (by setting a new value — this also resets the counter):
```bash
sss-token minters add \
  --mint <mint-address> \
  --minter <same-or-new-minter> \
  --quota <new-quota>
```

Setting `--quota 0` removes the quota limit entirely.

**Design note:** Epoch boundaries are not currently time-based; the counter resets only when `update_roles` is called with a new `minter_quota` value. For time-based quota management, implement a cron job that calls `update_roles` to reset the counter at your desired interval.

---

## Emergency Procedures

### Emergency pause

If a vulnerability is discovered or an attack is underway, immediately pause all minting and burning:

```bash
# Using pauser keypair (fastest — no master authority needed)
export ANCHOR_WALLET=/secure/pauser.json
sss-token pause --mint <mint-address>

# Verify
sss-token status --mint <mint-address>
# Paused: true
```

Pause blocks `mint_tokens` and `burn_tokens` at the SSS program level. For SSS-1, peer-to-peer token transfers via raw Token-2022 are unaffected. For SSS-2, use blacklisting to block specific addresses.

### Freeze specific accounts

Freeze individual accounts without a global pause (less disruptive):

```bash
export ANCHOR_WALLET=/secure/pauser.json
sss-token freeze \
  --mint <mint-address> \
  --account <suspicious-token-account>
```

### SSS-2: Block and seize

For SSS-2 tokens where legal action is required:

```bash
# Step 1: Block immediately (compliance officer)
export ANCHOR_WALLET=/secure/compliance-officer.json
sss-token blacklist add \
  --mint <mint-address> \
  --address <wallet-address> \
  --reason 2   # 2 = fraud

# Step 2: Confirm block is live
sss-token blacklist check --mint <mint-address> --address <wallet-address>

# Step 3: Seize after legal approval (seizer keypair)
export ANCHOR_WALLET=/secure/seizer.json
sss-token seize \
  --mint <mint-address> \
  --from <target-ata> \
  --to <recovery-ata> \
  --amount <amount>
```

### Resume from pause

```bash
export ANCHOR_WALLET=/secure/pauser.json
sss-token unpause --mint <mint-address>

# Verify
sss-token status --mint <mint-address>
# Paused: false
```

---

## Monitoring and Audit

### Checking token status

```bash
# Full status
sss-token status --mint <mint-address>

# Current supply
sss-token supply --mint <mint-address>

# Minter usage
sss-token minters list --mint <mint-address>
```

### On-chain audit trail

Every instruction emits a program log entry with relevant details. Use the Solana Explorer or RPC to query transaction history:

```bash
# Get all transactions involving the config PDA
solana transaction-history <stablecoin-config-pda> --url mainnet-beta

# Decode a specific transaction
solana confirm -v <signature> --url mainnet-beta
```

For high-frequency audit requirements, run a validator with RPC enabled and subscribe to account changes on the `StablecoinConfig` and `RolesConfig` PDAs using WebSocket subscriptions (`accountSubscribe`).

### Blacklist audit (SSS-2)

The blacklist is fully on-chain. Enumerate all `BlacklistEntry` accounts for a given mint using `getProgramAccounts` filtered by the mint field:

```typescript
const entries = await connection.getProgramAccounts(SSS_PROGRAM_ID, {
  filters: [
    { dataSize: 114 },  // BlacklistEntry::LEN
    { memcmp: { offset: 8, bytes: mintPublicKey.toBase58() } },
  ],
});
```

---

## Upgradeability

Solana programs are upgradeable by default after deployment. The upgrade authority is the keypair used during `anchor deploy`.

### Upgrade the program

```bash
# Build updated version
anchor build

# Upgrade (requires upgrade authority keypair)
anchor upgrade \
  target/sbpf-solana-solana/release/solana_stablecoin_standard.so \
  --program-id Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm
```

### Make a program immutable

To permanently prevent upgrades (suitable after a security audit):

```bash
solana program set-upgrade-authority \
  Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm \
  --final \
  --url mainnet-beta
```

This is irreversible. Consider carefully before doing this on mainnet.

### Account migration considerations

PDA account layouts are fixed at deployment. Changing any account struct field order, type, or size requires a migration program or redeployment with new program IDs. The account sizes defined in `state.rs` use `LEN` constants to ensure consistent allocation.

---

## Common Errors and Troubleshooting

### `Unauthorized` (6000)

**Cause:** The signing keypair is not assigned to the required role.

**Resolution:**
1. Check which keypair you are using: `solana address`
2. Check role assignments: `sss-token status --mint <address>`
3. If the keypair should be authorized, update the role: `sss-token minters add --mint <address> --minter <address>`

### `TransfersPaused` (6001)

**Cause:** The `pause` instruction was called and not yet reversed.

**Resolution:**
```bash
sss-token unpause --mint <address>
```

### `Sss2NotEnabled` (6003)

**Cause:** A compliance instruction (`blacklist add`, `seize`) was called on an SSS-1 token.

**Resolution:** Check the token preset:
```bash
sss-token status --mint <address>
# Preset: SSS-1   ← SSS-2 features are unavailable on this token
```

If you need compliance features, you must create a new SSS-2 token. Presets cannot be changed after initialization.

### `MinterQuotaExceeded` (6005)

**Cause:** The requested mint amount would push `minted_this_epoch` over `minter_quota`.

**Resolution:** Check current usage and either wait for a manual quota reset or have the `master_authority` reset it:
```bash
sss-token minters list --mint <address>
# If quota needs to be reset:
sss-token minters add --mint <address> --minter <same-minter> --quota <new-quota>
```

### `MaxSupplyExceeded` (6004)

**Cause:** The total token supply would exceed `max_supply` after the mint.

**Resolution:** Check the current supply and configured max:
```bash
sss-token supply --mint <address>
sss-token status --mint <address>
```

Max supply cannot be raised after initialization. If you need a higher cap, create a new token with a larger `max_supply`.

### `Account not found` or PDA fetch failure

**Cause:** The mint address is incorrect, or the SSS `initialize` instruction was never called for this mint.

**Resolution:** Verify the mint exists and has SSS PDAs:
```bash
# Check the config PDA exists
solana account --url mainnet-beta <stablecoin-config-pda>
```

### Transaction simulation fails with `custom program error: 0x1771`

Anchor error codes start at 6000 decimal = 0x1770 hex. 0x1771 = error 6001. Map the hex offset to the error enum in `error.rs`.

### Deployment: `insufficient funds`

```bash
# Check balance
solana balance --url mainnet-beta

# Estimate deploy cost
solana program deploy --simulate <path/to/program.so>
```

Program deployment requires approximately 2–3 SOL for a typical Anchor program.

### RPC rate limiting

Public RPC endpoints (`api.mainnet-beta.solana.com`, `api.devnet.solana.com`) have strict rate limits. For production use:
- Alchemy: `https://solana-mainnet.g.alchemy.com/v2/<key>`
- Helius: `https://mainnet.helius-rpc.com/?api-key=<key>`
- QuickNode: `https://<endpoint>.solana-mainnet.quiknode.pro/<token>/`

Set your RPC URL in `ANCHOR_PROVIDER_URL` or `--rpc` flag.
