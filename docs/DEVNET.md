# Devnet Deployment Proof

## Program IDs

| Program | Program ID |
|---------|-----------|
| **sss_token** | `4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF` |
| **sss_transfer_hook** | `GCKas56DYv14WBEmbX6McYrKhpQijAkQ1Xa39mGEhdp4` |

## Deploy Transactions

- **sss_token**: [`2jCE58bpzRWzeBiCkUtURot9ba1jMPX7m4Jmj31vu4LihaZqSLmasKuU2zdijag5xAWGFu2MRN2kz9PcJc6c1AF9`](https://explorer.solana.com/tx/2jCE58bpzRWzeBiCkUtURot9ba1jMPX7m4Jmj31vu4LihaZqSLmasKuU2zdijag5xAWGFu2MRN2kz9PcJc6c1AF9?cluster=devnet)
- **sss_transfer_hook**: [`5e6EwFFSwUetvKJdXPmZi6fT6vvKgEchsfjUPtzCzauyfCTRn3D2GQwcVgJuqbdquNtJTNP5x8sb3y4JLj5nb8Qp`](https://explorer.solana.com/tx/5e6EwFFSwUetvKJdXPmZi6fT6vvKgEchsfjUPtzCzauyfCTRn3D2GQwcVgJuqbdquNtJTNP5x8sb3y4JLj5nb8Qp?cluster=devnet)

## Upgrade Authority

`3wN9p2YkesPLSNK9SAHBNaYYtHHFcD23Bj4Ar6WCXPMc`

## Verify on Solana Explorer

- [sss_token on Explorer](https://explorer.solana.com/address/4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF?cluster=devnet)
- [sss_transfer_hook on Explorer](https://explorer.solana.com/address/GCKas56DYv14WBEmbX6McYrKhpQijAkQ1Xa39mGEhdp4?cluster=devnet)

## Reproduce

```bash
# Clone the repo
git clone https://github.com/solanabr/solana-stablecoin-standard.git
cd solana-stablecoin-standard

# Install dependencies
yarn install

# Build programs
anchor build

# Set devnet
solana config set --url devnet

# Deploy
anchor deploy --provider.cluster devnet
```
