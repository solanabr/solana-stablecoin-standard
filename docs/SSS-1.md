# SSS-1: Minimal Stablecoin Preset

SSS-1 is the baseline preset for issuing a stablecoin on Solana. It provides the minimum viable feature set for a CBDC or regulated fiat-backed token: controlled minting and burning with optional quotas, individual account freeze/thaw, a global pause circuit breaker, and on-chain metadata. It deliberately omits the permanent delegate and transfer hook extensions to keep transaction costs and complexity low.

SSS-1 is appropriate when:
- You need a straightforward fiat-backed stablecoin with operational controls
- Your compliance requirements do not mandate automatic on-chain transfer blocking
- You want the lowest possible transaction overhead per transfer (no hook program call)

---

## Token-2022 Extensions

SSS-1 mints include exactly two Token-2022 extensions:

| Extension            | Purpose                                                         |
|----------------------|-----------------------------------------------------------------|
| `MintCloseAuthority` | Allows the authority to reclaim rent by closing an empty mint   |
| `MetadataPointer`    | Attaches an on-chain metadata account (name, symbol, URI)       |

The mint also has:
- **Mint authority**: set to the deploying wallet, controls token issuance
- **Freeze authority**: set to the deploying wallet, controls account freezing

---

## Roles

SSS-1 uses four roles, all stored in the `RolesConfig` PDA:

| Role               | Default              | Capabilities                                      |
|--------------------|----------------------|---------------------------------------------------|
| `master_authority` | Initializing wallet  | All operations, role management, authority transfer|
| `minter`           | `master_authority`   | Call `mint_tokens` (subject to quota)             |
| `burner`           | `master_authority`   | Call `burn_tokens`                                |
| `pauser`           | `master_authority`   | Call `pause`, `unpause`, `freeze_account`, `thaw_account` |

All four roles can be different wallets, or they can all be the same wallet for simpler deployments. The `blacklister` and `seizer` fields in `RolesConfig` are set to `Pubkey::default()` for SSS-1 tokens.

---

## Minter Quota System

Each SSS-1 (and SSS-2) token supports a per-minter quota to limit how many tokens can be minted in a given epoch without master authority intervention:

- `minter_quota`: maximum base units mintable (0 = unlimited)
- `minted_this_epoch`: running total since last quota reset
- When a mint operation would exceed the quota, it fails with `MinterQuotaExceeded`
- Calling `update_roles` with `new_minter_quota` resets `minted_this_epoch` to zero
- The master authority is **not subject** to the quota

Example: setting `minter_quota = 1_000_000_000_000` with 6 decimals limits the minter to 1,000,000 USDX per epoch.

---

## Initialize Parameters

| Parameter      | Type         | Required | Default         | Notes                              |
|----------------|--------------|----------|-----------------|------------------------------------|
| `name`         | string       | Yes      | —               | Max 32 characters                  |
| `symbol`       | string       | Yes      | —               | Max 10 characters                  |
| `uri`          | string       | Yes      | —               | Metadata URI, max 200 characters   |
| `decimals`     | u8           | No       | 6               | 0–9; 6 matches USDC                |
| `max_supply`   | u64          | No       | 0 (unlimited)   | Base units                         |
| `preset`       | u8           | Yes      | —               | 0 for SSS-1                        |
| `minter`       | Option<Pubkey> | No     | `authority`     | Dedicated minting keypair          |
| `minter_quota` | u64          | No       | 0 (unlimited)   | Base units per epoch               |
| `burner`       | Option<Pubkey> | No     | `authority`     | Dedicated burning keypair          |
| `pauser`       | Option<Pubkey> | No     | `authority`     | Dedicated pause/freeze keypair     |

---

## Operations

### Initialize a new SSS-1 token

**SDK:**
```typescript
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';
import BN from 'bn.js';

const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

const result = await SolanaStablecoin.create(provider, {
  name: 'ACME USD',
  symbol: 'AUSD',
  uri: 'https://acme.finance/token.json',
  decimals: 6,
  maxSupply: new BN(1_000_000_000_000_000), // 1 billion AUSD
  preset: StablecoinPreset.SSS1,
  // Optional: separate minter keypair
  minter: minterPublicKey,
  minterQuota: new BN(10_000_000_000_000), // 10 million per epoch
});

console.log('Mint:', result.mint.toBase58());
console.log('Config PDA:', result.stablecoinConfig.toBase58());
console.log('Roles PDA:', result.rolesConfig.toBase58());
console.log('Tx:', result.signature);
```

**CLI:**
```bash
sss-token init \
  --preset sss-1 \
  --name "ACME USD" \
  --symbol "AUSD" \
  --uri "https://acme.finance/token.json" \
  --decimals 6 \
  --max-supply 1000000000000000 \
  --minter 7xKXtG7MNYkZ9jMRVsRqpTNjJjEbGCnLGbEkqNfVWdGx \
  --minter-quota 10000000000000
```

---

### Mint tokens

Tokens are minted to an **existing** associated token account. The caller must be the `minter` or `master_authority`.

**SDK:**
```typescript
const token = SolanaStablecoin.load(provider, mintPublicKey);

// Mint 1,000 AUSD (with 6 decimals)
const sig = await token.mint(recipientAta, new BN(1_000_000_000));
console.log('Minted:', sig);
```

**CLI:**
```bash
sss-token mint \
  --mint Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm \
  --to <recipient-token-account> \
  --amount 1000000000
```

Amount is always in base units. For 6 decimals: 1 AUSD = 1,000,000 base units.

---

### Burn tokens

Burns tokens from a source token account. The caller must be the `burner` or `master_authority`. The wallet signing the transaction must also own the source token account (or hold delegate authority over it).

**SDK:**
```typescript
const sig = await token.burn(sourceAta, new BN(500_000_000));
console.log('Burned:', sig);
```

**CLI:**
```bash
sss-token burn \
  --mint <mint-address> \
  --from <source-token-account> \
  --amount 500000000
```

---

### Freeze a token account

Freezing prevents the account holder from sending or receiving tokens. The frozen account remains visible on-chain with its balance intact. The caller must be `master_authority` or `pauser`.

**SDK:**
```typescript
const sig = await token.freeze(targetTokenAccount);
console.log('Frozen:', sig);
```

**CLI:**
```bash
sss-token freeze \
  --mint <mint-address> \
  --account <token-account-address>
```

---

### Thaw (unfreeze) a token account

Restores normal operation for a previously frozen account. The caller must be `master_authority` or `pauser`.

**SDK:**
```typescript
const sig = await token.thaw(targetTokenAccount);
console.log('Thawed:', sig);
```

**CLI:**
```bash
sss-token thaw \
  --mint <mint-address> \
  --account <token-account-address>
```

---

### Pause all transfers

Sets the global `paused` flag on the `StablecoinConfig` PDA. While paused, `mint_tokens` and `burn_tokens` instructions return `TransfersPaused`. The caller must be `master_authority` or `pauser`.

Note: The pause flag is enforced at the SSS program level. For SSS-1 (no transfer hook), peer-to-peer transfers via the raw Token-2022 program are **not** blocked — pause is an application-layer control. For full transfer blocking, use SSS-2 with the transfer hook.

**SDK:**
```typescript
const sig = await token.pause();
console.log('Paused:', sig);
```

**CLI:**
```bash
sss-token pause --mint <mint-address>
```

---

### Unpause

Clears the global pause flag. The caller must be `master_authority` or `pauser`.

**SDK:**
```typescript
const sig = await token.unpause();
console.log('Unpaused:', sig);
```

**CLI:**
```bash
sss-token unpause --mint <mint-address>
```

---

### Read token status

**SDK:**
```typescript
const config = await token.getConfig();
const roles = await token.getRoles();
const supply = await token.getTotalSupply();

console.log('Preset:', config.preset);
console.log('Paused:', config.paused);
console.log('Max supply:', config.maxSupply.toString());
console.log('Total supply:', supply.toString());
console.log('Master authority:', roles.masterAuthority.toBase58());
console.log('Minter:', roles.minter.toBase58());
console.log('Minter quota:', roles.minterQuota.toString());
```

**CLI:**
```bash
sss-token status --mint <mint-address>
sss-token supply --mint <mint-address>
sss-token minters list --mint <mint-address>
```

---

### Update roles

Only `master_authority` can update roles. All fields are optional; only the provided fields change.

**SDK:**
```typescript
// Change the minter and reset quota to 5 million per epoch
const sig = await token.updateRoles({
  newMinter: newMinterPublicKey,
  newMinterQuota: new BN(5_000_000_000_000),
});
```

**CLI:**
```bash
sss-token minters add \
  --mint <mint-address> \
  --minter <new-minter-address> \
  --quota 5000000000000
```

---

### Transfer master authority

This is a one-step, irreversible operation. Ensure the new authority address is correct before calling.

**SDK:**
```typescript
const sig = await token.transferAuthority(newAuthorityPublicKey);
console.log('Authority transferred:', sig);
```

---

## Complete SSS-1 Setup Example

```typescript
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// 1. Set up provider with your authority keypair
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const authorityKeypair = Keypair.fromSecretKey(/* your key bytes */);
const provider = new AnchorProvider(connection, new Wallet(authorityKeypair), {
  commitment: 'confirmed',
});

// 2. Create the stablecoin
const result = await SolanaStablecoin.create(provider, {
  name: 'ACME USD',
  symbol: 'AUSD',
  uri: 'https://acme.finance/token.json',
  decimals: 6,
  maxSupply: new BN('1000000000000000'), // 1 billion AUSD
  preset: StablecoinPreset.SSS1,
});

const token = SolanaStablecoin.load(provider, result.mint);

// 3. Get or create an ATA for the recipient
const recipientWallet = new PublicKey('<recipient-wallet>');
const recipientAta = await token.getOrCreateAta(recipientWallet);

// 4. Mint the initial supply
const mintSig = await token.mint(recipientAta, new BN('100000000000000')); // 100 million AUSD
console.log('Initial mint tx:', mintSig);

// 5. Verify supply
const supply = await token.getTotalSupply();
console.log('Supply:', supply.toString()); // "100000000000000"
```
