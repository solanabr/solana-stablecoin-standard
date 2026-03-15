# Reserve Attestation

Creates a fresh devnet mint, hashes a reserve report payload, submits an on-chain reserve attestation, and fetches the stored attestation back from the SSS config PDA.

## Prerequisites

- A devnet-funded keypair at `KEYPAIR_PATH` or `~/.config/solana/id.json`
- Node.js 18+

```bash
cd examples/reserve-attestation
npm install
RPC_URL=https://api.devnet.solana.com npm run start
```

The example uses `OracleModule.computeReserveHash(...)` so the submitted digest matches the off-chain reserve payload printed by the script.
