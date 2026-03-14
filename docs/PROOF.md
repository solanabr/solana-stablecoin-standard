# Submission Proof

Evidence snapshot for bounty submission.

Date of verification: **2026-03-14**

---

## 1) Program Deployment Proof (Devnet)

### Program IDs

- `sss-token`: `6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL`
- `transfer-hook`: `C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V`

### RPC used for verification

- Helius devnet endpoint format:

```bash
https://devnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>
```

### Verification commands

```bash
RPC="https://devnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>"

curl -s "$RPC" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL",{"encoding":"base64"}]}'

curl -s "$RPC" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V",{"encoding":"base64"}]}'
```

Both returned `"executable": true`.

### Recent finalized transaction proofs

#### `sss-token`

- [3UAhFJpHqt9TqC7vTwanMgjoSM7LQFJuKDF4V6fhr5jn6CR6XZPV15iC1pitLdyvFEwTovW5hDEoxq4R9MHTAU1r](https://explorer.solana.com/tx/3UAhFJpHqt9TqC7vTwanMgjoSM7LQFJuKDF4V6fhr5jn6CR6XZPV15iC1pitLdyvFEwTovW5hDEoxq4R9MHTAU1r?cluster=devnet)
- [53QaC2pngXjpKRDxzV4Xdatrn5B2Pnphh94znZE6WqPmh9wbaKvXBLzivBo2ceY7qFwthHuEtBT9bNyLdfRPKjBj](https://explorer.solana.com/tx/53QaC2pngXjpKRDxzV4Xdatrn5B2Pnphh94znZE6WqPmh9wbaKvXBLzivBo2ceY7qFwthHuEtBT9bNyLdfRPKjBj?cluster=devnet)
- [5TyuyK7hBBJLj116K63JCMVwac26DLanDJdUrGdZcLARmtxuv31HNPNxQD72W2ejEwXWR9u6VseN2Ee1pJasS3ZT](https://explorer.solana.com/tx/5TyuyK7hBBJLj116K63JCMVwac26DLanDJdUrGdZcLARmtxuv31HNPNxQD72W2ejEwXWR9u6VseN2Ee1pJasS3ZT?cluster=devnet)

#### `transfer-hook`

- [5ondWcbZ9CW5FUCRkeBUG55PhLfNE8y96HAbJsMMwWBeFUoHNEwZWWv7ytHZrscevawHmGvzxdvGdsYZHnEmEjTM](https://explorer.solana.com/tx/5ondWcbZ9CW5FUCRkeBUG55PhLfNE8y96HAbJsMMwWBeFUoHNEwZWWv7ytHZrscevawHmGvzxdvGdsYZHnEmEjTM?cluster=devnet)
- [2WDmP8BnWLmkRxNKuZmZpQ877WxrzdiEehhNEDTQXDgXcnrDJYy4vRH36Xw2f5uzhQirkJG3NJsWPtZgYNVB3CwP](https://explorer.solana.com/tx/2WDmP8BnWLmkRxNKuZmZpQ877WxrzdiEehhNEDTQXDgXcnrDJYy4vRH36Xw2f5uzhQirkJG3NJsWPtZgYNVB3CwP?cluster=devnet)
- [hbKQSiqABmMTqJw3VUxN1Ye9L38WPtLLy4d6fxq5GWm3XSS8SAc95dXrDtdSkvhPqEuqCkyTkPhmYKtKwLqcbsD](https://explorer.solana.com/tx/hbKQSiqABmMTqJw3VUxN1Ye9L38WPtLLy4d6fxq5GWm3XSS8SAc95dXrDtdSkvhPqEuqCkyTkPhmYKtKwLqcbsD?cluster=devnet)

---

## 2) Test Proof

### Unit tests

Command:

```bash
npm run test:unit
```

Result observed: **22 passing**.

### Integration tests

Command:

```bash
npm run test:integration
```

Observed status in one verification run: interrupted (`exit 130`) during devnet deploy phase after successful compilation/build stage. Re-run to collect a fully completed integration log artifact for PR attachment.

### Fuzz tests (Trident)

See dedicated fuzz evidence in [trident-tests/SUBMISSION_NOTES.md](../trident-tests/SUBMISSION_NOTES.md), including successful `10000/10000` completion.

---

## 3) Package Proof

- `solana-stablecoin-sdk` latest observed on npm: `0.1.1` (`0.1.2` prepared locally for republish)
- `solana-stablecoin-cli` latest observed on npm: `0.1.3` (`0.1.4` prepared locally for republish)
- `solana-stablecoin-tui` observed as not yet published (`E404`); local release prepared as `0.1.1`

Publish details and commands are in [PUBLISHING.md](./PUBLISHING.md).
