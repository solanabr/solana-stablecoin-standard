# SSS Operational Scripts

A collection of utility scripts for deployment, testing, and devnet verification.

## 📄 Scripts

- `devnet_deploy.sh`: Orchestrates a full SSS cluster deployment to Solana Devnet.
- `local_validator.sh`: Spins up a pre-configured local validator with Token-2022 and SSS programs pre-loaded.
- `faucet_airdrop.sh`: Utility to airdrop SOL and mock collateral to test accounts.

## 🚢 Deployment Flow

```mermaid
sequenceDiagram
    participant D as Developer
    participant S as scripts/devnet_deploy.sh
    participant A as Anchor CLI
    participant R as Solana Devnet

    D->>S: Execute deploy
    S->>A: anchor build & deploy
    A->>R: Upload BPF Bytecode
    S->>A: Initialize Mint & Hooks
    R->>S: Success (Program IDs returned)
    S->>D: Save program-ids.json
```

## 🛠️ Usage
```bash
./scripts/devnet_deploy.sh
```
*Note: Ensure your `solana config` is set to devnet before running.*
