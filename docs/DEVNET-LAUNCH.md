# Devnet Launch

## Goal

This checklist is the minimum bar for a shared devnet environment that infra, integration, and QA teams can use safely.

## Required Inputs

- funded deployer keypair in `SSS_KEYPAIR`
- devnet RPC in `SSS_RPC_URL`
- deployed program IDs in:
  - `SSS_STABLECOIN_PROGRAM_ID`
  - `SSS_TRANSFER_HOOK_PROGRAM_ID`
  - `SSS_REGISTRY_PROGRAM_ID`
- backend auth secret in `SERVICE_API_KEY`

## Launch Steps

1. Build everything.

```bash
npm install
npm run build
npm run build:programs
```

2. Run preflight.

```bash
npm run devnet:preflight
```

3. Deploy or confirm programs on devnet.

```bash
solana program deploy target/deploy/transfer_hook.so --program-id <transfer_hook_program_id> --url "$SSS_RPC_URL"
solana program deploy target/deploy/stablecoin.so --program-id <stablecoin_program_id> --url "$SSS_RPC_URL"
solana program deploy target/deploy/sss_registry.so --program-id <registry_program_id> --url "$SSS_RPC_URL"
```

4. Generate a release manifest for the deployed binaries and configured program IDs.

```bash
npm run devnet:manifest
```

Default output: `artifacts/devnet-manifest.json`

5. Publish the registry release record.

```bash
sss-token registry-release \
  --registry-program-id "$SSS_REGISTRY_PROGRAM_ID" \
  --standard-version sss/1.1.0 \
  --preset sss-3 \
  --notes-uri https://example.com/releases/sss-1-1-0 \
  --rpc "$SSS_RPC_URL" \
  --keypair "$SSS_KEYPAIR"
```

6. Create and record known-good example mints.

- one SSS-1 mint
- one SSS-2 mint
- one SSS-3 mint

Export them as:

- `SSS1_MINT`
- `SSS2_MINT`
- `SSS3_MINT`

7. Run devnet verification.

```bash
npm run devnet:verify
```

This checks:

- deployer balance and RPC reachability
- all three program IDs exist and are executable
- the registry config PDA exists
- each configured example mint exists
- each derived stablecoin config PDA exists

8. Start backend services.

```bash
docker compose up --build
```

Every non-health request must include:

- `x-api-key: $SERVICE_API_KEY`
- or `Authorization: Bearer $SERVICE_API_KEY`

## Sign-Off Checklist

- `npm test` passes
- `cargo test` passes
- `npm run verify` passes
- `npm run devnet:preflight` passes
- `npm run devnet:manifest` produces a manifest checked into release artifacts
- `npm run devnet:verify` passes against devnet
- program IDs are documented
- example mint addresses are documented
- registry release and registry registration signatures are documented
- backend health endpoints respond
- backend auth secret is stored outside the repo

## Recommended Release Artifact Set

- `artifacts/devnet-manifest.json`
- program IDs
- example mint addresses
- transaction signatures for init, registry release, registry register, and one SSS-3 gated transfer
- git commit SHA
