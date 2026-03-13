# Devnet Deployment Guide

Step-by-step guide to deploying the Solana Stablecoin Standard on devnet.

## Prerequisites

```bash
# Solana CLI configured
solana --version              # >= 2.1.0
anchor --version              # >= 0.31.1

# Devnet keypair with SOL
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json  # if needed
solana airdrop 5                                       # fund deployer
```

## 1. Build Programs

```bash
anchor build
```

This produces:
- `target/deploy/sss_token.so`
- `target/deploy/transfer_hook.so`
- `target/deploy/oracle_module.so`

## 2. Get Program IDs

```bash
solana-keygen pubkey target/deploy/sss_token-keypair.json
solana-keygen pubkey target/deploy/transfer_hook-keypair.json
solana-keygen pubkey target/deploy/oracle_module-keypair.json
```

Update `Anchor.toml` `[programs.devnet]` and `declare_id!()` in each program's `lib.rs` if IDs change.

## 3. Deploy to Devnet

```bash
# Switch to devnet
solana config set --url devnet

# Deploy all programs
anchor deploy --provider.cluster devnet

# Or deploy individually
solana program deploy target/deploy/sss_token.so
solana program deploy target/deploy/transfer_hook.so
solana program deploy target/deploy/oracle_module.so
```

## 4. Verify Deployment

```bash
# Check programs exist
solana program show <SSS_TOKEN_PROGRAM_ID>
solana program show <TRANSFER_HOOK_PROGRAM_ID>
solana program show <ORACLE_PROGRAM_ID>
```

## 5. Initialize a Stablecoin

### Using the CLI

```bash
# SSS-1 Minimal
sss-token init --preset sss-1 \
  --name "Test USD" \
  --symbol "tUSD" \
  --decimals 6 \
  --url devnet

# SSS-2 Compliant (with roles)
sss-token init --preset sss-2 \
  --name "Test BRL" \
  --symbol "tBRL" \
  --decimals 6 \
  --url devnet
```

### Using the SDK

```typescript
import { SolanaStablecoin } from "@stbr/sss-token";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("devnet"));
const stable = await SolanaStablecoin.create(connection, wallet, {
  preset: "SSS_2",
  name: "Devnet BRL",
  symbol: "dBRL",
  decimals: 6,
  supplyCap: BigInt(1_000_000_000_000), // 1M tokens
});
```

## 6. Run Tests on Devnet

```bash
# Set cluster
anchor test --provider.cluster devnet --skip-local-validator
```

## Program IDs

| Program | Localnet | Devnet |
|---------|----------|--------|
| `sss_token` | `AcmGr2zw5RqMjuT1BN68Gk8gBhaFeF4piUXTyRQrVw3t` | Same (or regenerate) |
| `transfer_hook` | `8nWGGHT4kkuvtY8NqXeYEdiyC79qQ2taS82UGwmfdKgu` | Same (or regenerate) |
| `oracle_module` | `27eVzSd6UBsLAzzXaSfMbUM5dgZLv4H8fiQTVqXkESFb` | Same (or regenerate) |

## Estimated Costs

| Operation | SOL Cost |
|-----------|----------|
| Deploy `sss_token` | ~2.5 SOL (rent) |
| Deploy `transfer_hook` | ~0.5 SOL |
| Deploy `oracle_module` | ~0.5 SOL |
| Initialize SSS-1 | ~0.008 SOL |
| Initialize SSS-2 | ~0.015 SOL |
| Mint operation | ~0.0001 SOL |

## SSS-3 Note

> **⚠️** Confidential transfers require the ZK ElGamal proof program, which is
> currently disabled on devnet (security audit). SSS-3 can be initialized on
> devnet, but CT operations (deposit, transfer, withdraw) will fail.
> Use localnet for full CT testing: `bash scripts/test-ct-e2e.sh`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Program not found` | Verify program ID matches `Anchor.toml` |
| `Insufficient funds` | `solana airdrop 5 --url devnet` |
| `Transaction too large` | SSS-2 init may need 2 transactions — SDK handles this |
| `Custom program error` | Check error code in `SssError` enum (see `errors.rs`) |
