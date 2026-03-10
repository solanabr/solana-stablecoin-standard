# Operations Runbook

This document covers operational procedures for teams deploying and managing SSS stablecoins. All examples use the `sss-token` CLI unless otherwise noted.

---

## Deploying a New Stablecoin

### Prerequisites

- Solana CLI 2.3.0 and Anchor 0.32.1 installed.
- Programs deployed: `sss-core` at `CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y`, `sss-hook` at `9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM`.
- Operator keypair with sufficient SOL for account rent (approximately 0.01–0.05 SOL for the mint and config accounts).
- SDK built: `cd sdk && yarn build`.

### SSS-1 Deployment

SSS-1 is the minimal preset. It does not require the hook program.

**1. Initialize the mint and config:**

```bash
sss-token init \
  --preset 1 \
  --name "My Stablecoin" \
  --symbol "MYSC" \
  --uri "https://cdn.example.com/mysc/metadata.json" \
  --decimals 6 \
  --keypair /path/to/authority.json \
  --url https://api.mainnet-beta.solana.com
```

Record the `mint` and `config` addresses from the output. These are permanent — the mint address cannot be changed.

**2. Verify the deployment:**

```bash
sss-token info config \
  --mint <MINT_ADDRESS> \
  --url https://api.mainnet-beta.solana.com
```

Confirm: `preset = 1`, `paused = false`, all roles set to the authority address.

**3. Delegate roles (recommended):**

Separate operational keys reduce the blast radius of any single key compromise.

```bash
# Assign a dedicated pauser key
sss-token roles update \
  --mint <MINT_ADDRESS> \
  --role Pauser \
  --address <PAUSER_WALLET> \
  --keypair /path/to/authority.json

# Assign a dedicated master_minter key
sss-token roles update \
  --mint <MINT_ADDRESS> \
  --role MasterMinter \
  --address <MASTER_MINTER_WALLET> \
  --keypair /path/to/authority.json
```

**4. Configure the first minter:**

```bash
sss-token minter configure \
  --mint <MINT_ADDRESS> \
  --minter <MINTER_WALLET> \
  --quota <QUOTA_IN_BASE_UNITS> \
  --keypair /path/to/master_minter.json
```

### SSS-2 Deployment

SSS-2 adds the transfer hook, blacklist, seize, and default-frozen. The deployment is a two-transaction process.

**1. Initialize the mint and config (must include hook program):**

```bash
sss-token init \
  --preset 2 \
  --name "Compliant Stablecoin" \
  --symbol "CSTBL" \
  --uri "https://cdn.example.com/cstbl/metadata.json" \
  --decimals 6 \
  --hook-program 9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM \
  --keypair /path/to/authority.json \
  --url https://api.mainnet-beta.solana.com
```

**2. Initialize the transfer hook:**

This step creates the `HookConfig` and `ExtraAccountMetaList` PDAs required for the hook to function. It must be done before any transfers occur.

```bash
# Currently via SDK (CLI support for init-hook is in the blacklist/init flow)
# Use the SDK directly:
import { ComplianceClient, SSS_HOOK_PROGRAM_ID } from "@sss/sdk";
const client = new ComplianceClient(connection, wallet);
await client.initializeHook(new PublicKey("<MINT_ADDRESS>"));
```

**3. Delegate roles:**

Same as SSS-1, plus assign the `Blacklister` role:

```bash
sss-token roles update \
  --mint <MINT_ADDRESS> \
  --role Blacklister \
  --address <COMPLIANCE_WALLET> \
  --keypair /path/to/authority.json
```

**4. KYC gate flow (SSS-2 specific):**

All new token accounts start frozen by default (from the `DefaultAccountState` extension). Before a recipient can receive tokens, their token account must be explicitly thawed:

```bash
sss-token freeze thaw \
  --mint <MINT_ADDRESS> \
  --account <RECIPIENT_TOKEN_ACCOUNT> \
  --keypair /path/to/authority_or_blacklister.json
```

This acts as the KYC gate: only accounts that have been through your onboarding process and had their accounts thawed can hold or transfer tokens.

**5. Configure minters and begin minting:**

Same as SSS-1 steps 4+ above.

---

## Managing Minters

### Configure a new minter

```bash
sss-token minter configure \
  --mint <MINT_ADDRESS> \
  --minter <MINTER_WALLET> \
  --quota <QUOTA_IN_BASE_UNITS> \
  --keypair /path/to/master_minter.json
```

`--quota` is in base units. For a 6-decimal token, 1,000,000 tokens = `1000000000000`.

The quota is a **lifetime** cap; it does not reset and is not restored by burning. To increase a minter's quota, call `configure_minter` again with a higher value. To decrease it below the amount already minted, set `quota` to the current `minted_amount` (the minter is effectively at cap).

### Adjust a minter's quota

```bash
# Increase quota to 5,000,000 tokens
sss-token minter configure \
  --mint <MINT_ADDRESS> \
  --minter <MINTER_WALLET> \
  --quota 5000000000000 \
  --keypair /path/to/master_minter.json
```

To check a minter's current usage:

```bash
sss-token info minter \
  --mint <MINT_ADDRESS> \
  --minter <MINTER_WALLET>
```

### Remove a minter

```bash
sss-token minter remove \
  --mint <MINT_ADDRESS> \
  --minter <MINTER_WALLET> \
  --keypair /path/to/master_minter.json
```

This sets `MinterState.enabled = false`. The `MinterState` account is preserved for audit purposes; the minted amount and quota history remain readable on-chain.

---

## Emergency Procedures

### Pause all operations

Use this to halt minting, burning, and (for SSS-2) all transfers immediately.

```bash
sss-token pause \
  --mint <MINT_ADDRESS> \
  --keypair /path/to/pauser.json \
  --yes
```

After pausing, verify the state:

```bash
sss-token info config --mint <MINT_ADDRESS>
# paused should show: true
```

Note: Freeze and thaw operations continue to work while paused. This allows compliance actions without resuming full operations.

### Resume operations

```bash
sss-token unpause \
  --mint <MINT_ADDRESS> \
  --keypair /path/to/pauser.json \
  --yes
```

### Freeze a specific account

Freezing prevents the account from sending or receiving tokens, regardless of blacklist state.

```bash
sss-token freeze account \
  --mint <MINT_ADDRESS> \
  --account <TOKEN_ACCOUNT_ADDRESS> \
  --keypair /path/to/authority_or_blacklister.json
```

Works even when paused.

### Blacklist a wallet (SSS-2)

Blacklisting blocks all transfers to and from the wallet's token accounts. Unlike freezing an account, blacklisting affects all token accounts owned by the wallet.

```bash
sss-token blacklist add \
  --mint <MINT_ADDRESS> \
  --wallet <WALLET_ADDRESS> \
  --reason "OFAC SDN match — case ID 20240101-001" \
  --keypair /path/to/blacklister.json \
  --yes
```

Verify:

```bash
sss-token blacklist check \
  --mint <MINT_ADDRESS> \
  --wallet <WALLET_ADDRESS>
```

### Seize tokens from a blacklisted account (SSS-2)

After blacklisting a wallet, you may seize its tokens to a designated treasury account. Only the `authority` can seize.

```typescript
// Via SDK (CLI seize command coming soon)
import { ComplianceClient } from "@sss/sdk";
import { BN } from "@coral-xyz/anchor";

const client = new ComplianceClient(connection, authorityWallet);
await client.seize(
  mint,
  blacklistedTokenAccount,
  treasuryTokenAccount,
  new BN(amount)
);
```

For SSS-2, the `seize` instruction uses the `PermanentDelegate` extension; the transfer hook is also invoked (blacklisted senders are blocked). To successfully seize from a blacklisted account, you must either:
- Remove the blacklist entry temporarily, seize, then re-add it, OR
- The seize instruction itself is signed by the `mint_authority` PDA as the permanent delegate, not by the blacklisted wallet, so the source blacklist check applies to the source account's **owner**. Verify your hook version's behavior.

### Remove a wallet from the blacklist

```bash
sss-token blacklist remove \
  --mint <MINT_ADDRESS> \
  --wallet <WALLET_ADDRESS> \
  --keypair /path/to/blacklister.json \
  --yes
```

---

## Authority Transfer Process

Changing the `authority` role is a two-step process designed to prevent accidental transfers to inaccessible addresses.

**Step 1 — Initiate the transfer (current authority):**

```bash
sss-token roles transfer-authority \
  --mint <MINT_ADDRESS> \
  --new-authority <NEW_AUTHORITY_WALLET> \
  --keypair /path/to/current_authority.json
```

This sets `StablecoinConfig.pending_authority = NEW_AUTHORITY_WALLET`. The current authority retains full control until the transfer is accepted. The transfer can be cancelled by calling `transfer-authority` again with a different address or by calling it with the zero address.

**Step 2 — Accept the transfer (new authority):**

The new authority must sign this transaction with the keypair corresponding to `NEW_AUTHORITY_WALLET`.

```bash
sss-token roles accept-authority \
  --mint <MINT_ADDRESS> \
  --keypair /path/to/new_authority.json
```

After acceptance, `config.authority = new_authority` and `config.pending_authority` is cleared.

**Verify:**

```bash
sss-token info config --mint <MINT_ADDRESS>
# authority should show: NEW_AUTHORITY_WALLET
# pending_authority should show: 11111111111111111111111111111111 (Pubkey::default)
```

---

## Monitoring and Indexing

### Anchor Event Subscriptions

All instructions emit Anchor events that can be subscribed to via WebSocket. Events are emitted as log-encoded data in the transaction logs.

Key events to monitor:

| Event | Trigger |
|---|---|
| `StablecoinInitialized` | New stablecoin deployed |
| `MinterConfigured` | Minter quota set or updated |
| `MinterRemoved` | Minter disabled |
| `TokensMinted` | Tokens minted (includes remaining quota) |
| `TokensBurned` | Tokens burned |
| `AccountFrozen` / `AccountThawed` | Account freeze state changed |
| `Paused` / `Unpaused` | Pause state changed |
| `RoleUpdated` | Any role reassigned |
| `AuthorityTransferInitiated` | Authority transfer started |
| `AuthorityTransferAccepted` | Authority transfer completed |
| `TokensSeized` | Tokens seized (SSS-2) |
| `HookInitialized` | Hook setup for SSS-2 mint |
| `AddedToBlacklist` | Wallet blacklisted |
| `RemovedFromBlacklist` | Wallet un-blacklisted |

### Account Polling

Poll `StablecoinConfig` to track pause state and role assignments:

```typescript
import { findConfigPda, StablecoinClient } from "@sss/sdk";

const client = new StablecoinClient(connection, wallet);
const config = await client.getConfig(mint);

console.log("Paused:", config.paused);
console.log("Total minted:", config.totalMinted.toString());
console.log("Total burned:", config.totalBurned.toString());
```

Poll `MinterState` to track individual minter usage:

```typescript
const minterState = await client.getMinterState(mint, minterWallet);
const remaining = minterState.quota.sub(minterState.mintedAmount);
console.log("Remaining quota:", remaining.toString());
```

### Dry-Run Mode

Before executing any operation in production, validate with `--dry-run`:

```bash
sss-token mint \
  --mint <MINT_ADDRESS> \
  --destination <TOKEN_ACCOUNT> \
  --amount 1000000000 \
  --dry-run \
  --output json
```

This prints what would be submitted without sending a transaction.
