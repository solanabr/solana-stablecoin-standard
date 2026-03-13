# Deploying SSS to Devnet

Solana Stablecoin Standard (SSS) deployment runbook for devnet. For architecture and spec see [ARCH.md](ARCH.md) and [SPEC.md](SPEC.md).

---

## Prerequisites

| Tool       | Version   |
| ---------- | --------- |
| Rust       | 1.75+     |
| Solana CLI | 1.18+     |
| Anchor CLI | 0.31+     |
| Node.js    | 18+       |
| pnpm       | any       |

Verify:

```bash
rustc --version
solana --version
anchor --version
node --version
```

---

## 1. Clone and setup

```bash
git clone <this-repo>
cd solana-stablecoin-standard
pnpm install
```

---

## 2. Keypairs

Create a `wallets/` directory at the repo root (gitignored).

**Authority/payer** — deployer and initial stablecoin authority. Use existing Solana CLI default or create one:

```bash
mkdir -p wallets
solana-keygen new --outfile wallets/authority.json
```

**Program keypair(s)** — one per program if you want custom program IDs. The upgrade script reads `wallets/program-keypair.json`.

```bash
# For sss-1 (main token program)
solana-keygen new --outfile wallets/program-keypair.json

# Optional: separate keypair for sss-2 (transfer hook); copy to program-keypair.json when updating sss-2
```

---

## 3. Update program ID (when using a new keypair)

Run **before** the first build after changing the program keypair. From repo root:

```bash
chmod +x scripts/upgrade-program-id.sh
./scripts/upgrade-program-id.sh sss-1    # update programs/sss-1 and Anchor.toml
# Or for the transfer hook program:
./scripts/upgrade-program-id.sh sss-2    # update programs/sss-2 and Anchor.toml
```

The script updates:

- `programs/sss-1/src/lib.rs` or `programs/sss-2/src/lib.rs` — `declare_id!(...)`
- `Anchor.toml` — the corresponding `sss_1` or `sss_2` program ID

**macOS vs Linux:** The script detects GNU sed and uses `sed -i` on Linux, `sed -i ''` on macOS. If you see sed errors, adjust the in-place flag in the script (see comment inside).

---

## 4. Build

```bash
anchor build
pnpm run build:sdk
```

---

## 5. Devnet config

```bash
solana config set --url devnet
solana config set --keypair wallets/authority.json   # or your payer
solana airdrop 2
```

---

## 6. Deploy

Deploy both programs (order does not matter):

```bash
anchor deploy --provider.cluster devnet
```

Or deploy one at a time by program name. After deploy, note the program IDs from the output or from `Anchor.toml` under `[programs.devnet]`.

---

## 7. Initialize and verify

Use the CLI or SDK to create a stablecoin (see [INTEGRATION.md](INTEGRATION.md) and [OPERATIONS.md](OPERATIONS.md)):

```bash
pnpm run cli init --preset sss-1 -n "My USD" -s MUSD --uri "https://example.com"
# Or sss-2 for compliant preset
pnpm run cli init --preset sss-2 -n "Regulated USD" -s RUSD --uri "https://example.com"
```

Verify on Explorer: open the mint address and confirm the stablecoin state account exists.

---

## Quick reference

| Step            | Command |
| --------------- | ------- |
| Update sss-1 ID | `./scripts/upgrade-program-id.sh sss-1` |
| Update sss-2 ID | `./scripts/upgrade-program-id.sh sss-2` |
| Build           | `anchor build && pnpm run build:sdk` |
| Deploy devnet   | `anchor deploy --provider.cluster devnet` |
| Init preset     | `pnpm run cli init --preset sss-1 -n Name -s SYM --uri ""` |

---

## Troubleshooting

- **Wrong program ID:** Ensure you ran `./scripts/upgrade-program-id.sh` **before** `anchor build`. Re-run the script and rebuild.
- **Cluster mismatch:** `solana config get` must show `devnet` if you deployed to devnet; RPC_URL and CLI must match.
- **Insufficient funds:** `solana airdrop 2` on devnet; use a faucet if needed.
- **Keypair not found:** Ensure `wallets/program-keypair.json` exists when running the upgrade script; ensure authority keypair path is set for deploy.
