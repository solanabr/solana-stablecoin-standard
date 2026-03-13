# Deployment

## Prerequisites

- Solana CLI installed (must include `solana-test-validator` for local integration tests)
- Anchor CLI 0.31+
- Funded deployer keypair

## Devnet Deployment

```bash
solana config set --url devnet
anchor build
anchor deploy --provider.cluster devnet
solana program show J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np
```

## Mainnet Deployment

```bash
anchor build --verifiable
anchor deploy --provider.cluster mainnet
anchor verify <program-id>
```

## Program IDs

| Program | Devnet |
|---------|--------|
| sss-1 | `J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np` |

## Backend Services

```bash
docker compose up -d
```

- Mint/Burn API: `http://localhost:3001`
- Indexer: `http://localhost:3002`
- Compliance: `http://localhost:3003`
