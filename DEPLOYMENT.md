# Devnet Deployment

This runbook is the exact path to produce bounty submission evidence on devnet.

## Prerequisites

- funded deploy wallet in `~/.config/solana/id.json`
- Solana CLI, Anchor, and Node.js installed
- `npm run build:programs` completed successfully
- optional `.env` copied from `.env.example`

## Environment

```bash
export SSS_RPC_URL=https://api.devnet.solana.com
export SSS_KEYPAIR=~/.config/solana/id.json
export SSS_STABLECOIN_PROGRAM_ID=<stablecoin_program_id>
export SSS_TRANSFER_HOOK_PROGRAM_ID=<transfer_hook_program_id>
export SSS_REGISTRY_PROGRAM_ID=<registry_program_id>
export SERVICE_API_KEY=<long_random_secret>
```

PowerShell:

```powershell
$env:SSS_RPC_URL="https://api.devnet.solana.com"
$env:SSS_KEYPAIR="$HOME/.config/solana/id.json"
$env:SSS_STABLECOIN_PROGRAM_ID="<stablecoin_program_id>"
$env:SSS_TRANSFER_HOOK_PROGRAM_ID="<transfer_hook_program_id>"
$env:SSS_REGISTRY_PROGRAM_ID="<registry_program_id>"
$env:SERVICE_API_KEY="<long_random_secret>"
```

## Preflight

```bash
npm run devnet:preflight
npm run devnet:manifest
```

## Program Deployment

```bash
npm run build:programs
solana program deploy target/deploy/transfer_hook.so --program-id <transfer_hook_program_id> --url "$SSS_RPC_URL"
solana program deploy target/deploy/stablecoin.so --program-id <stablecoin_program_id> --url "$SSS_RPC_URL"
solana program deploy target/deploy/sss_registry.so --program-id <registry_program_id> --url "$SSS_RPC_URL"
```

After deployment, record the program IDs in:

- `SUBMISSION.md`
- the PR body
- your shell environment

## Registry Initialization

Publish the release metadata before registering live mints:

```bash
sss-token registry-release \
  --registry-program-id <registry_program_id> \
  --standard-version sss/1.1.0 \
  --preset sss-3 \
  --notes-uri https://example.com/releases/sss-1-1-0 \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

## Example Mints

### SSS-1

```bash
sss-token init \
  --preset sss-1 \
  --program-id <stablecoin_program_id> \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

### SSS-2

```bash
sss-token init \
  --preset sss-2 \
  --program-id <stablecoin_program_id> \
  --transfer-hook-program-id <transfer_hook_program_id> \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

### SSS-3

```bash
sss-token init \
  --preset sss-3 \
  --program-id <stablecoin_program_id> \
  --transfer-hook-program-id <transfer_hook_program_id> \
  --standard-version sss/1.1.0 \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

For SSS-2 and SSS-3, initialize the transfer-hook meta list before any gated transfer:

```bash
sss-token init-hook \
  --mint <mint_address> \
  --transfer-hook-program-id <transfer_hook_program_id> \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

## Role Setup

```bash
sss-token minters grant <operator_pubkey> \
  --mint <mint_address> \
  --program-id <stablecoin_program_id> \
  --quota 1000000000 \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

## Standard Operations

Mint example:

```bash
sss-token mint <destination_token_account> 1000000 \
  --mint <mint_address> \
  --program-id <stablecoin_program_id> \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

SSS-2 blacklist and seize example:

```bash
sss-token blacklist add <holder_pubkey> \
  --reason "OFAC match" \
  --mint <mint_address> \
  --program-id <stablecoin_program_id> \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json

sss-token seize <from_token_account> \
  --to <treasury_token_account> \
  --mint <mint_address> \
  --program-id <stablecoin_program_id> \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

## Registry Registration

```bash
sss-token registry-register \
  --mint <mint_address> \
  --program-id <stablecoin_program_id> \
  --registry-program-id <registry_program_id> \
  --homepage https://issuer.example.com \
  --jurisdiction US \
  --rpc https://api.devnet.solana.com \
  --keypair ~/.config/solana/id.json
```

After the example mints are created, export them and run:

```bash
export SSS1_MINT=<sss1_mint>
export SSS2_MINT=<sss2_mint>
export SSS3_MINT=<sss3_mint>
npm run devnet:verify
```

## SSS-3 Evidence

Capture these items for the submission:

- SSS-3 mint address
- compliance root update signature
- proof receipt submission signature
- successful gated transfer signature
- failed transfer after proof revoke

The local equivalent is already covered by:

```bash
npm run smoke:localnet:e2e
```

## Backend Services

Run the backend stack from the repository root:

```bash
docker compose up --build
```

Every backend request except `/health` must include `x-api-key: $SERVICE_API_KEY` or `Authorization: Bearer $SERVICE_API_KEY`.

Health checks:

- `http://localhost:3001/health`
- `http://localhost:3002/health`
- `http://localhost:3003/health`
- `http://localhost:3004/health`

## Frontend Deployment

For local wallet-enabled preview:

```bash
npm run frontend:serve
```

Open `http://127.0.0.1:4173`.

For a static deployment artifact:

```bash
npm run frontend:deploy
```

This writes a hostable bundle to `artifacts/frontend-static/`.

Important: browser extension wallets such as Phantom, Solflare, and Backpack generally do not inject into `file://` pages. Do not test wallet flows by opening `frontend/index.html` directly from disk; serve the frontend over HTTP/HTTPS instead.
