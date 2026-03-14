# Operations Runbook

## Operator model

Recommended separation of duties:

- `master`: emergency and governance authority
- `pauser`: incident stop authority
- `burner`: supply reduction authority
- `blacklister`: sanctions/compliance authority
- `seizer`: legal recovery authority
- `minters`: issuance authorities with quotas

Use distinct wallets or custody policies for each role in production.

## Initialize

```bash
sss-token init --preset sss-1 --name "USD1" --symbol USD1 --treasury <TREASURY_TOKEN_ACCOUNT>
sss-token init --preset sss-2 --name "USD2" --symbol USD2 --treasury <TREASURY_TOKEN_ACCOUNT>
```

For SDK-driven creation, use `SolanaStablecoin.create(...)`. This is the preferred path because it performs the full multi-step mint/config setup.

## Mint / Burn

```bash
sss-token mint <RECIPIENT_WALLET_OR_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
sss-token burn <AMOUNT_BASE_UNITS>
sss-token burn <FROM_TOKEN_ACCOUNT> <AMOUNT_BASE_UNITS>
```

## Freeze / Thaw / Pause

```bash
sss-token freeze <WALLET_OR_TOKEN_ACCOUNT>
sss-token thaw <WALLET_OR_TOKEN_ACCOUNT>
sss-token pause
sss-token unpause
```

## Compliance (SSS-2)

```bash
sss-token blacklist add <WALLET> --reason "sanctions_match"
sss-token blacklist remove <WALLET>
sss-token seize <WALLET_OR_TOKEN_ACCOUNT> --to <TREASURY_TOKEN_ACCOUNT> --amount <AMOUNT>
```

## Minter management

```bash
sss-token minters list
sss-token minters add <WALLET> --quota <AMOUNT> --window <SECONDS>
sss-token minters remove <WALLET>
```

## Monitoring

```bash
sss-token status
sss-token supply
sss-token holders --min-balance <AMOUNT>
sss-token audit-log --action <ACTION>
sss-token tui
```

## Routine checks

Before each issuance window:

1. verify current cluster and program IDs
2. verify treasury ATA
3. verify active minter quotas
4. verify paused status is `false`
5. verify SSS-2 hook config if compliance is enabled

After sensitive actions:

1. record transaction signature
2. verify expected supply or balance change
3. verify indexer captured the event
4. export audit trail if action was compliance-related

## Incident response guidelines

1. Pause immediately on anomalous mint/transfer behavior.
2. Freeze identified compromised accounts.
3. For SSS-2, blacklist impacted wallets and seize where legally authorized.
4. Export audit logs from compliance service and preserve signatures.
5. Rotate master/operational roles via `transferAuthority` and `updateRoles`.

## Devnet demo checklist

1. create mint
2. create treasury ATA and user ATAs
3. mint to user
4. transfer once successfully
5. blacklist user
6. confirm transfer is blocked
7. seize to treasury
