# S³-3: Private Preset

## Overview

S³-3 enables confidential transfers using Token-2022's ConfidentialTransferMint extension with ElGamal encryption. Transfer amounts are encrypted while the token retains all other stablecoin features.

## Extensions Enabled

- **MetadataPointer**: On-chain metadata
- **PermanentDelegate**: Seizure capability
- **ConfidentialTransferMint**: Encrypted transfer amounts

## Important Limitation

**TransferHook and ConfidentialTransferMint are incompatible** in Token-2022. S³-3 cannot use transfer hooks. Compliance checks must be handled through other means (account freezing, permanent delegate, off-chain monitoring).

## Features

- All S³-1 features (mint, burn, pause, freeze, roles)
- Permanent delegate for seizure
- Confidential transfers with encrypted amounts
- Auditor ElGamal public key for regulatory compliance
- Manual KYC gate for confidential account approval

## Confidential Transfer Flow

1. Mint creates ConfidentialTransferMint extension with auditor pubkey
2. Users create token accounts and request confidential transfer approval
3. Owner/authority approves accounts via `approve_confidential_account`
4. Users can then perform confidential transfers with encrypted amounts

## Initialization

```typescript
const params = {
  preset: { sss3: {} },
  name: "PrivateUSD",
  symbol: "PUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  masterMinter: masterMinterPubkey,
  pauser: pauserPubkey,
  auditorElgamalPubkey: auditorPubkeyBytes, // 32-byte ElGamal public key
};
```

## CLI

```bash
sss-token init --preset sss-3 --name "PrivateUSD" --symbol "PUSD" --decimals 6 \
  --auditor-elgamal <hex-encoded-pubkey>
```
