# OPERATIONS RUNBOOK

## Local Bootstrap
```bash
anchor build
anchor deploy
npx tsx scripts/test_basic.ts
```

## Docker Backend
```bash
docker-compose up -d
curl http://localhost:3000/api/audit
```

## Stress Test (Stage 25)
```bash
DEVNET_RPC=https://api.devnet.solana.com npx tsx scripts/stress_test.ts
```

## Common Failures
- `InvalidAccountData`: verify account types and passed hook extra accounts.
- `Failed to reallocate`: ensure no CPI realloc; pre-allocate extension accounts.
- `InstructionFallbackNotFound`: ensure transfer-hook `#[interface(...)]` remains present.

## Incident Triage
1. Capture tx signature.
2. Pull logs with `SendTransactionError.getLogs()`.
3. Compare failure pattern with known bug history in roadmap plan.
