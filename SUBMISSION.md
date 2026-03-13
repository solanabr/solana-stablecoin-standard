## Requirements Checklist

| Requirement | Status | Evidence |
|---|---|---|
| All source code | Ready | Programs, SDK, CLI, backend, frontend, scripts, docs are included in this repo. |
| Working tests | Ready | `npm.cmd test`, `npm.cmd run verify`, and `cargo test` passed locally on March 13, 2026. |
| Devnet deployment proof | Mostly ready | Program IDs, example mints, init signatures, registry registration signatures, and SSS-3 proof-flow signatures are documented below. |
| Documentation | Ready | See `README.md`, `docs/`, `DEPLOYMENT.md`, `frontend.md`, and this file. |
| Docker setup for backend | Ready | `docker compose up --build` from repo root, or `backend/docker-compose.yml` for backend-only stack. |

## Program IDs

- Stablecoin program: `Gm2SdmH1ydLKmPtjNE4W2ZLjW5kMvPrx784L7oUcw4w`
- Transfer-hook program: `E24UT9RMiw9zBh51ZMzXRdmoiLQ2PkVZ1sYhBKqazYy8`
- Registry program: `5vedffCtRhecm5sSXJCbgrwe7GYnGC9XK5vWLiMHLVXB`

Source:

- `artifacts/devnet-manifest.json`
- `artifacts/devnet-e2e-results.json`

## Registry Proof

- Registry config PDA: `HoC2rSYk4WMiU35FeizxkN253dGSxpJi1yowVig4PW5`
- Registry initialization signature: `5kRZRwhePmLtJcpDjDiyRbbzhLeHKhCKAkPuu9Cxf4vKwaz5sTEHwFAzbe3KpR9Gdb9tiKouKk4gvmjLBgNJamtk`
- `sss/1.1.0` release PDA: `Hogm8eegvjGb5ATpnHTnrJeuTGW5QdJdJ69WxDkAeaxq`
- Registry release signature for `sss/1.1.0`: `3TmxAAgn5xx6QztoeFYmukUmQpG2b4ZLBKEMeMbn6eqTCCfbPbvDHnvrW2s4xXhsrf5iZRF8Dqtg5vaH61LukpK4`

These were confirmed directly against devnet by decoding the on-chain `InitializeRegistry` and `RegisterRelease` transactions.

## Example Devnet Deployments

### SSS-1

- Mint: `5CtycKpzocgMiXHxBLsg2D3BeLoXfgUQTYUMT5FH9jS3`
- Config PDA: `JCeXdny8fM2wTNw8mavT7YbTgRz6NYSLVqosfjrTkk6P`
- Init signature: `4tNPwAzaBo6z6FZLDj6HEHF8gvsKMsjhWX4keuuMvPSH3jZ3ko3DMmV4VKngj3edRwJ6r2AFmdWX2HujyRvyY87x`
- Registry registration signature: `5aR65Q9e1fA2cRvGfh3fyQoPQqogahEswPxQHEFDMreV5iSv5XVJxFRd4pfrEgzNRHmGsK4vmctABx8emLQ1cUac`

### SSS-2

- Mint: `GfmjjNV65fbHh2rkpZeN2n9Va2Zthy9Ryg7joUiLECon`
- Config PDA: `52YVYX1TinD1NZgjkYL95HRJKyH58Putmk2i7fYY819U`
- Init signature: `2YVBr9AdHf5rJdCMqRAnodwasLNFPeLUGxrHrCmFH24xDYbRrLphF1jCEQYEwYDFqPtr7ijoqxK5WK2vJvNFbL6c`
- Transfer-hook init signature: `4UDZwfwPeDEUkuASgm5pcE33gr9RLhVySD2jFWerwptTKKSvyoiZpYK92mt5mf1Wmu4oJF8eQCKQ6riE2V3qePFw`
- Registry registration signature: `3hTAqkeAd5LdVFNbNvK5eRx9g8UXmtftafKSWdM4UzKDPAehaGM9CnUj6ULJzkw3A9AN1vfiJ4Bm5PeP7M8cAQyY`

### SSS-3

- Mint: `H546fRf1MRhPM1rFejYdViTFqPUVsTtbisbFMGH9JhEQ`
- Config PDA: `4z1LmpFBqfYQugbSTbWteZzLntgCN6vU934ZKwCGiuCx`
- Init signature: `4U53iJsWiEsFEintSajDPkME1MvigqiPzUmQk38CbQfgFLmu6A6xypnJceksozFsznRUL9x24nF35uaBzw2ka6ka`
- Transfer-hook init signature: `3tzngJ96aWr3wCiMp1enh98BicfbhiDtYo3XwBavcwFBkE16qCtmvyck3jZantpReYjxGamq2SUt3TrtHAExFBRr`
- Registry registration signature: `RiKb87REnAdP7KMLM73R48znU3e9fsMbv6WivpfH7GCYsUVVBx3h6nmhaSHSP8V3axyYYP5r91xA44MFMUvGv1J`

## Example Transactions

### SSS-2 operational proof

- Pause: `4x35W4kAshfUimkxArAUTLGRTkdg3sPZFyN1zBYdsWCeeSBTMM1wxDoYz41r14Dhjze8sZ6uP2HNHxsTxHzh64F7`
- Unpause: `4YWYQophAjJUHAakX74qCBYdwBWUfsKJAfkHnaRNgfnppdnyq7mToMf8EEGHjsJzLTqR8Y56uEFjDhHM1bFDsJHn`
- Blacklist add: `4cbnvqERT7GXycUkG2vZ38q5fRKAh1agdyXn33EX92BmZJMHfwzAfJp1S6gX4ZV3zt8Z3mPXo6aDLBNmzQMiJxUq`
- Blacklist remove: `43f8YC7Xv9NKh5fpnGQcfpMRzqUZ13k67DhnS22WwQVQuiJKphmt6ZVuZyGZfduVuvzDhfFKUSKqd8Hg6q3mxcTa`
- Seize: `63Cd66eomBdkgL4Kx3CCeYi3nar1sSBi8CGEHNBA1b7R4q57DPy1agr2swhHEW5SVo37wJhaaduSpso9tfP9dbBU`

### SSS-3 proof-gated flow

- Compliance root update: `35831iej57FxXm8nKXV8L9afQq2YdXWP6jAuc8xAuXYGx3B9uj3vdRR1QdHKkuDVS1tqCaad3BqGGbNPKiAcioYB`
- Proof receipt submit: `3K3tuZq2eyDeLHvMBme97awQjxt2p2a1LSDGZFWQh6FMs9vp16Cgp4Jn855xCLHAXPwo7YMoUpJkrsJQdi4pdvq5`
- Transfer with valid proof: `4TmSJ6eBY3qBcngd3P4fkHQdUjHkiXUMPFgdGqjuvMNKSYa1Xc3ZzUyh6sYZh4finLhRZHhmnn4dTx9MptFYPKAW`
- Proof revoke: `Z9MnKZE9fEdVrnmgmjpbGCbYDkMx3W7LtMsHWYnsA2UKqmaRpP7yukjHQFd3CN5ERJVT8WodcdtGHW1J2v2c9Vo`
- Post-revoke transfer check: expected failure

## Tests Run

Executed locally on March 13, 2026:

- `npm.cmd test`
- `npm.cmd run verify`
- `cargo test`
- `npm.cmd run build:frontend`
- `npm.cmd run frontend:deploy`

## Documentation Included

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/SDK.md`
- `docs/OPERATIONS.md`
- `docs/COMPLIANCE.md`
- `docs/REGISTRY.md`
- `docs/REGISTRY-PROGRAM.md`
- `docs/API.md`
- `docs/DEVNET-LAUNCH.md`
- `DEPLOYMENT.md`
- `frontend.md`

## Backend Docker

Repository root:

```bash
docker compose up --build
```

Backend-only compose file:

```bash
docker compose -f backend/docker-compose.yml up --build
```

Services:

- Mint service: `http://localhost:3001`
- Event indexer: `http://localhost:3002`
- Compliance service: `http://localhost:3003`
- Webhook service: `http://localhost:3004`

All non-health endpoints require:

- `x-api-key: <SERVICE_API_KEY>`
- or `Authorization: Bearer <SERVICE_API_KEY>`

## Frontend Submission Notes

- Local wallet-enabled preview: `npm run frontend:serve`
- Static deployment export: `npm run frontend:deploy`
- Static output directory: `artifacts/frontend-static`

Important: Phantom, Solflare, and Backpack generally do not inject into `file://` pages. Wallet flows should be tested over HTTP/HTTPS, not by opening `frontend/index.html` directly from disk.

## Final Before PR

These are the only remaining items I would still verify manually before opening the PR:

1. If this workspace is attached to a real git repo locally, add the commit SHA to the PR body or this file.
2. If you re-run `devnet:manifest` locally with `SSS1_MINT`, `SSS2_MINT`, and `SSS3_MINT` exported, it should regenerate the manifest with the example mint values already reflected here.

## Evidence Sources

- `artifacts/devnet-manifest.json`
- `artifacts/devnet-e2e-results.json`
- `README.md`
- `DEPLOYMENT.md`
- `docs/DEVNET-LAUNCH.md`
