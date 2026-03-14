# Deployment Guide

## Program IDs

### Devnet

| Program | Program ID | Status |
|---------|-----------|--------|
| sss-stablecoin | `5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL` | `Deployed` |
| sss-transfer-hook | `CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H` | `Deployed` |

### Mainnet

| Program | Program ID | Status |
|---------|-----------|--------|
| sss-stablecoin | `TBD` | ⬜ Not deployed |
| sss-transfer-hook | `TBD` | ⬜ Not deployed |

---

## Verified Devnet Deployment

Upgrade authority:

- `2novXSsPmWVMeUfPB72yEBCNqtGPBB8PGBJNh1fUYWtk`

Deployment signatures:

- Stablecoin deploy/upgrade: `3DfyS6Gh5iCEMKCBdHB2doYd392cqyCZYp9nwYQM5AhLmzGaHkxSk1k7fA1qskREsFttyvM9UYHZmTN1szXx3MR3`
- Transfer hook deploy: `rMd64AuY714yPdaf2Hix8KxsZtpNhABVKYxEWzbXmqgEEb6bf9VTAdFgK8kdRzaCXWtVUSY3xUbSKQS4bdpCP4W`

Smoke test addresses:

- Mint: `C43gLMEDgD44BiQfpTj9QqaUsgfng4HJqLztsiGbaNiY`
- Config: `8Qhi7ioYbnd2t2DHQzzXKDunmM9n2W2FHqvrHuHsJtie`
- Hook config: `E1hU4pCya927oAfNnzCn2B3uVMCAhRDyquk26WPUQ6h1`
- Extra account meta list: `Ho4XCUVZnAtVkxNrgZYhf1EjTkG63M1xJcdNgFaMvAiB`

Smoke test signatures:

- Initialize: `4srG7P8wNeHrowLATemgPmznRrxn9g4RaAw4ousioS2TrrEcy7zNLPTFb9JbA1SCr6S4XFT2LgmV6v9yjnvfsUS9`
- Initialize hook: `5k7kZhAeCxT3p4eesUxjpPLLukvgLp9PzGkxTKN29WhzRuY1E9hp9sybc7YPcWi552y7kxRMG5D6JiqscsDF8urj`
- Mint: `3qX8Sj473g8FEEARApS8qYS87BUbSD99irgftaZNt2HQ6FQavG4UFtNdEvsv1REDjCtzZY91qe3c9df789GkgiML`
- Blacklist: `3Lh2yXPm42PF5FW1MXmKjZiFgjoQ5puwHDT5A8HNaXNoPPNJhyPkuopJCMvwzs4cPR6KQFzuAz5VyRYu7mVFSv6q`
- Seize: `4ut59q2Z8BJLidVN6gELLHR5nraWZgCG32jT4sLJHkwWHSzyxfhr6zqWmhcNeLmKW5nVZDmbJDWE5xyV6JFL1gXM`

Observed smoke-test result:

- blacklisted transfer blocked successfully
- final user A balance: `1750000`
- final treasury balance: `250000`

Known limitation:

- the deployable SDK path uses a multi-step flow: the SDK creates the mint first, sets the metadata pointer to the config PDA, then initializes the SSS config with on-chain `name`, `symbol`, and `uri`

## Prerequisites

### Tools

- Solana CLI v3.0.6
- Anchor CLI v0.32.1
- Node.js v22+
- pnpm v10+

### Wallet Setup

```bash
# Generate deployment keypair
solana-keygen new -o deploy-keypair.json

# Fund with SOL (Devnet)
solana airdrop 5 <PUBKEY> --url devnet

# Set as default
solana config set --keypair deploy-keypair.json
```

---

## Devnet Deployment

### Step 1: Build Programs

```bash
# Build all programs
anchor build

# Verify build artifacts
ls target/deploy/
# Should see: sss_stablecoin.so, sss_transfer_hook.so
```

### Step 2: Deploy Programs

```bash
# Set to Devnet
solana config set --url devnet

anchor deploy --provider.cluster devnet --provider.url https://api.devnet.solana.com
```

### Step 3: Update Configuration

The repository is already synced to the current deployed devnet IDs:

```toml
[programs.devnet]
sss_stablecoin = "5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL"
sss_transfer_hook = "CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H"
```

### Step 4: Verify Deployment

```bash
solana program show 5C7LHvieTag3oioHsni4SgTVDeCYMLTchix5obimXkEL --url devnet
solana program show CHfiQPpbATb9qDbYMA8sRKPxRu3sYHdMW4s4JG4xJt1H --url devnet

# Run the reusable devnet smoke script
pnpm exec tsx tests/devnet-smoke.ts
```

---

## Example Transactions (Devnet)

### Initialize SSS-1

```typescript
const sss1 = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_1,
  name: 'USD1',
  symbol: 'USD1',
  decimals: 6,
  treasury: treasuryPubkey,
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});

console.log('SSS-1 Mint:', sss1.addresses.mint.toBase58());
```

**Devnet Example**:
- Mint: `58rmLpFBYQYtibqHC6BdR8TVq1FEG8xbGhdg3euYsrvL`
- Config: `vX41iCwY3YRViNDJseqpxqp2KH9aLzNMDxtewToQdn5`

### Initialize SSS-2

```typescript
const sss2 = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: 'USD2',
  symbol: 'USD2',
  decimals: 6,
  treasury: treasuryPubkey,
  initialMinterQuota: 1_000_000_000n,
  initialMinterWindowSeconds: 86400,
});

console.log('SSS-2 Mint:', sss2.addresses.mint.toBase58());
```

**Devnet Example**:
- Mint: `58rmLpFBYQYtibqHC6BdR8TVq1FEG8xbGhdg3euYsrvL`
- Config: `vX41iCwY3YRViNDJseqpxqp2KH9aLzNMDxtewToQdn5`
- Transfer Hook Config: `ATWg323A5vKAcdfSjK35xAX747fC9F4y7bokcXNiQU1x`

### Mint Tokens

```typescript
const sig = await sss.mint({
  authority: payer,
  recipientTokenAccount: recipientAta,
  amount: 1000000n,
});

console.log('Mint TX:', sig);
```

**Devnet Example TX**: `2dEN7MBVkxW6WZpQcVocZMrofCZCuVzJkeZywXH6VLcj3No9bNsT4bD4GTt2v1rptPG4Zt6u2cmPtB2QWJ8exQSL`

### Blacklist (SSS-2)

```typescript
const sig = await sss.compliance.blacklistAdd(
  authority,
  walletToBlacklist,
  'OFAC match'
);

console.log('Blacklist TX:', sig);
```

**Devnet Example TX**: `GUqGRmdqVvErXv2tBms6rTEtq5i1JU63BTwzabJeYNyxeCuGDi5ykV12YDBChgEcfCR1xr4j29GReXkgbcr6GQ2`

### Seize (SSS-2)

```typescript
const sig = await sss.compliance.seize({
  authority,
  sourceTokenAccount: sourceAta,
  destinationTokenAccount: treasuryAta,
  sourceOwner: walletOwner,
  amount: 500000n,
});

console.log('Seize TX:', sig);
```

**Devnet Example TX**: `wfcaQcmQQa4T8HahzxZLDX8h1LS1kCf8oTLfZ45PUN2ZqRx4E2oXNLtgTT4i8c2MEsoN1fytbzeT8mH4aBNoT9P`

---

## Backend Deployment

### Docker Compose

```bash
cd backend

# Prepare lockfile
cp ../sss.lock.example.json ../sss.lock.json

# Update the lockfile for your own mint if you are not using the documented devnet smoke deployment

# Build and run
docker compose up -d

# Check health
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Solana RPC endpoint | `http://localhost:8899` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@postgres:5432/sss` |
| `SSS_LOCKFILE_PATH` | Path to sss.lock.json | `/app/sss.lock.json` |
| `SSS_KEYPAIR_PATH` | Path to keypair | `/app/secrets/id.json` |
| `WEBHOOK_URL` | Optional webhook endpoint | - |
| `LOG_LEVEL` | Logging level | `info` |

Verification note:

- `docker compose -f backend/docker-compose.yml config` has been validated successfully
- service packages build successfully
- current backend tests are smoke-level, not full integration coverage

---

## Mainnet Deployment Considerations

### Pre-Deployment Checklist

- [ ] Third-party security audit completed
- [ ] Bug bounty program established
- [ ] Monitoring infrastructure ready
- [ ] Incident response plan documented
- [ ] Legal review of compliance features (SSS-2)
- [ ] Key custody procedures established

### Key Management

**Recommended**: Use a multi-signature setup for master authority.

```bash
# Create 3-of-5 multisig
# 1. Generate 5 keypairs
# 2. Create multisig with threshold 3
# 3. Set as master authority during initialization
```

### Deployment Steps

1. **Staging**: Deploy to Devnet, run full test suite
2. **Review**: Security audit of deployed programs
3. **Mainnet Deploy**: Deploy programs
4. **Initialize**: Create production stablecoin
5. **Verify**: All operations working as expected
6. **Monitor**: Set up alerts and dashboards

### Cost Estimation

| Action | Cost (SOL) |
|--------|-----------|
| Program deployment (per program) | ~2-5 SOL |
| Initialize stablecoin | ~0.01 SOL |
| Mint operation | ~0.000005 SOL |
| Compliance operation (SSS-2) | ~0.00001 SOL |

---

## Upgrade Strategy

### Immutable Programs

Solana programs are immutable once deployed. To "upgrade":

1. Deploy new program version
2. Initialize new stablecoin with migration plan
3. Coordinate token holder migration
4. Deprecate old program

### Data Migration

If state structure changes:

1. Export state from old program
2. Deploy new program
3. Initialize with exported state
4. Verify state integrity

---

## Troubleshooting

### Deployment fails with "insufficient funds"

```bash
# Check balance
solana balance --url devnet

# Request airdrop
solana airdrop 5 --url devnet
```

### Program too large

```bash
# Check program size
ls -lh target/deploy/*.so

# Optimize build
anchor build --release
```

### Transaction simulation failed

```bash
# Check logs
solana logs --url devnet

# Verify program ID matches
anchor idl init <PROGRAM_ID> --filepath target/idl/sss_stablecoin.json
```

---

## Verification

### Verify Program on SolanaFM

1. Go to [SolanaFM Devnet](https://solana.fm/?cluster=devnet)
2. Search for your program ID
3. Verify:
   - Program data hash matches build
   - Deploy authority is correct
   - Program is executable

### Verify IDL

```bash
# Fetch on-chain IDL
anchor idl fetch <PROGRAM_ID> --url devnet

# Compare with local
anchor idl parse --file target/idl/sss_stablecoin.json
```

---

## Support

For deployment issues:
- Check [Solana Stack Exchange](https://solana.stackexchange.com/)
- Review [Anchor Documentation](https://book.anchor-lang.com/)
- Open an issue on GitHub
