# Devnet Deployment

## Program IDs

- Stablecoin Program: `AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j`
- Transfer Hook Program: `FiUMBoLyzCzgXQwysxY7ypo4DcZ21Svd2qScsfdtsrj`

## Deployment Proof

Executed on devnet with `solana program deploy`:

```bash
solana program deploy target/deploy/sss_stablecoin.so \
  --program-id target/deploy/sss_stablecoin-keypair.json \
  --url devnet

solana program deploy target/deploy/sss_transfer_hook.so \
  --program-id target/deploy/sss_transfer_hook-keypair.json \
  --url devnet
```

Resulting transaction signatures:

- Stablecoin deploy tx: `QLqBs1N8fkXqs3MW7j5MsLouj1oJJ9mWeTNxpDLxckcvdvR1yQwPVCUFsz7TW6H1PhvRgyzcKH7EJqaUbS57CCt`
- Transfer hook deploy tx: `2tYYAbVCfH2k4zjd8WViAqWmNwjMdT67uSmJcpqgcCrg8J5FLtccPfasZUapotEt9rMZQRb6PhmzCYNaQ6AqvpDE`

## Token-2022 Extension Verification

Run script:

```bash
npx ts-node scripts/verify-extensions.ts
```

Current status in this environment:

- Script path: `scripts/verify-extensions.ts`
- Result: simulation failed with `DeclaredProgramIdMismatch` on `initialize`
- Blocker: a redeploy/upgrade is required to align the deployed binary with the current declared program IDs, and the deploy wallet currently lacks enough devnet SOL for the upgrade transaction rent

Last observed deploy blocker:

- `solana program deploy target/deploy/sss_stablecoin.so --program-id target/deploy/sss_stablecoin-keypair.json --url devnet`
- Error: `insufficient funds for spend (3.15603288 SOL) + fee (0.002255 SOL)`
