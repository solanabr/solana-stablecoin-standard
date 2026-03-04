# Solana Stablecoin Standard — Deployment Record

## Program IDs

| Program | ID |
|---|---|
| **sss-token** | `GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp` |
| **transfer-hook** | `6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47` |

---

## Devnet Deployment ✓

**Deployed: 2026-03-04**

| Program | Deploy Signature |
|---|---|
| transfer-hook | `521emmYPhGqbzGCf6jnEDaK9kjjcAgJrXkGnxUG1Z8VhiNRwPY5uiwHT1jFBenTeLVXVGYMhAyxsEwcd73rNXLFH` |
| sss-token | `4TyCarDHPT23s5RZ9SLWJgcNd3KzcyiC1nPXjTejQqQ8coXnBjLHaK6j7HWQC755eJSAqNamEvw3X28qZFbnQsbh` |

**Smoke-test transaction:**
- Signature: `2QyLhxRP2Dj7ZYRC8SMksz3BCRWN3VcstVBNXyArBcMudNGChXDFpWDbmVL73gdw8QAzmugT6zXNv5To9LC8nvir`
- Explorer: https://explorer.solana.com/tx/2QyLhxRP2Dj7ZYRC8SMksz3BCRWN3VcstVBNXyArBcMudNGChXDFpWDbmVL73gdw8QAzmugT6zXNv5To9LC8nvir?cluster=devnet

**Devnet Explorer:**
- SSS-Token: https://explorer.solana.com/address/GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp?cluster=devnet
- Transfer-Hook: https://explorer.solana.com/address/6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47?cluster=devnet

**Program verification (`solana program show`):**

```
Program Id: GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: 8PrnbipnsxD7evdFWRahA3Es8SgknQRVPBqyNa1EJFSC
Authority: CTM8QpYFQxiHV2PeiXBF5YbVnCxMv7VaNYPaXJgmr5Vu
Last Deployed In Slot: 446139253
Data Length: 521328 (0x7f470) bytes
Balance: 3.62964696 SOL

Program Id: 6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: D2hbCyyr9rVZjXfmmTH23Bd737P5xEjdUyg4NYj5Z9xq
Authority: CTM8QpYFQxiHV2PeiXBF5YbVnCxMv7VaNYPaXJgmr5Vu
Last Deployed In Slot: 446139187
Data Length: 253632 (0x3dec0) bytes
Balance: 1.7664828 SOL
```

---

## Smoke Test Output (Devnet)

```
=== Solana Stablecoin Standard — Devnet Smoke Test ===
Wallet:                 CTM8QpYFQxiHV2PeiXBF5YbVnCxMv7VaNYPaXJgmr5Vu
Balance:                4.88760372 SOL
RPC:                    https://api.devnet.solana.com
SSS-Token Program ID:   GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp
Transfer-Hook Program ID: 6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47

SSS-Token program:     DEPLOYED ✓  (executable: true )
Transfer-Hook program: DEPLOYED ✓  (executable: true )
Owner (both):          BPFLoaderUpgradeab1e11111111111111111111111

=== Smoke Test Transaction ===
Signature: 2QyLhxRP2Dj7ZYRC8SMksz3BCRWN3VcstVBNXyArBcMudNGChXDFpWDbmVL73gdw8QAzmugT6zXNv5To9LC8nvir
Explorer TX:  https://explorer.solana.com/tx/2QyLhxRP2Dj7ZYRC8SMksz3BCRWN3VcstVBNXyArBcMudNGChXDFpWDbmVL73gdw8QAzmugT6zXNv5To9LC8nvir?cluster=devnet
Explorer SSS: https://explorer.solana.com/address/GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp?cluster=devnet
Explorer Hook: https://explorer.solana.com/address/6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47?cluster=devnet

=== Smoke test PASSED ===
```

---

## Build Artifacts

Both `.so` binaries exist in `target/deploy/`:

| File | Size |
|---|---|
| `target/deploy/sss_token.so` | 521,328 bytes |
| `target/deploy/transfer_hook.so` | 253,632 bytes |

---

## Anchor.toml Configuration

```toml
[programs.devnet]
sss_token = "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp"
transfer_hook = "6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47"

[programs.localnet]
sss_token = "GgcHf4khPVY28yVkQGDgBjaNLgsjNWGaNdfmL36wgPGp"
transfer_hook = "6XUKT63WZFKU8Lvgydv9XeczoigNhag1JtvqkmV7nf47"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"
```

---

## Reproducing Devnet Deployment

```bash
# Set config to devnet
solana config set --url https://api.devnet.solana.com

# Ensure wallet has >= 6 SOL
solana airdrop 6   # or use faucet.solana.com

# Deploy
anchor deploy --provider.cluster devnet

# Run smoke test
npx ts-node scripts/devnet/smoke-test.ts
```
