# Solana Stablecoin Standard — Deployment Guide

This guide covers deploying the Solana Stablecoin Standard (SSS) programs to **Devnet** and **Mainnet**.

## Prerequisites

- **Anchor CLI**: `cargo install --git https://github.com/coral-xyz/anchor anchor-cli`
- **Solana CLI**: [Install Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- **Rust**: `rustup` with a recent stable toolchain
- **Node.js** 18+ and Yarn (for SDK and examples)

## Quick Deploy (Devnet)

Use the provided script to deploy to devnet:

```bash
# From repo root
chmod +x scripts/deploy-devnet.sh
./scripts/deploy-devnet.sh
```

The script will:

1. Set Solana config to devnet  
2. Build the Anchor programs  
3. Deploy `sss_token` and `sss_transfer_hook`  
4. Print program IDs  
5. Show how to run the smoke test  

### Manual Devnet Deploy

```bash
# 1. Point to devnet
solana config set --url https://api.devnet.solana.com

# 2. Ensure wallet has SOL
solana balance
solana airdrop 2   # if needed

# 3. Build
anchor build

# 4. Deploy
anchor deploy --provider.cluster devnet
```

### Program IDs

| Program             | Devnet / Mainnet ID                           |
|---------------------|-----------------------------------------------|
| `sss_token`         | `SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz` |
| `sss_transfer_hook` | `SSSHookXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz` |

These IDs are fixed (deployed via `anchor keys sync` or manually). To use new program IDs, update `Anchor.toml` and redeploy.

---

## Mainnet Deployment

### Before Mainnet

- [ ] Complete security review and audits  
- [ ] Confirm program IDs and keys in `Anchor.toml`  
- [ ] Prepare upgrade authority and multi-sig setup  
- [ ] Test full lifecycle on devnet  

### Mainnet Steps

1. **Configure Solana for mainnet**  
   ```bash
   solana config set --url https://api.mainnet-beta.solana.com
   solana config get
   ```

2. **Verify wallet and balance**  
   ```bash
   solana address
   solana balance
   ```

3. **Build with mainnet program IDs**  
   - Ensure `[programs.mainnet]` (or equivalent) in `Anchor.toml` has the correct IDs.  
   - If not, add:
     ```toml
     [programs.mainnet]
     sss_token = "SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz"
     sss_transfer_hook = "SSSHookXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz"
     ```

4. **Build**  
   ```bash
   anchor build
   ```

5. **Deploy**  
   ```bash
   anchor deploy --provider.cluster mainnet
   ```

6. **Verify deployment**  
   ```bash
   solana program show SSSToknXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz
   solana program show SSSHookXhFBpMVB1YcqhjQk1iWKA1dqHkST6hamGqmz
   ```

---

## Localnet (Development)

For local development:

```bash
# Start validator (in one terminal)
solana-test-validator

# In another terminal
solana config set --url http://localhost:8899
anchor build
anchor deploy --provider.cluster localnet

# Or use anchor test (starts validator, deploys, runs tests)
anchor test
```

---

## Smoke Test

After deploying to devnet:

```bash
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json

# Ensure programs are deployed and IDL is available
npx ts-node -p tsconfig.json examples/sss-1-lifecycle.ts
```

This runs the SSS-1 lifecycle: init → setup minter → mint → transfer → freeze → thaw → burn.

---

## Troubleshooting

### "Insufficient funds"

- Devnet: `solana airdrop 2`  
- Mainnet: fund the deployer wallet  

### "Program already deployed"

- Program IDs are fixed; deployments are idempotent.  
- To upgrade: `anchor upgrade <program.so> <program_id> --provider.cluster devnet`  

### Build failures

- Run `anchor build` from repo root  
- Ensure all program dependencies resolve (e.g. `sss_oracle` if present in `Anchor.toml` and referenced)  

### IDL / workspace not found

- Run `anchor build` to generate IDL under `target/idl/`  
- Examples use `anchor.workspace.SssToken`; run via `anchor test` or ensure provider/env is configured for `anchor run`  

---

## Related Documentation

- [SSS-1: Minimal Stablecoin](./SSS-1.md)  
- [SSS-2: Compliant Stablecoin](./SSS-2.md)  
- [Architecture](./ARCHITECTURE.md)  
- [Examples](../examples/README.md)
