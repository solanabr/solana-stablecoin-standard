# Operations Runbook

This runbook covers deployment, routine operations, incident response, and recovery procedures for SSS stablecoin operators.

---

## Initial Setup

### Prerequisites

- Solana CLI >= 2.1 with a funded devnet/mainnet keypair
- Anchor CLI 0.32.1: `cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.32.1`
- Node.js >= 18, Yarn

### Build and Deploy

```bash
# 1. Build the programs
anchor build

# 2. Sync program IDs (run after every first build)
anchor keys sync

# 3. Verify program IDs match Anchor.toml
grep -A2 "\[programs.localnet\]" Anchor.toml
# sss_token = "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp"
# transfer_hook = "6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47"

# 4. Run tests (against localnet)
anchor test

# 5. Deploy to devnet
anchor deploy --provider.cluster devnet

# 6. Verify deployment
solana program show GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp --url devnet
```

### Initialize a Stablecoin

**SSS-1 (TypeScript SDK):**

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { SolanaStablecoin, Presets } from "@stbr/sss-token";
import { readFileSync } from "fs";

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.KEYPAIR_PATH, "utf-8")))
);
const connection = new Connection(process.env.RPC_URL, "confirmed");

const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: "My USD",
  symbol: "MUSD",
  decimals: 6,
  authority,
});

console.log("SSS-1 initialized. Mint:", stable.mint.toBase58());
```

**SSS-2 (TypeScript SDK):**

```typescript
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Compliant USD",
  symbol: "CUSD",
  decimals: 6,
  authority,
});

console.log("SSS-2 initialized. Mint:", stable.mint.toBase58());
// SDK automatically calls initialize_extra_account_meta_list for the transfer hook
```

**CLI:**

```bash
# SSS-1
npx sss-token init --name "My USD" --symbol MUSD --decimals 6 --preset sss-1

# SSS-2
npx sss-token init --name "Compliant USD" --symbol CUSD --decimals 6 --preset sss-2
```

**Start backend services:**

```bash
cp backend/.env.example backend/.env
# Edit backend/.env:
#   RPC_URL=https://api.devnet.solana.com
#   KEYPAIR_PATH=/path/to/authority.json
#   WEBHOOK_URL=https://your-compliance-endpoint.com/webhook
#   WEBHOOK_SECRET=<random-secret>

docker compose -f backend/docker-compose.yml up -d
```

---

## Minting Tokens

**Verify stablecoin state first:**

```bash
curl http://localhost:3001/v1/status?mint=<MINT_PUBKEY>
# Check: paused == false before minting
```

**Via mint-service API:**

```bash
curl -X POST http://localhost:3001/v1/mint \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBKEY>",
    "recipient": "<RECIPIENT_WALLET>",
    "amount": "1000000",
    "reference": "order-12345"
  }'
```

**Via SDK:**

```typescript
const sig = await stable.mint({
  recipient: new PublicKey("<RECIPIENT_WALLET>"),
  amount: 1_000_000n,
});
console.log("Minted. Signature:", sig);
```

**Via CLI:**

```bash
npx sss-token mint <RECIPIENT_WALLET> 1000000 --mint <MINT_PUBKEY>
```

**Adding a delegated minter:**

```typescript
// Grant a minter with a 10 MUSD daily quota
await stable.addMinter(
  new PublicKey("<MINTER_WALLET>"),
  10_000_000n  // 10 MUSD at 6 decimals
);
```

---

## Freezing an Account

**When to use:**
- Suspected fraud or unauthorized access pending investigation
- Court-ordered hold on assets
- OFAC SDN designation (use blacklist first, freeze as backup)
- Terms of service violation requiring review

**How to freeze:**

```bash
# Via API (no freeze endpoint in mint-service; use compliance-service or SDK directly)

# Via SDK
await stable.freezeAccount(tokenAccount);

# Via CLI
npx sss-token freeze <TOKEN_ACCOUNT> --mint <MINT_PUBKEY>
```

**How to thaw:**

```typescript
await stable.thawAccount(tokenAccount);
```

**Verify freeze state:**

```typescript
import { getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
const account = await getAccount(connection, tokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
console.log("isFrozen:", account.isFrozen);
```

---

## Responding to a Sanctions Match (SSS-2)

Follow this workflow when an OFAC or other sanctions authority designates a wallet address that holds or has transacted with your stablecoin.

### Step 1 - Receive and Verify Designation

- Confirm the designation from the official OFAC SDN list or relevant authority.
- Identify all wallet addresses linked to the designated entity.
- Confirm the wallet has a balance in your stablecoin.

### Step 2 - Add to Blacklist (Immediate Effect)

```bash
curl -X POST http://localhost:3003/v1/compliance/blacklist \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBKEY>",
    "address": "<SANCTIONED_WALLET>",
    "reason": "OFAC SDN 2026-03-03 — <entity name>"
  }'
```

Effect: **immediate**. The transfer hook blocks all token transfers to/from this address in the next block. The wallet cannot send or receive your stablecoin.

Verify:

```bash
curl "http://localhost:3003/v1/compliance/blacklist?mint=<MINT_PUBKEY>&address=<SANCTIONED_WALLET>"
# Expected: { "blacklisted": true }
```

### Step 3 - Freeze the Account

Add a second enforcement layer in case the hook is somehow bypassed (defense in depth).

```typescript
const tokenAccount = stable.getTokenAccount(new PublicKey("<SANCTIONED_WALLET>"));
await stable.freezeAccount(tokenAccount);
```

### Step 4 - Execute Seizure (If Ordered)

Only proceed if a court order, regulatory directive, or lawful authority requires asset transfer.

```bash
curl -X POST http://localhost:3003/v1/compliance/seize \
  -H "Content-Type: application/json" \
  -d '{
    "mint": "<MINT_PUBKEY>",
    "fromTokenAccount": "<SANCTIONED_ATA>",
    "toTokenAccount": "<COMPLIANCE_TREASURY_ATA>",
    "amount": "<FULL_BALANCE>"
  }'
```

### Step 5 - Document and Report

- Export the audit log entry: `GET /v1/compliance/audit-log?mint=<MINT>&action=blacklisted`
- Record the on-chain transaction signatures.
- File SAR with FinCEN if applicable.
- Notify counsel of the seizure if performed.

---

## Emergency Pause

**When to use:**
- Critical bug discovered in minting or burning logic
- Suspected oracle manipulation or market emergency
- Active exploit requiring time to assess impact

**How to pause:**

```typescript
await stable.pause();
```

Effect: `mint_to` and `burn` revert with `ProgramPaused`. All other operations (freeze, role management, authority transfer) continue to work. Existing token transfers are not affected.

**How to verify pause:**

```bash
curl http://localhost:3001/v1/status?mint=<MINT_PUBKEY>
# Check: "paused": true
```

**How to unpause:**

Before unpausing, confirm:
- [ ] The root cause has been identified and addressed
- [ ] All affected accounts have been frozen if necessary
- [ ] Legal and compliance teams have approved resumption

```typescript
await stable.unpause();
```

---

## Authority Rotation

The master authority key is the most privileged key in the system. Rotate it if:
- The current authority private key is compromised or suspected compromised
- Organizational changes require transferring control
- Upgrading to a multisig arrangement

### Safety Checklist Before Rotating

- [ ] New authority key is ready and **confirmed working** (test a signature)
- [ ] New authority key is stored securely (hardware wallet or MPC)
- [ ] Team is aware of the key change
- [ ] No pending operations that require the current authority key
- [ ] The new authority has been verified (not a typo)

### Two-Step Rotation Process

**Step 1 - Nominate (current authority signs):**

```typescript
await stable.nominateAuthority(new PublicKey("<NEW_AUTHORITY_PUBKEY>"));
```

At this point, the current authority retains full control. The new authority has no power until step 2.

**Step 2 - Accept (new authority signs):**

```typescript
// Load the stable with the NEW authority keypair
const stableWithNewAuthority = await SolanaStablecoin.load(
  connection,
  newAuthorityKeypair,
  stable.mint
);
await stableWithNewAuthority.acceptAuthority();
```

**Verify the transfer:**

```typescript
const state = await stable.refresh();
console.log("New authority:", state.authority.toBase58());
```

If step 2 is never completed (e.g., the new authority key is inaccessible), the current authority retains control. The nomination can be overridden by nominating a different address (note: the current implementation requires `pending_authority == None` before a new nomination can be made; you would need to accept the current nomination with any key that matches it, or this would require a program upgrade in a worst-case scenario where a bad key was nominated).

---

## Monitoring

### Events to Watch

Configure webhook alerts for these events from the indexer:

| Event | Alert Level | Action |
|---|---|---|
| `BlacklistUpdated` | Info | Log to compliance system |
| `TokensSeized` | Critical | Notify compliance officer immediately |
| `AccountFrozen` | Warning | Review if unexpected |
| `PauseChanged { paused: true }` | Critical | Page on-call team |
| `AuthorityTransferred` | Critical | Verify intentional; alert security |
| Large `TokensMinted` | Warning | Verify against expected order |
| `MinterUpdated` | Info | Audit trail |

### Webhook Setup

Set `WEBHOOK_URL` in `backend/.env` to your compliance endpoint. The indexer signs each payload with `WEBHOOK_SECRET` using SHA-256. Verify the `X-SSS-Signature` header on receipt:

```typescript
import { createHash } from "crypto";

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = createHash("sha256")
    .update(secret + body)
    .digest("hex");
  return expected === signature;
}
```

### Health Checks

```bash
# mint-service
curl http://localhost:3001/health
# Expected: { "status": "ok", "service": "mint-service" }

# compliance-service
curl http://localhost:3003/health
# Expected: { "status": "ok", "service": "compliance-service" }

# indexer: check its logs
docker logs sss-indexer --tail 50
```

---

## Recovery Procedures

### Authority Key Compromised

**Immediate actions (first 5 minutes):**

1. If the attacker has not yet taken control, rotate authority immediately using the two-step transfer process (see Authority Rotation above). Transfer to a secure key.

2. Pause the stablecoin to stop all minting and burning:

```typescript
await stable.pause();
```

3. Freeze any accounts that show suspicious outflows.

4. If SSS-2: blacklist any addresses that received tokens from suspicious minting.

**If the attacker has already accepted authority:**

The attacker now controls the stablecoin. They can:
- Mint unlimited tokens (inflating supply)
- Freeze or thaw accounts
- Add/remove roles

They **cannot** upgrade the program (that requires Solana upgrade authority, separate from the stablecoin authority).

Actions:
- Notify all downstream integrators and exchanges immediately.
- Prepare a public disclosure.
- If the mint has a Token-2022 freeze authority (held by the config PDA), the attacker cannot unilaterally move user funds without going through the program. Token seizure requires the Seizer role or master authority.
- Engage Solana security community and relevant authorities.

### Indexer Down

The indexer is a monitoring service; its downtime does not affect on-chain operations. Minting, burning, freezing, and compliance operations continue regardless of indexer status.

To restart:

```bash
docker compose -f backend/docker-compose.yml restart sss-indexer
```

Missed events can be recovered by re-scanning on-chain logs for the `sss_token` program ID using a Solana archival RPC (e.g., Helius, Triton).

### Compliance Service Down

The compliance service provides REST API access to compliance operations. Its downtime does not affect on-chain state. Blacklist entries remain active; the transfer hook continues enforcing them.

For emergency compliance actions while the service is down, use the SDK directly:

```typescript
await stable.compliance.blacklistAdd(address, reason);
await stable.freezeAccount(tokenAccount);
```

### Mint Account Data Corruption

Token-2022 mint accounts are managed by the Solana runtime. Data corruption is extremely unlikely. If it occurs, the mint is effectively lost - there is no recovery mechanism. This underscores the importance of:
- Not holding critical assets on a single stablecoin without collateral backing
- Having reserve attestation and redemption mechanisms independent of on-chain state
