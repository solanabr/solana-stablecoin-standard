# SSS-2: Compliant Stablecoin Preset

SSS-2 builds on SSS-1 with three additional capabilities that together form a complete on-chain compliance layer: a permanent delegate for token seizure, a transfer hook program that enforces the blacklist on every transfer, and the blacklist itself stored as PDAs on-chain.

SSS-2 is appropriate when:
- Regulatory requirements mandate the ability to block transfers to/from sanctioned addresses
- You need a court-order-style seizure mechanism without relying on account freezes
- On-chain auditability of compliance actions is required

---

## What SSS-2 Adds Over SSS-1

| Capability              | Mechanism                                         | Notes                                     |
|-------------------------|---------------------------------------------------|-------------------------------------------|
| Address blacklist       | `BlacklistEntry` PDA per address                  | On-chain, indexed by mint + wallet        |
| Automatic transfer blocking | Transfer hook program (`2fwDqW…`)            | Called by Token-2022 on every transfer    |
| Token seizure           | `PermanentDelegate` Token-2022 extension          | Seizer can transfer without owner consent |
| Blacklister role        | `roles_config.blacklister`                        | Separated from mint/burn authority        |
| Seizer role             | `roles_config.seizer`                             | Separated from blacklister authority      |

---

## Token-2022 Extensions

SSS-2 mints include all SSS-1 extensions plus two additional ones:

| Extension              | Purpose                                                                    |
|------------------------|----------------------------------------------------------------------------|
| `MintCloseAuthority`   | Allows closing empty mint to reclaim rent                                  |
| `MetadataPointer`      | On-chain name, symbol, URI metadata                                        |
| `PermanentDelegate`    | A fixed address that can transfer tokens from any holder at any time       |
| `TransferHook`         | Instructs Token-2022 to call the SSS hook program on every token transfer  |

The permanent delegate is set to the `seizer` address at mint creation time. The transfer hook is set to program ID `2fwDqWAneoErwq2dpMDjKibTx8kNJ7RLcEDyX5uzzdN8`.

---

## Compliance Roles

SSS-2 introduces two additional roles beyond SSS-1:

| Role          | Default            | Capabilities                                                    |
|---------------|--------------------|-----------------------------------------------------------------|
| `blacklister` | `master_authority` | Add/remove addresses from the blacklist                         |
| `seizer`      | `master_authority` | Seize tokens from any holder using permanent delegate authority |

These roles can be assigned to separate keypairs to enforce the principle of least privilege. A compliance officer might hold `blacklister` without holding `seizer`, requiring a second approval step before funds are actually moved.

---

## How the Transfer Hook Enforces the Blacklist

Every token transfer on an SSS-2 mint automatically triggers an invocation of the hook program. The process is:

1. A user, wallet, or DEX calls Token-2022's `transfer_checked` instruction
2. Token-2022 reads the mint's `TransferHook` extension to find the hook program ID (`2fwDqW…`)
3. Token-2022 reads the `ExtraAccountMetaList` PDA (seeds: `["extra-account-metas", mint]`) to determine which extra accounts to pass
4. Token-2022 CPIs into the hook's `execute` instruction with the source, destination, mint, and the extra accounts
5. The hook derives two PDAs:
   - Sender blacklist entry: `["blacklist", mint, source_owner_wallet]`
   - Receiver blacklist entry: `["blacklist", mint, dest_owner_wallet]`
6. If either PDA contains data (the account exists), the transfer is rejected with `SenderBlacklisted` or `ReceiverBlacklisted`
7. If both PDAs are empty, the transfer proceeds normally

This check is **unconditional and cannot be bypassed** for SSS-2 tokens — it runs even for raw spl-token-2022 transfers, DEX swaps, and bridge operations. The only way to send or receive tokens while blacklisted is for the blacklister to first remove the address from the blacklist.

---

## Blacklist PDA Structure

Each blacklisted address creates a `BlacklistEntry` account:

```
Seeds: [b"blacklist", mint.key().as_ref(), target_address.as_ref()]
Program: Aaw7RSm8fXXAfvDy9wS1FimFEmnHkzYtDmZCRgZg9pVm (SSS main program)
```

Fields:
- `mint` — the stablecoin mint this entry belongs to
- `address` — the blacklisted wallet (not token account, the wallet)
- `added_at` — Unix timestamp of when the entry was created
- `added_by` — the blacklister's public key
- `reason` — u8 reason code (0 = unspecified; define your own codes)
- `bump` — PDA bump seed

Removing an address from the blacklist **closes** the account and returns the rent (~0.0016 SOL) to the blacklister's wallet.

---

## Initialize an SSS-2 Token

**SDK:**
```typescript
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';

const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

const result = await SolanaStablecoin.create(provider, {
  name: 'Regulated USD',
  symbol: 'RUSD',
  uri: 'https://bank.example.com/rusd-metadata.json',
  decimals: 6,
  maxSupply: new BN('500000000000000'), // 500 million RUSD
  preset: StablecoinPreset.SSS2,
  // Separate roles for operational security
  minter: minterKeypair.publicKey,
  burner: burnerKeypair.publicKey,
  blacklister: complianceKeypair.publicKey,
  pauser: opsKeypair.publicKey,
  seizer: legalKeypair.publicKey,
  minterQuota: new BN('10000000000000'), // 10 million per epoch
});

console.log('Mint:', result.mint.toBase58());
```

**CLI:**
```bash
sss-token init \
  --preset sss-2 \
  --name "Regulated USD" \
  --symbol "RUSD" \
  --uri "https://bank.example.com/rusd-metadata.json" \
  --decimals 6 \
  --max-supply 500000000000000 \
  --minter <minter-address> \
  --minter-quota 10000000000000
```

Note: The CLI does not currently expose `--blacklister`, `--pauser`, and `--seizer` flags; use `sss-token minters add` or the SDK to configure roles after initialization if separate keypairs are required.

---

## Blacklist Operations

### Add an address to the blacklist

Once added, the target address cannot send or receive tokens until removed. The blacklist entry is stored as an on-chain PDA.

**SDK:**
```typescript
const token = SolanaStablecoin.load(provider, mintPublicKey);

// Reason codes are user-defined: 1=OFAC sanctions, 2=fraud, 3=court order, etc.
const sig = await token.compliance.blacklistAdd(badActorWallet, 1);
console.log('Blacklisted:', sig);
```

**CLI:**
```bash
sss-token blacklist add \
  --mint <mint-address> \
  --address <wallet-address> \
  --reason 1
```

### Remove an address from the blacklist

**SDK:**
```typescript
const sig = await token.compliance.blacklistRemove(walletAddress);
console.log('Removed:', sig);
```

**CLI:**
```bash
sss-token blacklist remove \
  --mint <mint-address> \
  --address <wallet-address>
```

### Check if an address is blacklisted

**SDK:**
```typescript
const isBlacklisted = await token.compliance.isBlacklisted(walletAddress);
console.log(isBlacklisted ? 'BLACKLISTED' : 'clear');
```

**CLI:**
```bash
sss-token blacklist check \
  --mint <mint-address> \
  --address <wallet-address>
```

---

## Seize Operation

Seizure moves tokens from a holder's account to a destination account using the `PermanentDelegate` extension. The seizer does **not** need the holder's private key or delegate approval. The holder does not need to sign.

Typical workflow:
1. Compliance officer adds the target to the blacklist (blocks all new transfers)
2. Legal team obtains approval for seizure
3. Seizer keypair calls `seize` to move the funds to a recovery account

**SDK:**
```typescript
const sig = await token.compliance.seize(
  targetTokenAccount,     // source: the holder's ATA
  recoveryTokenAccount,   // destination: your ATA
  new BN(1_500_000_000),  // amount: 1,500 RUSD
);
console.log('Seized:', sig);
```

**CLI:**
```bash
sss-token seize \
  --mint <mint-address> \
  --from <target-token-account> \
  --to <recovery-token-account> \
  --amount 1500000000
```

The `seize` instruction verifies:
- `permanent_delegate_enabled` is `true` (SSS-2 check)
- Caller is `seizer` or `master_authority`
- Amount is greater than zero

It does **not** require the target to be blacklisted at the program level (seize can be used for emergency recovery). Your operational policy should enforce the blacklist check before calling seize.

---

## SSS-2 Feature Flags in StablecoinConfig

After initialization, the `StablecoinConfig` PDA will show:

```
permanent_delegate_enabled: true
transfer_hook_enabled: true
preset: Sss2
```

Attempting to call `add_to_blacklist`, `remove_from_blacklist`, or `seize` on an SSS-1 token (where `permanent_delegate_enabled = false`) returns error `Sss2NotEnabled` (6003).

---

## Complete SSS-2 Compliance Workflow Example

```typescript
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { SolanaStablecoin, StablecoinPreset } from '@stbr/sss-sdk';

const provider = /* ... */;
const sanctionedWallet = new PublicKey('<sanctioned-wallet>');
const sanctionedAta = new PublicKey('<sanctioned-token-account>');
const recoveryAta = new PublicKey('<recovery-token-account>');

const token = SolanaStablecoin.load(provider, mintPublicKey);

// Step 1: Block the wallet immediately
const blacklistSig = await token.compliance.blacklistAdd(sanctionedWallet, 1);
console.log('Address blocked at:', blacklistSig);

// Step 2: Verify the block is in place
const blocked = await token.compliance.isBlacklisted(sanctionedWallet);
console.log('Confirmed blocked:', blocked); // true

// Step 3: Any transfer attempt by the sanctioned wallet now fails
// (Token-2022 will call the hook and reject with SenderBlacklisted)

// Step 4: Seize their tokens after legal approval
const seizeSig = await token.compliance.seize(
  sanctionedAta,
  recoveryAta,
  new BN('5000000000'), // 5,000 RUSD
);
console.log('Seizure complete at:', seizeSig);
```

---

## Verifying Hook Registration

After creating an SSS-2 token, you can confirm the transfer hook is registered by inspecting the mint:

```bash
spl-token --program-id TokenzQdBNbLqP5VEhdkAS6EPGA1WymbbVQnDBtzdeyz \
  display <mint-address>
```

The output should include `Transfer Hook: 2fwDqWAneoErwq2dpMDjKibTx8kNJ7RLcEDyX5uzzdN8`.
