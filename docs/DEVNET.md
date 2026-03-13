# Devnet Deployment

The SSS programs are deployed on **Solana Devnet**. Use the program IDs below with the SDK, CLI, and indexer.

## Program IDs (Devnet)

| Program   | Address | Explorer |
|-----------|---------|----------|
| **SSS Token (sss-1)** | `47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ` | [View on Explorer](https://explorer.solana.com/address/47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ?cluster=devnet) |
| **Transfer Hook (sss-2)** | `8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc` | [View on Explorer](https://explorer.solana.com/address/8DMsf39fGWfcrWVjfyEq8fqZf5YcTvVPGgdJr8s2S8Nc?cluster=devnet) |

These match `Anchor.toml` and each program’s `declare_id!`. No redeploy needed — use these IDs for devnet.

## Deploy (if you need to redeploy)

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Use the same program IDs in Anchor.toml for devnet so the SDK and CLI work without change.

## Devnet walkthrough (copy-paste)

Full deployment steps are in [DEPLOY_PROGRAM.md](DEPLOY_PROGRAM.md). Minimal sequence to deploy and use each preset on devnet:

```bash
# 1. Build and set cluster
anchor build && pnpm run build:sdk
solana config set --url devnet
solana airdrop 2

# 2. Deploy (if using your own program IDs, run scripts/upgrade-program-id.sh first)
anchor deploy --provider.cluster devnet

# 3. SSS-1: init and mint
pnpm run cli init --preset sss-1 -n "Dev USD" -s DUSD --uri "https://example.com"
# Set MINT_1 to the printed mint address
pnpm run cli -m <MINT_1> mint $(solana address) 1000000

# 4. SSS-2: init, mint, one compliance action
pnpm run cli init --preset sss-2 -n "Reg USD" -s RUSD --uri ""
# Set MINT_2 to the printed mint; grant blacklister role then:
pnpm run cli -m <MINT_2> blacklist add <SOME_ADDRESS> --reason "Test"
```

Replace `<MINT_1>`, `<MINT_2>`, and `<SOME_ADDRESS>` with actual pubkeys. For seize you need a source token account with balance and a destination token account; see [OPERATIONS.md](OPERATIONS.md).

## Example transactions

After deploying and creating a stablecoin:

1. **Initialize (SSS-1 or SSS-2)** — From CLI: `sss-token init --preset sss-1 -n "Test" -s TST --uri "https://example.com"`. Or use the TypeScript SDK `SolanaStablecoin.create(connection, { preset: "SSS_1", ... }, keypair)`.
2. **Mint** — `sss-token -m <MINT> mint <RECIPIENT> 1000000`.
3. **Status** — `sss-token -m <MINT> status`.
4. **Supply** — `sss-token -m <MINT> supply`.

Example Solana Explorer links (replace `<SIG>` and `<MINT>` with actual values):

- Transaction: `https://explorer.solana.com/tx/<SIG>?cluster=devnet`
- Mint account: `https://explorer.solana.com/address/<MINT>?cluster=devnet`

## Proof of deployment

1. **Deploy programs:** `anchor build && anchor deploy --provider.cluster devnet`
2. **Run example operations:** Initialize a stablecoin (SSS-1 or SSS-2), mint, and optionally for SSS-2 run blacklist + seize. Example:
   - `sss-token init --preset sss-1 -n "Test" -s TST --uri "https://example.com"`
   - `sss-token -m <MINT> mint <RECIPIENT> 1000000`
   - For SSS-2: `sss-token -m <MINT> blacklist add <ADDRESS> --reason "OFAC"` then `sss-token -m <MINT> seize <ADDRESS> --to <TREASURY>`
3. **Capture proof:** Paste Solana Explorer links in the table below (or run integration tests on devnet and copy from the output).

### Example transactions (Devnet proof)

Run `anchor test --provider.cluster devnet --skip-build --skip-deploy` and copy the Explorer lines from the output into this table (or paste your own). At least one **Initialize** and one **Mint** are required for submission.

| Action | Explorer |
|--------|----------|
| **Initialize (SSS-1)** | [2UFPxeQubnso6ounH3Tr9tBQ1JVcxRTKGazAVYatnX3YRiGCriXr2v6vg1srxeq9XQj8TbERXijmzjBiPZUA2k9](https://explorer.solana.com/tx/2UFPxeQubnso6ounH3Tr9tBQ1JVcxRTKGazAVYatnX3YRiGCriXr2v6vg1srxeq9XQj8TbERXijmzjBiPZUA2k9?cluster=devnet) |
| **Mint** | [56T3XGTvasM7rmR88e9TYN2JAnDg1ondWyteW18pDPP3Prdn5edAofFE4egQ6jdF3kBxF6Fyw1uS3Q6k3z1Khcsj](https://explorer.solana.com/tx/56T3XGTvasM7rmR88e9TYN2JAnDg1ondWyteW18pDPP3Prdn5edAofFE4egQ6jdF3kBxF6Fyw1uS3Q6k3z1Khcsj?cluster=devnet) |
| **Initialize (SSS-2)** | [4HC5L8tCjTmh41zemBbqM9MffEWqabbNQsHLLvPfXjwRf2FiFVZLbRRLDzrEYGr5WLT1thKU15j1q3C5wzhUc4rM](https://explorer.solana.com/tx/4HC5L8tCjTmh41zemBbqM9MffEWqabbNQsHLLvPfXjwRf2FiFVZLbRRLDzrEYGr5WLT1thKU15j1q3C5wzhUc4rM?cluster=devnet) |
| **Seize (SSS-2)** | [56m6nWhMEsGYUQ83CJfQDqhkYTS7oRRHvmy4kHiyhiB9jvpm11menbxetZhib6uwoZjg4EBUrKtjae2AsBaPVd1J](https://explorer.solana.com/tx/56m6nWhMEsGYUQ83CJfQDqhkYTS7oRRHvmy4kHiyhiB9jvpm11menbxetZhib6uwoZjg4EBUrKtjae2AsBaPVd1J?cluster=devnet) |

**Example mint account (SSS-1):** [9zsXSvAxz1opCQvwgeXswGnMbG4xV8dWmdT1emAFy9nY](https://explorer.solana.com/address/9zsXSvAxz1opCQvwgeXswGnMbG4xV8dWmdT1emAFy9nY?cluster=devnet)

Optional: run `./scripts/devnet-proof.sh` after deploy to perform init + mint and print Explorer URLs (requires configured keypair and RPC).

## Integration tests on Devnet

Run the full integration test suite against devnet (no local validator):

```bash
anchor test --provider.cluster devnet --skip-build --skip-deploy
```

Each transaction is logged with an **Explorer** link (e.g. `https://explorer.solana.com/tx/<SIG>?cluster=devnet`) so you can paste proof into submissions.

**Note:** After all tests pass you may see `Error: No such file or directory (os error 2)`. This comes from Anchor’s post-test step (it may look for a local validator PID file). The tests have already completed successfully; the message is harmless and can be ignored. To avoid it, run the test script directly:

```bash
ANCHOR_PROVIDER_CLUSTER=devnet yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/sss-token.test.ts tests/sss-transfer-hook.test.ts
```

(Ensure `anchor build` has been run at least once so IDL and program artifacts exist.)

---

## Verification

- Build and test: `anchor build && npm run build:sdk && npm run test:sdk && anchor test` (integration tests require a running validator).
- CLI: `node packages/cli/dist/index.js --help`.
- Backend: `cd backend && npm run build && npm start` then `curl http://localhost:3000/health`.
