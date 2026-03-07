# CLI integration tests

These tests run the `sss-token` binary against a live RPC (Surfpool or `solana-test-validator`).

## Prerequisites

1. **Start Surfpool** (or `solana-test-validator`):

   ```bash
   surfpool start
   ```

   Default RPC: `http://127.0.0.1:8899` (see `DEFAULT_RPC` in `cli_tests.rs`). Override with env `RPC_URL` if your simnet uses another URL.

2. **Deploy the SSS program** to the simnet (e.g. via your usual runbook or `anchor deploy --provider.cluster localnet`).

## Run the tests

From the repo root or from `cli/`:

```bash
cargo test -p sss-token --test cli_tests
```

With a custom RPC:

```bash
RPC_URL=http://127.0.0.1:8899 cargo test -p sss-token --test cli_tests
```

## Commands covered

| Test | Commands exercised |
|------|---------------------|
| `cli_init_sss1_status_supply_mint_burn` | init (sss-1), status, supply, mint, update-roles, burn |
| `cli_init_sss2_pause_unpause_status` | init (sss-2), status, update-roles (pauser), pause, unpause |
| `cli_init_sss2_minters_list_and_blacklist` | init (sss-2), minters add/list/remove, blacklist add/remove |
| `cli_holders_and_audit_log` | init, mint, holders, holders --min-balance, audit-log --limit, audit-log --action |
| `cli_init_custom_config_toml` | init --custom config.toml, status |
| `cli_freeze_thaw` | init, mint, freeze, thaw |
| `cli_seize` | init (sss-2), update-roles (seizer), mint, seize --to |

Keypairs are created in a temp dir and airdropped via RPC; no extra wallets or env files are required beyond a running simnet and deployed program.
