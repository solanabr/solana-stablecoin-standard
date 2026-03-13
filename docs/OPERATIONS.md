# Operations

## Common Commands

```bash
sss-token init --preset sss-1 --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json
sss-token init --preset sss-2 --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json
sss-token init --preset sss-3 --rpc https://api.devnet.solana.com --keypair ~/.config/solana/id.json
sss-token init --custom ./stablecoin.toml --dry-run
sss-token mint <destination_token_account> <amount> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token burn <source_token_account> <amount> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token freeze <token_account> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token thaw <token_account> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token status --mint <mint_address> --program-id <stablecoin_program_id>
```

## SSS-2 Commands

```bash
sss-token blacklist add <address> --reason "OFAC match" --mint <mint_address> --program-id <stablecoin_program_id>
sss-token blacklist remove <address> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token seize <from_token_account> --to <treasury_token_account> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token minters grant <operator_pubkey> --mint <mint_address> --program-id <stablecoin_program_id> --quota 1000000000
sss-token minters revoke <operator_pubkey> --mint <mint_address> --program-id <stablecoin_program_id>
sss-token registry-register --mint <mint_address> --program-id <stablecoin_program_id> --registry-program-id <registry_program_id>
sss-token registry-release --registry-program-id <registry_program_id> --standard-version sss/1.1.0
```

## SSS-3 Commands

```bash
sss-token init --preset sss-3 --program-id <stablecoin_program_id> --transfer-hook-program-id <transfer_hook_program_id>
sss-token init-hook --mint <mint_address> --transfer-hook-program-id <transfer_hook_program_id>
sss-token registry-register --mint <mint_address> --program-id <stablecoin_program_id> --registry-program-id <registry_program_id>
```

## Operator Guidance

Use separated keys for master authority and operational roles. For SSS-2, any blacklist action should be paired with an audit note and external case identifier.
The CLI now fails fast on missing addresses, zero amounts, invalid decimals, oversize metadata, and empty blacklist reasons.

## Devnet Mint Creation

`sss-token init` creates a real Token-2022 mint when:

- `--dry-run` is not set
- `--keypair` points to a funded signer file
- `--rpc` targets a reachable cluster such as `https://api.devnet.solana.com`
- `--program-id` points at a deployed stablecoin program

The command returns the mint address, config PDA, and transaction signature.

## Local Verification

Run `npm run build` followed by `npm run verify` to validate the TypeScript SDK, CLI parsing/config loading, and backend shared state helpers in a deterministic local pass.
If `solana-test-validator` is running locally, use `npm run smoke:localnet` for an RPC-backed SSS-1/SSS-2 smoke harness.
Use `npm run smoke:localnet:e2e` for the full registry + SSS-1/SSS-2/SSS-3 local validator flow, including zk proof receipt submission and transfer-hook enforcement.

## Devnet Verification

Use these scripts after deploying to devnet:

```bash
npm run devnet:preflight
npm run devnet:manifest
npm run devnet:verify
```

`devnet:manifest` writes `artifacts/devnet-manifest.json` with the current commit, configured program IDs, local binary hashes, and known example mint env vars.
`devnet:verify` checks that the configured devnet programs are executable, the registry config PDA exists, and any configured `SSS1_MINT`, `SSS2_MINT`, and `SSS3_MINT` accounts plus their config PDAs are present.

## Backend Services

Run all backend services from the repository root:

```bash
docker compose up --build
```

Service endpoints:

- mint service: `http://localhost:3001`
- event indexer: `http://localhost:3002`
- compliance service: `http://localhost:3003`
- webhook service: `http://localhost:3004`

Operational requirements:

- every non-health request must include `x-api-key: $SERVICE_API_KEY` or `Authorization: Bearer $SERVICE_API_KEY`
- default request body limit is `65536` bytes
- default rate limit is `120` authenticated requests per minute per client/IP key pair
