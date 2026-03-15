# Operations Guide

## Day-to-Day Operations

### Minting Tokens

```bash
# Via CLI
sss-token mint --mint <MINT_ADDRESS> --to <DESTINATION_ATA> --amount 1000000

# Via SDK
await stable.mint(destinationATA, 1_000_000n);
```

The minter must have the `Minter` role. If a mint quota is set, the operation will fail if the cumulative minted amount exceeds the quota.

### Burning Tokens

```bash
sss-token burn --mint <MINT_ADDRESS> --from <SOURCE_ATA> --amount 500000
```

The burner must have the `Burner` role and be the owner of the source token account (or have delegate authority).

### Freezing/Thawing Accounts

```bash
sss-token freeze --mint <MINT_ADDRESS> --account <TOKEN_ACCOUNT>
sss-token thaw --mint <MINT_ADDRESS> --account <TOKEN_ACCOUNT>
```

Requires `Pauser` role or master authority. Frozen accounts cannot send or receive tokens.

### Pausing/Unpausing

```bash
sss-token pause --mint <MINT_ADDRESS>
sss-token unpause --mint <MINT_ADDRESS>
```

Pause requires `Pauser` role or master authority. **Unpause requires master authority only** — this prevents a rogue pauser from both pausing and unpausing.

### Checking Status

```bash
sss-token status --mint <MINT_ADDRESS>
sss-token supply --mint <MINT_ADDRESS>
```

## Role Management

### Granting Roles

```bash
sss-token roles grant --mint <MINT> --address <HOLDER> --role minter --quota 5000000
sss-token roles grant --mint <MINT> --address <HOLDER> --role burner
sss-token roles grant --mint <MINT> --address <HOLDER> --role pauser
sss-token roles grant --mint <MINT> --address <HOLDER> --role compliance
```

### Checking Roles

```bash
sss-token roles list --mint <MINT> --address <HOLDER>
```

### Revoking Roles

```bash
sss-token roles revoke --mint <MINT> --address <HOLDER> --role minter
```

## Emergency Procedures

### Global Pause

If suspicious activity is detected:

1. **Pause immediately**: `sss-token pause --mint <MINT>`
2. Investigate the activity
3. If SSS-2: blacklist suspicious addresses
4. If SSS-2: seize tokens from blacklisted accounts
5. **Unpause** (master authority only): `sss-token unpause --mint <MINT>`

### Authority Compromise

If the master authority keypair is compromised:

1. Transfer authority to a secure address immediately
2. Revoke all roles from the compromised address
3. Re-grant roles as needed

```typescript
await stable.roles.transferAuthority(newSecureAuthority);
```

## Monitoring

### Event Indexer

The event indexer service tracks all stablecoin operations. Deploy with:

```bash
cd services && docker-compose up -d
```

The indexer connects to the Solana cluster via WebSocket and logs all program events with structured JSON output.

### Health Checks

All services expose health endpoints at `/health`:

```bash
curl http://localhost:3001/health  # Mint/burn coordinator
curl http://localhost:3002/health  # Event indexer
curl http://localhost:3003/health  # Compliance service
```
