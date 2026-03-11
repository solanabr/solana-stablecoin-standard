# Deployment Guide

## Program IDs

| Program | ID |
|---------|-----|
| Stablecoin | `SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA` |
| Transfer Hook | `Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu` |

## Build

```bash
anchor build
```

## Deploy to Devnet

```bash
solana config set --url devnet
solana airdrop 5
anchor deploy --provider.cluster devnet
```

## Deploy to Mainnet

```bash
solana config set --url mainnet-beta
anchor deploy --provider.cluster mainnet
```

## Verification

After deployment, verify the programs:

```bash
solana program show SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA
solana program show Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu
```

## Post-Deployment Steps

1. Initialize your stablecoin with desired preset
2. For S³-2: Initialize the ExtraAccountMetaList
3. Add minters with appropriate allowances
4. Test with small amounts before production use

## Devnet Proof

**Programs deployed successfully to Devnet:**

### Program Deployments

| Program | Program ID | Deploy Signature |
|---------|-----------|-----------------|
| Transfer Hook | `Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu` | `5PpTjTggXtzDZoKjs2opgCR9mZVHJnUzkmKK7qguSaEdce68CRt98xUX8RDxTkiLYLzCW58nJ4CwbdspHcGx6VHW` |
| Stablecoin | `SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA` | `64xCpQRBJRr53MPNaDdDrhMnFsn6bLzqpCJ97MVZMkVmmdsToFwWxpMLup5J91cnRtrftRW3kHxRaYuCtKmQiTTi` |

### Example Transactions (S³ Dollar on Devnet)

**Mint:** `FYmzy2qEp2FcnhnoY99P3btFAB9rCvD1rZSFy4tfDbxt` (S³ Dollar / S3D)

| Action | Transaction Signature |
|--------|----------------------|
| Initialize S³-1 | `3bhVEABrdM8iqbnNACCFcQsYH7QMYUXaCoBxMmyTkJKm5AiB6B8343ZBStRCuNd56fiEFkV6swGwg77fBueNCkSe` |
| Create Token Account | `5K5rHxCXxnJ9NwdVjD5oue88mHxk1vEEqCLMXjP49bKL54xrMWQ8qxrQ86yfaLpB2kidkLLfcPXi7SNp6eiQNg7W` |
| Add Minter | `cj2MG4TpcwgjrmD165HGDKLzTvWtJUvWgLFEJkQnwCSrifYpcKAyjYc5SVDhCbi4rUt5RE79XoDPCYWbHxCrh43` |
| Mint 1,000,000 tokens | `3rRDa6wB7EzP4qNujUpdqMDgNQpq99LUCgaGg7FYufffQ49RdjqY5dFqADL6ATVtbDKbztfgtyG3HhXRvHyZVnDM` |

### Explorer Links

- Stablecoin Program: https://explorer.solana.com/address/SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA?cluster=devnet
- Transfer Hook Program: https://explorer.solana.com/address/Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu?cluster=devnet
- S³ Dollar Mint: https://explorer.solana.com/address/FYmzy2qEp2FcnhnoY99P3btFAB9rCvD1rZSFy4tfDbxt?cluster=devnet
