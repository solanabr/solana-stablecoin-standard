# SSS Frontend

Example issuer console for the Solana Stablecoin Standard.

## Run

```bash
pnpm install
pnpm --filter @stbr/sss-frontend dev
```

## Notes

- Connect a browser wallet for identity and explorer UX.
- Browser wallet execution is supported for deployment and admin actions.
- Import an operator keypair JSON if you want a fallback signer for scripted/admin sessions.
- Load `sss.lock.json` to attach to an existing deployment.
- Default cluster is devnet.

## Current integration model

- Wallet adapter is used for wallet connection and transaction signing.
- The frontend can also fall back to an imported operator `Keypair`.
- The UI reads and writes on-chain metadata through the SSS config PDA plus metadata pointer flow.
- Holder and audit-log reads are fetched directly via RPC.
