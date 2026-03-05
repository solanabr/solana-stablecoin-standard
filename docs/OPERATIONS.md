# Operations Runbook

## Core Flows

- Mint: ensure minter quota, execute mint, monitor event stream
- Burn: verify burner role, execute burn, reconcile supply
- Emergency pause: pauser signs pause, stop automated mint/burn jobs

## Compliance Flows

- Blacklist add/remove through authorized blacklister key
- Freeze before seize; seizure transfers frozen funds to treasury account

## Monitoring

- Program logs for state-changing instructions
- Supply checks against indexer snapshots
- Role registry integrity checks before each admin action
