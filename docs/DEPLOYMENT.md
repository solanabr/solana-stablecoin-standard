# Deployment Proof

## Environment
- Network: Surfpool Localnet
- Validator RPC: `http://localhost:8899`
- Cloak Relay: `http://localhost:8080` (when running)

## Program IDs (Localnet)
| Program | ID |
|---------|-----|
| SSS Stablecoin | `AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j` |
| SSS Transfer Hook | `FiUMBoLyzCzgXQwysxY7ypo4DcZ21Svd2qScsfdtsrj` |

## Deployment Transactions (Surfpool)
- Stablecoin deploy tx: `siD9qHR58bubw73MvZHp9woBjmPGjKSM2TPE8yA1yauAwGeXHjeLrkcKeFvPqqV8axwMfumSL5rrqou5hMxpj4n`
- Transfer hook deploy tx: `2L5v1LhTsNfq2d5GWxzpJRv9sc4S4oJUW8uu7T4QZygedPk4FaeZBzQgZXYQQ2x1kFbYiQZ8YABhSWdXyFvUsi5x`

## Demo Flows

### SSS-1: Minimal Stablecoin
Run: `npx ts-node scripts/demo-sss1.ts`
- Initialize `DemoUSD` (`DUSD`, 6 decimals)
- Add minter with quota
- Mint tokens
- Freeze/thaw account
- Pause/unpause

### SSS-2: Compliant Stablecoin
Run: `npx ts-node scripts/demo-sss2.ts`
- Initialize `RegulatedUSD` (`RUSD`) with permanent delegate + transfer hook
- Mint tokens, blacklist address, freeze, seize to treasury
- Transfer-hook blacklist blocking depends on extra-account resolution wiring

### SSS-3: Private Stablecoin (Cloak Integration)
Run: `npx ts-node scripts/demo-sss3.ts`
- Initialize with `enable_privacy = true`
- Connect to live Cloak relay endpoints on same localnet
- Show viewing-key model and SDK -> relay endpoint mapping
- Note current SOL-centric Cloak pipeline vs future SPL private stablecoin transfers

### Cloak Health on Same Network
Run: `npx ts-node scripts/demo-cloak.ts`
- Checks relay health
- Queries Merkle root and commitments endpoints

### Full Demo Runner
Run: `bash scripts/demo-all.sh`

## How to Reproduce

```bash
# 1) Start Surfpool (Cloak workspace)
cd ~/cloak-sss/cloak
surfpool start

# 2) Cloak setup commands (as provided)
cd ~/cloak-sss/cloak/packages && just build
cd ~/cloak-sss/cloak/programs && just setup
cd ~/cloak-sss/cloak/services && just dev

# 3) Deploy SSS programs on same localnet
cd ~/cloak-sss/solana-stablecoin-standard
solana config set --url http://localhost:8899
cargo build-sbf --manifest-path sss-stablecoin/Cargo.toml
cargo build-sbf --manifest-path sss-transfer-hook/Cargo.toml
solana program deploy target/deploy/sss_stablecoin.so --program-id target/deploy/sss_stablecoin-keypair.json --url http://localhost:8899
solana program deploy target/deploy/sss_transfer_hook.so --program-id target/deploy/sss_transfer_hook-keypair.json --url http://localhost:8899

# 4) Run demos
bash scripts/demo-all.sh
```
